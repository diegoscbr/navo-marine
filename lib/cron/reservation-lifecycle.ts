import type Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'
import { fulfillCheckoutSession } from '@/lib/stripe/webhook'

/**
 * Reservation lifecycle transitions used by the expiry sweep.
 *
 * History worth knowing before editing this file: the original pg_cron sweep
 * cancelled reservations customers had genuinely paid for. The webhook was
 * failing, so paid bookings sat at `reserved_unpaid`, and the sweep read them as
 * abandoned. It was unscheduled in migration 011 and stayed off for months.
 *
 * The rule that prevents a repeat: every write that moves a reservation away from
 * `reserved_unpaid` is a compare-and-swap. If the row is no longer
 * `reserved_unpaid` by the time we write, we lost a race with the webhook and we
 * back off completely rather than overwrite it.
 */

export type ExpiringHold = {
  id: string
  stripe_checkout_session_id: string | null
  unit_id: string | null
  user_id: string | null
}

export type CancelOutcome = 'cancelled' | 'skipped' | 'error'
export type RestoreOutcome = 'restored' | 'status_corrected' | 'error'

/**
 * Cancel one expired, verified-unpaid hold.
 *
 * Callers must confirm with Stripe that the session was not paid before calling.
 * Ordering is deliberate: flip the status under a guard first, and only release
 * inventory once that flip is known to have matched this row. A lost race
 * therefore frees nothing.
 */
export async function cancelExpiredHold(hold: ExpiringHold): Promise<CancelOutcome> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', hold.id)
    // Compare-and-swap. Removing this reintroduces the phantom-cancellation bug.
    .eq('status', 'reserved_unpaid')
    .select('id')

  if (error) {
    console.error(`[cron] cancel failed reservationId=${hold.id} error=${error.message}`)
    return 'error'
  }

  const matched = Array.isArray(data) ? data.length : 0
  if (matched === 0) {
    // The row moved on between our SELECT and this UPDATE — almost certainly a
    // webhook marking it paid. Leave every trace of it alone.
    console.warn(
      `[cron] cancel skipped reservationId=${hold.id} reason=status-changed-under-us`,
    )
    return 'skipped'
  }

  // Past this point the hold is definitively ours to unwind.
  const { error: unitsError } = await supabaseAdmin
    .from('reservation_units')
    .delete()
    .eq('reservation_id', hold.id)

  if (unitsError) {
    console.error(
      `[cron] reservation_units cleanup failed reservationId=${hold.id} error=${unitsError.message}`,
    )
  }

  if (hold.unit_id) {
    const { error: unitError } = await supabaseAdmin
      .from('units')
      .update({ status: 'available' })
      .eq('id', hold.unit_id)

    if (unitError) {
      console.error(
        `[cron] unit release failed unitId=${hold.unit_id} error=${unitError.message}`,
      )
    } else {
      await supabaseAdmin.from('unit_events').insert({
        unit_id: hold.unit_id,
        event_type: 'status_changed',
        from_status: 'reserved_unpaid',
        to_status: 'available',
        actor_type: 'system',
        notes: 'Hold expired and was verified unpaid in Stripe',
      })
    }
  }

  await supabaseAdmin.from('notifications').insert({
    user_id: hold.user_id,
    message: 'Your reservation expired. Book again anytime.',
    link: '/reserve',
  })

  console.log(`[cron] cancelled reservationId=${hold.id}`)
  return 'cancelled'
}

/**
 * Repair a hold that Stripe says was paid — the case the old sweep destroyed.
 *
 * Reuses the webhook's fulfiller so there is exactly one code path that turns a
 * paid session into a paid reservation plus an order. If an order already exists
 * we only correct the reservation status, so a partially-applied webhook cannot
 * produce a duplicate order.
 */
export async function restoreReservationAsPaid(
  hold: ExpiringHold,
  session: Stripe.Checkout.Session,
): Promise<RestoreOutcome> {
  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  if (existingOrder) {
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null

    const { error } = await supabaseAdmin
      .from('reservations')
      .update({
        status: 'reserved_paid',
        stripe_payment_intent_id: paymentIntentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hold.id)
      .eq('status', 'reserved_unpaid')
      .select('id')

    if (error) {
      console.error(
        `[cron] status correction failed reservationId=${hold.id} error=${error.message}`,
      )
      return 'error'
    }

    console.warn(
      `[cron] status corrected reservationId=${hold.id} orderId=${(existingOrder as { id: string }).id} ` +
        'reason=order-existed-but-reservation-was-unpaid',
    )
    return 'status_corrected'
  }

  const result = await fulfillCheckoutSession(session)
  if (!result.ok) {
    console.error(
      `[cron] restore failed reservationId=${hold.id} sessionId=${session.id} error=${result.error}`,
    )
    return 'error'
  }

  console.warn(
    `[cron] RESTORED a paid reservation the sweep would have cancelled ` +
      `reservationId=${hold.id} sessionId=${session.id} orderId=${result.orderId}`,
  )
  return 'restored'
}

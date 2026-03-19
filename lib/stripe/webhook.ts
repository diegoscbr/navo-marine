// lib/stripe/webhook.ts
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'

// ── Types ─────────────────────────────────────────────────────────────────

export type FulfillResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string }

// ── Order number generation ────────────────────────────────────────────────

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const suffix = Date.now().toString(36).toUpperCase().slice(-6)
  return `NAVO-${year}-${suffix}`
}

// ── Idempotency check ─────────────────────────────────────────────────────

export async function isEventAlreadyProcessed(stripeEventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('stripe_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle()
  return data !== null
}

// ── Log stripe event (call AFTER fulfillment to prevent retry-skipping) ──

export async function logStripeEvent(event: Stripe.Event): Promise<void> {
  await supabaseAdmin.from('stripe_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  })
}

// ── Fulfill checkout.session.completed ───────────────────────────────────

export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const sessionId = session.id
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  // 1. Find the reservation by stripe_checkout_session_id
  const { data: reservation, error: resErr } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, unit_id, total_cents, customer_email')
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (resErr || !reservation) {
    return { ok: false, error: `Reservation not found for session ${sessionId}` }
  }

  // 2. Update reservation to reserved_paid
  const { error: updateErr } = await supabaseAdmin
    .from('reservations')
    .update({
      status: 'reserved_paid',
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', (reservation as { id: string }).id)

  if (updateErr) {
    return { ok: false, error: `Failed to update reservation: ${updateErr.message}` }
  }

  // 3. Update unit status if a unit was assigned
  if ((reservation as { unit_id: string | null }).unit_id) {
    await supabaseAdmin
      .from('units')
      .update({ status: 'reserved_paid' })
      .eq('id', (reservation as { unit_id: string }).unit_id)
  }

  // 4. Create order record
  const orderNumber = generateOrderNumber()
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: (reservation as { user_id: string }).user_id,
      customer_email:
        (reservation as { customer_email: string }).customer_email ??
        session.customer_email ??
        '',
      reservation_id: (reservation as { id: string }).id,
      status: 'paid',
      subtotal_cents: (reservation as { total_cents: number }).total_cents,
      tax_cents: 0,
      total_cents: (reservation as { total_cents: number }).total_cents,
      currency: 'usd',
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
    })
    .select('id')
    .single()

  if (orderErr) {
    return { ok: false, error: `Failed to create order: ${orderErr.message}` }
  }

  return { ok: true, orderId: (order as { id: string }).id }
}

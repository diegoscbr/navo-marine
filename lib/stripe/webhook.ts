// lib/stripe/webhook.ts
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/gmail'
import { bookingConfirmed } from '@/lib/email/templates'

// ── Types ─────────────────────────────────────────────────────────────────

export type FulfillResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string }

// ── Order number generation ────────────────────────────────────────────────

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const suffix = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(-8)
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

function toShippingAddress(session: Stripe.Checkout.Session) {
  const details = session.collected_information?.shipping_details
  if (!details) return null

  return {
    name: details.name ?? null,
    line1: details.address?.line1 ?? null,
    line2: details.address?.line2 ?? null,
    city: details.address?.city ?? null,
    state: details.address?.state ?? null,
    zip: details.address?.postal_code ?? null,
    country: details.address?.country ?? null,
  }
}

// ── Fulfill checkout.session.completed ───────────────────────────────────

export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const sessionId = session.id
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  console.log(`[webhook] fulfill=start sessionId=${sessionId} paymentIntentId=${paymentIntentId ?? 'none'}`)

  // 1. Find the reservation by stripe_checkout_session_id
  const { data: reservation, error: resErr } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, unit_id, total_cents, customer_email, product_id, start_date, end_date')
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (resErr || !reservation) {
    const reason = resErr?.message ?? 'reservation row not found'
    console.error(`[webhook] fulfill=fail step=reservation-lookup sessionId=${sessionId} error=${reason}`)
    return { ok: false, error: `Reservation not found for session ${sessionId}` }
  }

  const reservationId = (reservation as { id: string }).id
  console.log(`[webhook] fulfill=lookup-ok reservationId=${reservationId}`)

  // 2. Update reservation to reserved_paid
  const { error: updateErr } = await supabaseAdmin
    .from('reservations')
    .update({
      status: 'reserved_paid',
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)

  if (updateErr) {
    console.error(`[webhook] fulfill=fail step=reservation-update reservationId=${reservationId} error=${updateErr.message}`)
    return { ok: false, error: `Failed to update reservation: ${updateErr.message}` }
  }

  // 3. Create order record (before unit update to minimize partial-failure window)
  const orderNumber = generateOrderNumber()
  const shippingAddress = toShippingAddress(session)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: (reservation as { user_id: string }).user_id,
      customer_email:
        (reservation as { customer_email: string }).customer_email ??
        session.customer_email ??
        '',
      reservation_id: reservationId,
      shipping_address: shippingAddress,
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
    console.error(`[webhook] fulfill=fail step=order-insert reservationId=${reservationId} error=${orderErr.message}`)
    return { ok: false, error: `Failed to create order: ${orderErr.message}` }
  }

  const orderId = (order as { id: string }).id
  console.log(`[webhook] fulfill=order-ok orderId=${orderId} orderNumber=${orderNumber}`)

  // 4. Update unit status if a unit was assigned (non-critical after order creation)
  if ((reservation as { unit_id: string | null }).unit_id) {
    const { error: unitErr } = await supabaseAdmin
      .from('units')
      .update({ status: 'reserved_paid' })
      .eq('id', (reservation as { unit_id: string }).unit_id)

    if (unitErr) {
      console.error(`[webhook] fulfill=warn step=unit-update unitId=${(reservation as { unit_id: string }).unit_id} error=${unitErr.message}`)
      // Non-fatal: order was already created, reservation is paid. Log and continue.
    }
  }

  // 5. Send booking confirmed email (fire-and-forget)
  const productId = (reservation as { product_id: string | null }).product_id
  const { data: productRow } = productId
    ? await supabaseAdmin.from('products').select('name').eq('id', productId).single()
    : { data: null }

  const confirmedEmail = bookingConfirmed({
    to:
      (reservation as { customer_email: string }).customer_email ??
      session.customer_email ??
      '',
    reservationId,
    orderId,
    productName: (productRow as { name: string } | null)?.name ?? 'NAVO Rental',
    startDate: (reservation as { start_date: string | null }).start_date ?? null,
    endDate: (reservation as { end_date: string | null }).end_date ?? null,
    totalCents: (reservation as { total_cents: number }).total_cents,
  })
  void sendEmail(confirmedEmail.to, confirmedEmail.subject, confirmedEmail.html)
    .catch((err) => console.error(`[webhook] fulfill=warn step=email-send error=${err}`))

  return { ok: true, orderId }
}

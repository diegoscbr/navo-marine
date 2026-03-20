import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getEventProduct } from '@/lib/db/events'
import { checkEventAvailability } from '@/lib/db/availability'
import { daysBetween } from '@/lib/utils/dates'

type RentalEventInput = {
  event_id: string
  product_id: string
  sail_number: string
  extra_days: number
}

type Session = {
  user: {
    id?: string | null
    email?: string | null
  }
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

export async function handleRentalEvent(
  input: RentalEventInput,
  session: Session,
  baseUrl: string,
): Promise<HandlerResult> {
  const { event_id, product_id, sail_number, extra_days } = input

  // 1. Look up event product
  const eventProduct = await getEventProduct(event_id, product_id)
  if (!eventProduct) {
    return { status: 404, body: { error: 'Event product not found' } }
  }

  // 2. Check availability
  const availability = await checkEventAvailability(event_id, product_id, eventProduct.capacity)
  if (!availability.available) {
    return {
      status: 409,
      body: { error: 'Sold out — no capacity remaining', availability },
    }
  }

  // 3. Compute total price
  // Use per-day pricing if available; fall back to flat rental_price_cents
  let totalCents: number
  if (eventProduct.rental_price_per_day_cents != null) {
    const eventDays = daysBetween(eventProduct.start_date, eventProduct.end_date)
    totalCents = eventProduct.rental_price_per_day_cents * (eventDays + extra_days)
  } else {
    totalCents = eventProduct.rental_price_cents
  }

  // 4. Create Stripe Checkout session (do this before any DB write)
  let stripeSession: { id: string; url: string | null }
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: 'Atlas 2 Rental — Event',
              description: `Sail #${sail_number}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: 'rental_event',
        product_id,
        event_id,
        sail_number,
        extra_days: String(extra_days),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    return {
      status: 503,
      body: { error: 'Payment service unavailable. Please try again.' },
    }
  }

  // 5. Insert reservation row
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'rental_event',
      product_id,
      event_id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      sail_number: sail_number.trim(),
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      extra_days,
      late_fee_applied: false,
      late_fee_cents: 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('Reservation insert failed:', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: (reservation as { id: string }).id,
    },
  }
}

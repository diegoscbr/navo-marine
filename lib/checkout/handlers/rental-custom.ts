import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getDateWindowProduct } from '@/lib/db/events'
import { checkWindowAvailability } from '@/lib/db/availability'
import { daysBetween } from '@/lib/utils/dates'
import { sendEmail } from '@/lib/email/gmail'
import { bookingPending } from '@/lib/email/templates'

type RentalCustomInput = {
  date_window_id: string
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

export async function handleRentalCustom(
  input: RentalCustomInput,
  session: Session,
  baseUrl: string,
): Promise<HandlerResult> {
  const { date_window_id, product_id, sail_number, extra_days } = input

  // 1. Look up date window product (allocation)
  const windowProduct = await getDateWindowProduct(date_window_id, product_id)
  if (!windowProduct) {
    return { status: 404, body: { error: 'Date window product not found' } }
  }

  // 2. Check availability
  const availability = await checkWindowAvailability(date_window_id, product_id, windowProduct.capacity)
  if (!availability.available) {
    return {
      status: 409,
      body: { error: 'Sold out — no capacity remaining', availability },
    }
  }

  // 3. Fetch product pricing and window dates in parallel
  const [productResult, windowResult] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('base_price_cents, price_per_day_cents')
      .eq('id', product_id)
      .single(),
    supabaseAdmin
      .from('date_windows')
      .select('start_date, end_date')
      .eq('id', date_window_id)
      .single(),
  ])

  const product = productResult.data as { base_price_cents: number; price_per_day_cents: number | null } | null
  const window = windowResult.data as { start_date: string; end_date: string } | null

  // 4. Compute total price
  // Use per-day pricing if available; fall back to base_price_cents
  let totalCents: number
  if (product?.price_per_day_cents != null && window != null) {
    const windowDays = daysBetween(window.start_date, window.end_date)
    totalCents = product.price_per_day_cents * (windowDays + extra_days)
  } else {
    totalCents = product?.base_price_cents ?? 0
  }

  // 5. Create Stripe Checkout session (do this before any DB write)
  let stripeSession: { id: string; url: string | null }
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      shipping_address_collection: { allowed_countries: ['US'] },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: 'Atlas 2 Rental — Custom Dates',
              description: `Sail #${sail_number}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: 'rental_custom',
        product_id,
        date_window_id,
        sail_number,
        extra_days: String(extra_days),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    return {
      status: 503,
      body: { error: 'Payment service unavailable. Please try again.' },
    }
  }

  // 6. Insert reservation row
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'rental_custom',
      product_id,
      date_window_id,
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

  const reservationId = (reservation as { id: string }).id

  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId,
    productName: 'Atlas 2 Rental',
    startDate: window?.start_date ?? null,
    endDate: window?.end_date ?? null,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (rental-custom) failed:', err))

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: reservationId,
    },
  }
}

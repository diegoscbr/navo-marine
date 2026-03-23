import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import {
  getPackageProductById,
  checkPackageAvailability,
  checkMultiUnitAvailability,
  insertReservationUnits,
} from '@/lib/db/packages'
import { daysBetween, isValidDate } from '@/lib/utils/dates'
import { sendEmail } from '@/lib/email/gmail'
import { bookingPending } from '@/lib/email/templates'

type RegattaPackageInput = {
  product_id: string
  start_date: string
  end_date: string
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

type UserSession = {
  user: { id?: string | null; email?: string | null }
}

export async function handleRegattaPackage(
  input: RegattaPackageInput,
  session: UserSession,
  baseUrl: string,
): Promise<HandlerResult> {
  // 1. Validate dates
  if (!isValidDate(input.start_date) || !isValidDate(input.end_date)) {
    return { status: 400, body: { error: 'Invalid date format. Use YYYY-MM-DD.' } }
  }

  if (new Date(input.end_date) < new Date(input.start_date)) {
    return { status: 400, body: { error: 'End date must be on or after start date.' } }
  }

  // 2. Load product (includes category guard — returns null if not regatta_management)
  const product = await getPackageProductById(input.product_id)
  if (!product) {
    return { status: 404, body: { error: 'Package product not found' } }
  }

  if (!product.price_per_day_cents || product.price_per_day_cents <= 0) {
    console.error('[checkout] regatta-package: invalid price', { product_id: input.product_id })
    return { status: 500, body: { error: 'Invalid product pricing configuration' } }
  }

  // 3. Past date check
  const todayStr = new Date().toISOString().split('T')[0]
  if (input.start_date < todayStr) {
    return { status: 400, body: { error: 'Start date cannot be in the past.' } }
  }

  // 3b. Advance booking check (e.g. RaceSense: 90-day minimum)
  if (product.min_advance_booking_days) {
    const today = new Date()
    const start = new Date(input.start_date + 'T12:00:00Z')
    const daysUntilStart = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilStart < product.min_advance_booking_days) {
      return {
        status: 400,
        body: {
          error: `Bookings require at least ${product.min_advance_booking_days} days advance notice. Your start date is only ${daysUntilStart} days away.`,
        },
      }
    }
  }

  // 4. Package capacity availability
  let availability
  try {
    availability = await checkPackageAvailability(
      product.id,
      input.start_date,
      input.end_date,
      product.capacity,
    )
  } catch (err) {
    console.error('[checkout] regatta-package: availability check failed', err)
    return { status: 503, body: { error: 'Availability check failed. Please try again.' } }
  }

  if (!availability.available) {
    return { status: 409, body: { error: 'This package is not available for the selected dates.', availability } }
  }

  // 5. Fleet unit availability (R/C WL Course needs 5× Atlas 2, others need tablet)
  if (product.atlas2_units_required > 0 || product.tablet_required) {
    let multiUnit
    try {
      multiUnit = await checkMultiUnitAvailability(
        product.id,
        input.start_date,
        input.end_date,
        product.atlas2_units_required,
        product.tablet_required,
      )
    } catch (err) {
      console.error('[checkout] regatta-package: multi-unit check failed', err)
      return { status: 503, body: { error: 'Unit availability check failed. Please try again.' } }
    }

    if (!multiUnit.available) {
      return { status: 409, body: { error: multiUnit.reason ?? 'Insufficient units for selected dates.' } }
    }
  }

  // 6. Calculate total
  const dayCount = daysBetween(input.start_date, input.end_date)
  const totalCents = dayCount * product.price_per_day_cents

  // 7. Stripe session
  const isHold = product.payment_mode === 'hold'

  console.log('[checkout] regatta_package', {
    product_id: product.id,
    slug: product.slug,
    days: dayCount,
    total_cents: totalCents,
    payment_mode: product.payment_mode,
  })

  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: product.name,
              description: `${dayCount} day${dayCount !== 1 ? 's' : ''} | ${input.start_date} to ${input.end_date}`,
            },
          },
          quantity: 1,
        },
      ],
      ...(isHold ? { payment_intent_data: { capture_method: 'manual' } } : {}),
      metadata: {
        reservation_type: 'regatta_package',
        product_id: product.id,
        start_date: input.start_date,
        end_date: input.end_date,
        payment_mode: product.payment_mode,
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/packages?checkout=cancelled`,
    })
  } catch (err) {
    console.error('[checkout] Stripe session creation failed (regatta-package):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  // 8. Insert reservation
  // Hold mode: expires_at = null (pg_cron skips null rows — prevents premature cancellation
  // during the 7-day Stripe hold window).
  // Capture mode: standard 24h expiry.
  const expiresAt = isHold ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'regatta_package',
      product_id: product.id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      start_date: input.start_date,
      end_date: input.end_date,
      extra_days: 0,
      late_fee_applied: false,
      late_fee_cents: 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('[checkout] reservation insert failed (regatta-package):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  const reservationId = (reservation as { id: string }).id

  // 9. Insert reservation_units for fleet-wide availability tracking
  await insertReservationUnits(reservationId, product.id, input.start_date, input.end_date)

  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId,
    productName: product.name,
    startDate: input.start_date,
    endDate: input.end_date,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (regatta-package) failed:', err))

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: reservationId,
    },
  }
}

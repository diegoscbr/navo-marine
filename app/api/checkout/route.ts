import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getEventProduct, getDateWindowProduct } from '@/lib/db/events'
import { checkEventAvailability, checkWindowAvailability } from '@/lib/db/availability'

type CheckoutBody = {
  reservation_type: 'rental_event' | 'rental_custom' | 'purchase'
  product_id: string
  event_id?: string
  date_window_id?: string
  sail_number?: string
  addons?: string[]
}

const VALID_TYPES = ['rental_event', 'rental_custom', 'purchase'] as const

export async function POST(req: NextRequest) {
  // 1. Auth check — any logged-in user
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Partial<CheckoutBody>

  // 2. Input validation
  if (!body.reservation_type || !VALID_TYPES.includes(body.reservation_type as typeof VALID_TYPES[number])) {
    return NextResponse.json(
      { error: 'reservation_type must be one of: rental_event, rental_custom, purchase' },
      { status: 400 },
    )
  }

  if (!body.product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  if (body.reservation_type === 'rental_event') {
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id is required for rental_event' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
  }

  if (body.reservation_type === 'rental_custom') {
    if (!body.date_window_id) {
      return NextResponse.json({ error: 'date_window_id is required for rental_custom' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
  }

  // 3. Look up pricing + check availability
  let totalCents: number
  const lateFeeCents = 0
  const lateFeeApplied = false

  if (body.reservation_type === 'rental_event') {
    const eventProduct = await getEventProduct(body.event_id!, body.product_id)
    if (!eventProduct) {
      return NextResponse.json({ error: 'Event product not found' }, { status: 404 })
    }

    const availability = await checkEventAvailability(
      body.event_id!,
      body.product_id,
      eventProduct.capacity,
    )
    if (!availability.available) {
      return NextResponse.json(
        { error: 'Sold out — no capacity remaining', availability },
        { status: 409 },
      )
    }

    totalCents = eventProduct.rental_price_cents
  } else if (body.reservation_type === 'rental_custom') {
    const windowProduct = await getDateWindowProduct(body.date_window_id!, body.product_id)
    if (!windowProduct) {
      return NextResponse.json({ error: 'Date window product not found' }, { status: 404 })
    }

    const availability = await checkWindowAvailability(
      body.date_window_id!,
      body.product_id,
      windowProduct.capacity,
    )
    if (!availability.available) {
      return NextResponse.json(
        { error: 'Sold out — no capacity remaining', availability },
        { status: 409 },
      )
    }

    // Custom window pricing: use base_price_cents from the product
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('base_price_cents')
      .eq('id', body.product_id)
      .single()

    totalCents = (product as { base_price_cents: number })?.base_price_cents ?? 0
  } else {
    // Purchase flow — handled in Phase 7
    return NextResponse.json({ error: 'Purchase flow not yet implemented' }, { status: 501 })
  }

  // 4. Create Stripe Checkout session FIRST — if this fails, no DB write
  const baseUrl = req.nextUrl.origin
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
              name: `Atlas 2 Rental — ${body.reservation_type === 'rental_event' ? 'Event' : 'Custom Dates'}`,
              description: body.sail_number ? `Sail #${body.sail_number}` : undefined,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: body.reservation_type,
        product_id: body.product_id,
        event_id: body.event_id ?? '',
        date_window_id: body.date_window_id ?? '',
        sail_number: body.sail_number ?? '',
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    return NextResponse.json(
      { error: 'Payment service unavailable. Please try again.' },
      { status: 503 },
    )
  }

  // 5. Insert reservation row — Stripe session succeeded, safe to write
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: body.reservation_type,
      product_id: body.product_id,
      event_id: body.event_id ?? null,
      date_window_id: body.date_window_id ?? null,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      sail_number: body.sail_number?.trim() ?? null,
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      late_fee_applied: lateFeeApplied,
      late_fee_cents: lateFeeCents,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('Reservation insert failed:', insertError)
    return NextResponse.json(
      { error: 'Failed to create reservation' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    url: stripeSession.url,
    reservation_id: (reservation as { id: string }).id,
  })
}

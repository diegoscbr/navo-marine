import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { sendEmail } from '@/lib/email/gmail'
import { paymentRequest } from '@/lib/email/templates'

const SHIPPING_TYPES = new Set(['rental_event', 'rental_custom', 'purchase'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch reservation
  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_email, status, reservation_type, product_id, user_id, total_cents, start_date, end_date, expires_at')
    .eq('id', id)
    .single()

  if (fetchError || !reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  const res = reservation as {
    id: string
    customer_email: string
    status: string
    reservation_type: string
    product_id: string
    user_id: string
    total_cents: number
    start_date: string | null
    end_date: string | null
    expires_at: string | null
  }

  if (res.status !== 'reserved_unpaid') {
    return NextResponse.json(
      { error: 'Invoice can only be sent for unpaid reservations' },
      { status: 409 },
    )
  }

  // Prevent re-sending while a previous invoice link is still active.
  // When an invoice is sent, expires_at is set to null. A null expires_at
  // on an unpaid reservation means an invoice was already sent and the
  // checkout session is still valid (24h Stripe default).
  if (res.expires_at === null) {
    return NextResponse.json(
      { error: 'An invoice has already been sent for this reservation. The customer can pay using the link in their email.' },
      { status: 409 },
    )
  }

  // Fetch product name
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('name')
    .eq('id', res.product_id)
    .single()

  const productName = (product as { name: string } | null)?.name ?? 'NAVO Product'
  const baseUrl = req.nextUrl.origin
  const needsShipping = SHIPPING_TYPES.has(res.reservation_type)

  // Create Stripe checkout session
  let stripeSession: { id: string; url: string | null }
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment' as const,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: res.total_cents,
            product_data: { name: productName },
          },
          quantity: 1,
        },
      ],
      ...(needsShipping
        ? { shipping_address_collection: { allowed_countries: ['US'] } }
        : {}),
      metadata: {
        reservation_type: res.reservation_type,
        product_id: res.product_id,
        user_id: res.user_id,
        customer_email: res.customer_email,
        sent_via: 'admin_invoice',
      },
      customer_email: res.customer_email,
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/`,
    })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    return NextResponse.json(
      { error: 'Payment service unavailable. Please try again.' },
      { status: 500 },
    )
  }

  // Update reservation with new checkout session and clear expires_at
  await supabaseAdmin
    .from('reservations')
    .update({
      stripe_checkout_session_id: stripeSession.id,
      expires_at: null,
    })
    .eq('id', id)

  // Send payment request email
  const email = paymentRequest({
    to: res.customer_email,
    reservationId: res.id,
    productName,
    startDate: res.start_date,
    endDate: res.end_date,
    totalCents: res.total_cents,
    paymentUrl: stripeSession.url ?? '',
  })
  void sendEmail(email.to, email.subject, email.html)
    .catch((err: unknown) => console.error('[email] paymentRequest failed:', err))

  return NextResponse.json({
    success: true,
    checkout_url: stripeSession.url,
  })
}

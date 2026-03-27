import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { storefrontProducts } from '@/lib/commerce/products'
import { sendEmail } from '@/lib/email/gmail'
import { bookingPending } from '@/lib/email/templates'

type PurchaseInput = {
  product_id: string      // storefront slug, e.g. 'atlas-2'
  quantity: number        // validated integer 1–8
  warranty_selected: boolean
}

type Session = {
  user: { id?: string | null; email?: string | null }
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

export async function handlePurchase(
  input: PurchaseInput,
  session: Session,
  baseUrl: string,
): Promise<HandlerResult> {
  const { product_id: slug, quantity, warranty_selected } = input

  // 1. Validate quantity (belt-and-suspenders; route also validates)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) {
    return { status: 400, body: { error: 'quantity must be an integer between 1 and 8' } }
  }

  // 2. Look up storefront product — server-side price only, never trust client
  const storefrontProduct = storefrontProducts.find((p) => p.slug === slug)
  if (!storefrontProduct) {
    return { status: 404, body: { error: 'Product not found' } }
  }

  // 3. Look up DB product UUID by slug
  const { data: dbProduct, error: dbErr } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('slug', slug)
    .single()

  if (dbErr || !dbProduct) {
    console.error('Product DB lookup failed:', dbErr)
    return { status: 404, body: { error: 'Product record not found' } }
  }

  // 4. Compute pricing server-side
  const warranty = storefrontProduct.addOns.find((a) => a.slug === 'vakaros-care-warranty')
  const warrantyPerUnit = warranty_selected && warranty ? warranty.priceCents : 0
  const totalCents = (storefrontProduct.pricing.amountCents + warrantyPerUnit) * quantity

  // 5. Build Stripe line items
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: 'usd',
        unit_amount: storefrontProduct.pricing.amountCents,
        product_data: { name: storefrontProduct.name },
      },
      quantity,
    },
  ]
  if (warranty_selected && warranty) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: warranty.priceCents,
        product_data: { name: warranty.name },
      },
      quantity,
    })
  }

  // 6. Create Stripe Checkout session (before any DB write)
  // SHIPPING RULE: All purchase flows (physical hardware shipped to customer) must include
  // shipping_address_collection. Rental/package flows do NOT need it.
  let stripeSession: { id: string; url: string | null }
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata: {
        reservation_type: 'purchase',
        product_id: (dbProduct as { id: string }).id,
        quantity: String(quantity),
        warranty_selected: String(warranty_selected),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/products/${slug}?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed (purchase):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  // 7. Insert reservation
  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'purchase',
      product_id: (dbProduct as { id: string }).id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      quantity,
      extra_days: 0,
      late_fee_applied: false,
      late_fee_cents: 0,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('Reservation insert failed (purchase):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  // 8. Fire-and-forget pending email
  const reservationId = (reservation as { id: string }).id
  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId,
    productName: storefrontProduct.name,
    startDate: null,
    endDate: null,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (purchase) failed:', err))

  return {
    status: 200,
    body: { url: stripeSession.url, reservation_id: reservationId },
  }
}

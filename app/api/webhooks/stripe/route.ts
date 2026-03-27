// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import {
  isEventAlreadyProcessed,
  logStripeEvent,
  fulfillCheckoutSession,
} from '@/lib/stripe/webhook'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body — required for Stripe signature verification
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // 2. Verify webhook signature
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    )
  }

  // 3. Idempotency — skip if already processed
  const alreadyProcessed = await isEventAlreadyProcessed(event.id)
  if (alreadyProcessed) {
    return NextResponse.json({ skipped: true })
  }

  // 4. Handle event types
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const result = await fulfillCheckoutSession(session)

      if (!result.ok) {
        console.error('fulfillCheckoutSession failed:', result.error)
        // Return 500 so Stripe retries the webhook
        // Do NOT log the event — prevents retry-skipping if fulfillment fails
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      // 5. Log AFTER fulfillment succeeds — prevents retry-skipping on partial failure
      await logStripeEvent(event)

      return NextResponse.json({ received: true, orderId: result.orderId })
    }

    default:
      // Log unhandled events for audit, then acknowledge
      await logStripeEvent(event)
      return NextResponse.json({ received: true })
  }
}

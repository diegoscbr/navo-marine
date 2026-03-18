# Phase 4 — Stripe Webhook Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Handle Stripe's `checkout.session.completed` webhook to flip a reservation from `reserved_unpaid` → `reserved_paid`, create an order record, and update unit status — closing the payment loop.

**Architecture:** A new `POST /api/webhooks/stripe` route verifies the Stripe signature, deduplicates via `stripe_events`, then delegates to a service function in `lib/stripe/webhook.ts`. The route stays thin; all business logic lives in the service for testability. `logStripeEvent` is called **after** successful fulfillment to prevent silent skips on retry after a 500.

**Tech Stack:** Next.js 16 App Router, Stripe SDK v20, Supabase (service role), TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/stripe/webhook.ts` | Business logic: fulfill reservation, create order, update unit |
| Create | `app/api/webhooks/stripe/route.ts` | Thin HTTP layer: verify signature, deduplicate, call service |
| Create | `__tests__/api/webhooks/stripe.test.ts` | Unit tests for the webhook handler |
| Read   | `lib/stripe/client.ts` | Confirm `stripe` export exists (no change expected) |
| Env    | `.env.local` + Vercel | Add `STRIPE_WEBHOOK_SECRET` |

**No schema migration needed** — `stripe_events`, `reservations`, `orders`, and `units` tables already exist with all required columns.

---

## Task 1: Verify stripe client + add STRIPE_WEBHOOK_SECRET

**Files:**
- Read: `lib/stripe/client.ts`
- Modify: `.env.local`

- [ ] **Step 1: Confirm lib/stripe/client.ts exports `stripe`**

  ```bash
  cat lib/stripe/client.ts
  ```
  Expected: a file exporting `const stripe = new Stripe(...)`. If it doesn't exist, create it:
  ```typescript
  // lib/stripe/client.ts
  import Stripe from 'stripe'

  export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  })
  ```

- [ ] **Step 2: Add STRIPE_WEBHOOK_SECRET placeholder to .env.local**

  Append to `.env.local`:
  ```
  STRIPE_WEBHOOK_SECRET="whsec_test_placeholder"
  ```
  This is replaced with the real value from Stripe CLI during local testing.

- [ ] **Step 3: Commit**

  ```bash
  git add .env.local
  git commit -m "chore: add STRIPE_WEBHOOK_SECRET placeholder to env"
  ```

---

## Task 2: Create the webhook service layer

**Files:**
- Create: `lib/stripe/webhook.ts`

**Can run in parallel with Task 3 (tests).**

- [ ] **Step 1: Create lib/stripe/webhook.ts**

  ```typescript
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
  ```

---

## Task 3: Write failing tests

**Files:**
- Create: `__tests__/api/webhooks/stripe.test.ts`

**Can run in parallel with Task 2.**

Note the `makeChain` pattern — this is the established project convention. Each `from()` call gets its own fresh chain via `mockReturnValueOnce`. Terminal methods (`single`, `maybeSingle`) return Promises. Update chains override `eq` to return a resolved Promise directly (since `update().eq()` is awaited without a terminal call like `.single()`).

- [ ] **Step 1: Create the test file**

  ```typescript
  /**
   * @jest-environment node
   */
  import { NextRequest } from 'next/server'

  // ── Mocks ────────────────────────────────────────────────────────────────

  jest.mock('@/lib/db/client', () => ({
    supabaseAdmin: { from: jest.fn() },
  }))

  jest.mock('@/lib/stripe/client', () => ({
    stripe: {
      webhooks: {
        constructEvent: jest.fn(),
      },
    },
  }))

  const { supabaseAdmin } = require('@/lib/db/client') as {
    supabaseAdmin: { from: jest.Mock }
  }
  const { stripe } = require('@/lib/stripe/client') as {
    stripe: { webhooks: { constructEvent: jest.Mock } }
  }

  // ── Chain factory (matches project convention from checkout.test.ts) ──────
  //
  // makeChain returns a fresh object per from() call.
  // Chainable methods (select, insert, update, eq) return the same chain.
  // Terminal methods (single, maybeSingle) return resolved Promises.
  //
  // For update chains: override `eq` with mockResolvedValue so that
  // `await from().update().eq()` resolves to { error: null }.

  function makeChain(overrides: Record<string, unknown> = {}) {
    const chain: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    // Apply overrides — these replace the defaults above
    Object.assign(chain, overrides)
    // Re-wire chainable methods to return the chain (after overrides applied)
    for (const key of ['select', 'insert', 'update', 'eq']) {
      if (!overrides[key]) {
        chain[key] = jest.fn().mockReturnValue(chain)
      }
    }
    return chain
  }

  // ── Fixtures ──────────────────────────────────────────────────────────────

  const SESSION_ID = 'cs_test_abc123'
  const PAYMENT_INTENT_ID = 'pi_test_def456'
  const RESERVATION_ID = 'res-uuid-001'
  const USER_ID = 'user-uuid-001'

  function makeCompletedSession(overrides = {}) {
    return {
      id: SESSION_ID,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: PAYMENT_INTENT_ID,
      customer_email: 'sailor@test.com',
      amount_total: 24500,
      // Only include keys the actual checkout route sets in metadata
      metadata: {
        reservation_type: 'rental_event',
        product_id: 'prod-uuid-001',
        event_id: 'event-uuid-001',
        date_window_id: '',
        sail_number: 'USA-1234',
        user_id: USER_ID,
        customer_email: 'sailor@test.com',
      },
      ...overrides,
    }
  }

  function makeStripeEvent(type: string, data: object) {
    return { id: 'evt_test_001', type, data: { object: data } }
  }

  function makeRequest(body: string, sig = 'valid-sig'): NextRequest {
    return new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': sig },
    })
  }

  // ── DB call order for happy path (no unit_id) ────────────────────────────
  // 1. stripe_events.select().eq().maybeSingle()   — idempotency check (not seen)
  // 2. reservations.select().eq().single()          — find reservation
  // 3. reservations.update().eq()                   — flip to reserved_paid (awaited directly)
  // 4. orders.insert().select().single()            — create order
  // 5. stripe_events.insert()                       — log event (after fulfillment)

  function setupHappyPath(unitId: string | null = null) {
    supabaseAdmin.from
      // 1. stripe_events check — not seen before (data: null)
      .mockReturnValueOnce(makeChain({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }))
      // 2. reservations select
      .mockReturnValueOnce(makeChain({
        single: jest.fn().mockResolvedValue({
          data: { id: RESERVATION_ID, user_id: USER_ID, unit_id: unitId, total_cents: 24500, customer_email: 'sailor@test.com' },
          error: null,
        }),
      }))
      // 3. reservations update — eq is terminal (awaited directly)
      .mockReturnValueOnce(makeChain({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }))
      // 4. orders insert → select → single
      .mockReturnValueOnce(makeChain({
        single: jest.fn().mockResolvedValue({ data: { id: 'order-001' }, error: null }),
      }))
      // 5. stripe_events insert (log event) — no terminal needed
      .mockReturnValueOnce(makeChain())

    if (unitId) {
      // Insert units.update().eq() between steps 3 and 4
      // Re-mock to accommodate the extra call
      supabaseAdmin.from.mockReset()
      supabaseAdmin.from
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: { id: RESERVATION_ID, user_id: USER_ID, unit_id: unitId, total_cents: 24500, customer_email: 'sailor@test.com' }, error: null }) }))
        .mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })) // reservations update
        .mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })) // units update
        .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: { id: 'order-001' }, error: null }) }))
        .mockReturnValueOnce(makeChain()) // stripe_events log
    }
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  beforeEach(() => jest.clearAllMocks())

  describe('POST /api/webhooks/stripe', () => {
    describe('signature verification', () => {
      it('returns 400 when stripe-signature header is missing', async () => {
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const req = new NextRequest('http://localhost/api/webhooks/stripe', {
          method: 'POST',
          body: '{}',
        })
        const res = await POST(req)
        expect(res.status).toBe(400)
      })

      it('returns 400 when signature verification fails', async () => {
        stripe.webhooks.constructEvent.mockImplementation(() => {
          throw new Error('Signature mismatch')
        })
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const res = await POST(makeRequest('{}', 'bad-sig'))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toMatch(/signature/i)
      })
    })

    describe('idempotency', () => {
      it('returns 200 with skipped:true for already-seen event', async () => {
        stripe.webhooks.constructEvent.mockReturnValue(
          makeStripeEvent('checkout.session.completed', makeCompletedSession())
        )
        // stripe_events check returns an existing row
        supabaseAdmin.from.mockReturnValueOnce(
          makeChain({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'seen' }, error: null }),
          })
        )

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const res = await POST(makeRequest('{}'))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.skipped).toBe(true)
      })
    })

    describe('checkout.session.completed', () => {
      beforeEach(() => {
        stripe.webhooks.constructEvent.mockReturnValue(
          makeStripeEvent('checkout.session.completed', makeCompletedSession())
        )
      })

      it('returns 200 on success', async () => {
        setupHappyPath()
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const res = await POST(makeRequest('{}'))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.received).toBe(true)
        expect(body.orderId).toBe('order-001')
      })

      it('queries reservations by stripe_checkout_session_id', async () => {
        setupHappyPath()
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        await POST(makeRequest('{}'))
        const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
        expect(calls).toContain('reservations')
      })

      it('creates an orders row', async () => {
        setupHappyPath()
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        await POST(makeRequest('{}'))
        const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
        expect(calls).toContain('orders')
      })

      it('logs the event to stripe_events after fulfillment', async () => {
        setupHappyPath()
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        await POST(makeRequest('{}'))
        const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
        // stripe_events appears twice: check + log
        expect(calls.filter((c: string) => c === 'stripe_events').length).toBe(2)
        // Log call must come after orders call
        const ordersIdx = calls.lastIndexOf('orders')
        const eventsLogIdx = calls.lastIndexOf('stripe_events')
        expect(eventsLogIdx).toBeGreaterThan(ordersIdx)
      })

      it('updates unit status to reserved_paid when unit_id is set', async () => {
        setupHappyPath('unit-uuid-001')
        const { POST } = await import('@/app/api/webhooks/stripe/route')
        await POST(makeRequest('{}'))
        const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
        expect(calls).toContain('units')
      })

      it('returns 500 when reservation is not found', async () => {
        stripe.webhooks.constructEvent.mockReturnValue(
          makeStripeEvent('checkout.session.completed', makeCompletedSession())
        )
        supabaseAdmin.from
          .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
          .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST116' } }) }))

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const res = await POST(makeRequest('{}'))
        expect(res.status).toBe(500)
      })
    })

    describe('unhandled event types', () => {
      it('returns 200 without processing', async () => {
        stripe.webhooks.constructEvent.mockReturnValue(
          makeStripeEvent('customer.created', {})
        )
        supabaseAdmin.from
          .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
          .mockReturnValueOnce(makeChain()) // logStripeEvent

        const { POST } = await import('@/app/api/webhooks/stripe/route')
        const res = await POST(makeRequest('{}'))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.received).toBe(true)
      })
    })
  })
  ```

- [ ] **Step 2: Run tests — confirm they fail with "module not found"**

  ```bash
  npx jest --testPathPattern=webhooks/stripe --no-coverage
  ```
  Expected: `Cannot find module '@/app/api/webhooks/stripe/route'`

---

## Task 4: Create the webhook route + make tests pass

**Files:**
- Create: `app/api/webhooks/stripe/route.ts`

**Depends on Tasks 2 and 3.**

- [ ] **Step 1: Create the route**

  ```typescript
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

        // 5. Log AFTER fulfillment — prevents retry-skipping if fulfillment fails
        await logStripeEvent(event)

        if (!result.ok) {
          console.error('fulfillCheckoutSession failed:', result.error)
          // Return 500 so Stripe retries the webhook
          return NextResponse.json({ error: result.error }, { status: 500 })
        }
        return NextResponse.json({ received: true, orderId: result.orderId })
      }

      default:
        // Log unhandled events for audit, then acknowledge
        await logStripeEvent(event)
        return NextResponse.json({ received: true })
    }
  }
  ```

- [ ] **Step 2: Run the webhook tests**

  ```bash
  npx jest --testPathPattern=webhooks/stripe --no-coverage
  ```
  Expected: All tests pass. If any fail, check the `from()` call order in `setupHappyPath` matches the actual implementation call order.

- [ ] **Step 3: Run full test suite**

  ```bash
  npm test -- --no-coverage
  ```
  Expected: All tests pass. No regressions.

- [ ] **Step 4: Commit**

  ```bash
  git add lib/stripe/webhook.ts app/api/webhooks/stripe/route.ts __tests__/api/webhooks/stripe.test.ts
  git commit -m "feat(webhook): add Stripe checkout.session.completed handler"
  ```

---

## Task 5: Test locally with Stripe CLI

**Instructional — run these to verify end-to-end.**

- [ ] **Step 1: Install Stripe CLI if not installed**

  ```bash
  brew install stripe/stripe-cli/stripe
  stripe login
  ```

- [ ] **Step 2: Forward webhooks to local dev server**

  In a separate terminal:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```
  Copy the `whsec_test_...` signing secret it prints.

- [ ] **Step 3: Update .env.local with the real webhook secret**

  ```
  STRIPE_WEBHOOK_SECRET="whsec_test_<value from stripe listen>"
  ```

- [ ] **Step 4: Start dev server and complete a test checkout**

  ```bash
  npm run dev
  ```
  Go to `http://localhost:3000/reserve`, select an event, submit. Use test card `4242 4242 4242 4242`.

- [ ] **Step 5: Verify in Supabase dashboard**

  At https://supabase.com/dashboard/project/fdjuhjadjqkpqnpxgmue:
  - `reservations`: `status = 'reserved_paid'`, `stripe_payment_intent_id` populated
  - `orders`: new row linked to the reservation, `status = 'paid'`
  - `stripe_events`: `checkout.session.completed` event logged

- [ ] **Step 6: Test idempotency — resend the same event**

  ```bash
  stripe events resend evt_<id from Stripe dashboard>
  ```
  Expected: webhook returns `{ skipped: true }`, no duplicate order.

- [ ] **Step 7: Commit env update**

  ```bash
  git add .env.local
  git commit -m "chore: set STRIPE_WEBHOOK_SECRET for local webhook testing"
  ```

  **Reminder:** Add `STRIPE_WEBHOOK_SECRET` to Vercel environment variables (Preview + Production) with the production webhook endpoint secret from the Stripe dashboard → Webhooks section.

---

## Coverage Check

- [ ] **Run with coverage:**

  ```bash
  npm test -- --coverage --testPathPattern=webhooks
  ```
  Expected: `lib/stripe/webhook.ts` and `app/api/webhooks/stripe/route.ts` ≥ 80% line coverage.

---

## Phase Gate — Definition of Done

- [ ] `POST /api/webhooks/stripe` rejects missing signature header (400)
- [ ] Invalid signature returns 400
- [ ] Duplicate events return `{ skipped: true }` (idempotency)
- [ ] `checkout.session.completed` flips reservation to `reserved_paid`
- [ ] `stripe_payment_intent_id` stored on the reservation
- [ ] `orders` row created with `status = 'paid'` and correct totals
- [ ] Unit status updated to `reserved_paid` when `unit_id` is set
- [ ] `stripe_events` logged AFTER fulfillment (not before)
- [ ] All webhook tests pass
- [ ] Full test suite passes (no regressions)
- [ ] Stripe CLI end-to-end test confirmed
- [ ] `STRIPE_WEBHOOK_SECRET` added to Vercel env vars

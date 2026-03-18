# Phase 4: Webhooks + Expiry + Unit Assignment

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the payment lifecycle: Stripe webhooks confirm payment and create orders, pg_cron expires unpaid reservations, and admins can assign physical units to paid reservations.

**Architecture:** A `POST /api/stripe/webhook` route verifies Stripe signatures, deduplicates via the `stripe_events` table, and processes `checkout.session.completed` by: (1) updating the reservation to `reserved_paid`, (2) inserting an order + order_items, (3) inserting into `stripe_events` as the commit flag (always last). A `lib/db/reservations.ts` repository serves admin reservation queries. An assignment endpoint validates unit availability before linking a unit to a paid reservation. The pg_cron expiry function was deployed in the Phase 1 migration — this phase adds a migration to enable the `pg_cron` extension if not already enabled.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `app/api/stripe/webhook/route.ts` | POST: verify sig, dedupe, update reservation + create order |
| Create | `lib/db/reservations.ts` | Repository: list/get reservations for admin |
| Create | `lib/db/orders.ts` | Repository: create order from webhook data |
| Create | `app/api/admin/reservations/route.ts` | GET: list all reservations (admin) |
| Create | `app/api/admin/reservations/[id]/route.ts` | GET: single reservation detail |
| Create | `app/api/admin/reservations/[id]/assign/route.ts` | PATCH: assign unit to paid reservation |
| Create | `app/admin/reservations/page.tsx` | Admin reservation list page |
| Create | `app/admin/reservations/[id]/page.tsx` | Admin reservation detail page |
| Create | `app/admin/reservations/[id]/AssignUnitForm.tsx` | Client component: assign unit form |
| Modify | `app/admin/layout.tsx` | Add Reservations link to sidebar |
| Create | `supabase/migrations/004_pg_cron_enable.sql` | Enable pg_cron extension (if not done via dashboard) |
| Create | `__tests__/api/stripe-webhook.test.ts` | Unit tests for webhook |
| Create | `__tests__/api/admin/reservations.test.ts` | Unit tests for reservation admin routes |
| Create | `__tests__/lib/db/reservations.test.ts` | Unit tests for reservations repository |

---

## Task 0: Reservations Repository (`lib/db/reservations.ts`)

**Files:**
- Create: `lib/db/reservations.ts`
- Create: `__tests__/lib/db/reservations.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/db/reservations.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (key !== 'single' && key !== 'order' && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  if (!overrides['order']) {
    chain.order = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('listReservations', () => {
  it('returns all reservations ordered by created_at desc', async () => {
    const mockData = [
      { id: 'res-1', status: 'reserved_paid', customer_email: 'a@b.com' },
      { id: 'res-2', status: 'reserved_unpaid', customer_email: 'c@d.com' },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listReservations } = await import('@/lib/db/reservations')
    const result = await listReservations()
    expect(result).toHaveLength(2)
  })

  it('filters by status when provided', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listReservations } = await import('@/lib/db/reservations')
    await listReservations({ status: 'reserved_paid' })
    expect(chain.eq).toHaveBeenCalledWith('status', 'reserved_paid')
  })
})

describe('getReservation', () => {
  it('returns a single reservation with relations', async () => {
    const mockRes = {
      id: 'res-1',
      status: 'reserved_paid',
      customer_email: 'a@b.com',
      products: { name: 'Atlas 2' },
      units: { navo_number: 'NAVO-001' },
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockRes, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getReservation } = await import('@/lib/db/reservations')
    const result = await getReservation('res-1')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('res-1')
  })

  it('returns null when not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getReservation } = await import('@/lib/db/reservations')
    const result = await getReservation('nonexistent')
    expect(result).toBeNull()
  })
})

describe('updateReservationStatus', () => {
  it('updates status and returns updated row', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-1', status: 'reserved_paid' },
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { updateReservationStatus } = await import('@/lib/db/reservations')
    const result = await updateReservationStatus('res-1', 'reserved_paid')
    expect(result.status).toBe('reserved_paid')
  })
})
```

```bash
npx jest --testPathPattern=lib/db/reservations --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/db/reservations.ts
import { supabaseAdmin } from '@/lib/db/client'

// ── Types ──────────────────────────────────────────────────────────────────

export type ReservationRow = {
  id: string
  reservation_type: string
  product_id: string
  unit_id: string | null
  event_id: string | null
  date_window_id: string | null
  user_id: string
  customer_email: string
  sail_number: string | null
  status: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  total_cents: number
  late_fee_applied: boolean
  late_fee_cents: number
  expires_at: string | null
  created_at: string
  updated_at: string
  // Joined relations (optional, depends on select)
  products?: { name: string; slug: string } | null
  units?: { navo_number: string; status: string } | null
  rental_events?: { name: string; location: string; start_date: string; end_date: string } | null
}

export type ReservationFilters = {
  status?: string
  user_id?: string
}

// ── Queries ────────────────────────────────────────────────────────────────

const RESERVATION_SELECT = `
  *,
  products ( name, slug ),
  units ( navo_number, status ),
  rental_events ( name, location, start_date, end_date )
`

export async function listReservations(
  filters: ReservationFilters = {},
): Promise<ReservationRow[]> {
  let query = supabaseAdmin
    .from('reservations')
    .select(RESERVATION_SELECT)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw new Error(`listReservations: ${error.message}`)
  return data as unknown as ReservationRow[]
}

export async function getReservation(
  id: string,
): Promise<ReservationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getReservation: ${error.message}`)
  }
  return data as unknown as ReservationRow
}

export async function updateReservationStatus(
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<ReservationRow> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(`updateReservationStatus: ${error.message}`)
  return data as unknown as ReservationRow
}

export async function getReservationByCheckoutSession(
  sessionId: string,
): Promise<ReservationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getReservationByCheckoutSession: ${error.message}`)
  }
  return data as unknown as ReservationRow
}
```

```bash
npx jest --testPathPattern=lib/db/reservations --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/reservations.ts __tests__/lib/db/reservations.test.ts
git commit -m "feat(db): add reservations repository — list, get, update status"
```

---

## Task 1: Orders Repository (`lib/db/orders.ts`)

**Files:**
- Create: `lib/db/orders.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/db/orders.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (key !== 'single' && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('createOrderFromCheckout', () => {
  it('inserts order and order_items', async () => {
    const orderChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'ord-1', order_number: 'NVO-2026-0001' },
        error: null,
      }),
    })
    const itemsChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(orderChain) // orders insert
      .mockReturnValueOnce(itemsChain) // order_items insert

    const { createOrderFromCheckout } = await import('@/lib/db/orders')
    const result = await createOrderFromCheckout({
      reservationId: 'res-1',
      userId: 'user-1',
      customerEmail: 'a@b.com',
      totalCents: 15000,
      stripeCheckoutSessionId: 'cs_test_123',
      stripePaymentIntentId: 'pi_test_123',
      items: [
        { itemType: 'rental', referenceId: 'prod-1', title: 'Atlas 2 Rental', unitPriceCents: 15000, quantity: 1 },
      ],
    })

    expect(result.id).toBe('ord-1')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('orders')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('order_items')
  })
})
```

```bash
npx jest --testPathPattern=lib/db/orders --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/db/orders.ts
import { supabaseAdmin } from '@/lib/db/client'

export type OrderItemInput = {
  itemType: string
  referenceId: string
  title: string
  unitPriceCents: number
  quantity: number
  metadata?: Record<string, unknown>
}

export type CreateOrderInput = {
  reservationId: string
  userId: string
  customerEmail: string
  totalCents: number
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string
  items: OrderItemInput[]
  shippingAddress?: Record<string, unknown>
}

export type OrderRow = {
  id: string
  order_number: string
  user_id: string | null
  customer_email: string
  reservation_id: string | null
  status: string
  subtotal_cents: number
  tax_cents: number
  total_cents: number
  currency: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
}

function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, '0')
  return `NVO-${year}-${random}`
}

export async function createOrderFromCheckout(
  input: CreateOrderInput,
): Promise<OrderRow> {
  const orderNumber = generateOrderNumber()

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: input.userId,
      customer_email: input.customerEmail,
      reservation_id: input.reservationId,
      shipping_address: input.shippingAddress ?? null,
      status: 'paid',
      subtotal_cents: input.totalCents,
      tax_cents: 0,
      total_cents: input.totalCents,
      currency: 'usd',
      stripe_checkout_session_id: input.stripeCheckoutSessionId,
      stripe_payment_intent_id: input.stripePaymentIntentId,
    })
    .select('*')
    .single()

  if (orderError) throw new Error(`createOrderFromCheckout: ${orderError.message}`)
  const orderId = (order as OrderRow).id

  // Insert order items
  const itemRows = input.items.map((item) => ({
    order_id: orderId,
    item_type: item.itemType,
    reference_id: item.referenceId,
    title_snapshot: item.title,
    unit_price_cents: item.unitPriceCents,
    quantity: item.quantity,
    metadata_snapshot: item.metadata ?? {},
  }))

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(itemRows)

    if (itemsError) throw new Error(`createOrderFromCheckout items: ${itemsError.message}`)
  }

  return order as unknown as OrderRow
}
```

```bash
npx jest --testPathPattern=lib/db/orders --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/orders.ts __tests__/lib/db/orders.test.ts
git commit -m "feat(db): add orders repository — createOrderFromCheckout"
```

---

## Task 2: Stripe Webhook Route

**CRITICAL:** This is the most important route for payment integrity.

Write order:
1. UPDATE reservation → `reserved_paid`
2. INSERT order + order_items
3. INSERT stripe_events (commit flag — ALWAYS LAST)

Pre-check: if reservation is already `reserved_paid`, return 200 immediately (idempotent).

**Files:**
- Create: `app/api/stripe/webhook/route.ts`
- Create: `__tests__/api/stripe-webhook.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/stripe-webhook.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

// Mock Stripe constructor to return our mock
const mockConstructEvent = jest.fn()
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  }))
})

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/db/reservations', () => ({
  getReservationByCheckoutSession: jest.fn(),
  updateReservationStatus: jest.fn(),
}))
jest.mock('@/lib/db/orders', () => ({
  createOrderFromCheckout: jest.fn(),
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { getReservationByCheckoutSession, updateReservationStatus } =
  require('@/lib/db/reservations') as {
    getReservationByCheckoutSession: jest.Mock
    updateReservationStatus: jest.Mock
  }
const { createOrderFromCheckout } = require('@/lib/db/orders') as {
  createOrderFromCheckout: jest.Mock
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (!['single', 'maybeSingle'].includes(key) && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

function makeWebhookRequest(body: string) {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': 'sig_test' },
  })
}

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const { POST } = await import('@/app/api/stripe/webhook/route')
    const res = await POST(makeWebhookRequest('{}'))
    expect(res.status).toBe(400)
  })

  it('returns 200 and skips already-processed events (dedupe)', async () => {
    const event = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', payment_intent: 'pi_test_123', metadata: {} } },
    }
    mockConstructEvent.mockReturnValue(event)

    // stripe_events check returns existing row (already processed)
    const dedupeChain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(dedupeChain)

    const { POST } = await import('@/app/api/stripe/webhook/route')
    const res = await POST(makeWebhookRequest(JSON.stringify(event)))
    expect(res.status).toBe(200)
  })

  it('processes checkout.session.completed: updates reservation, creates order, inserts stripe_event', async () => {
    const event = {
      id: 'evt_456',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_456',
          payment_intent: 'pi_test_456',
          metadata: {
            reservation_type: 'rental_event',
            product_id: 'prod-1',
            event_id: 'evt-1',
            sail_number: 'USA-123',
            user_id: 'user-1',
            customer_email: 'a@b.com',
          },
          amount_total: 15000,
        },
      },
    }
    mockConstructEvent.mockReturnValue(event)

    // No duplicate
    const dedupeChain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    // stripe_events insert (commit flag)
    const commitChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'se-1' }, error: null }),
    })

    supabaseAdmin.from
      .mockReturnValueOnce(dedupeChain)  // dedupe check
      .mockReturnValueOnce(commitChain)  // stripe_events insert

    getReservationByCheckoutSession.mockResolvedValue({
      id: 'res-1',
      status: 'reserved_unpaid',
      product_id: 'prod-1',
      total_cents: 15000,
      user_id: 'user-1',
      customer_email: 'a@b.com',
    })
    updateReservationStatus.mockResolvedValue({
      id: 'res-1',
      status: 'reserved_paid',
    })
    createOrderFromCheckout.mockResolvedValue({
      id: 'ord-1',
      order_number: 'NVO-2026-0001',
    })

    const { POST } = await import('@/app/api/stripe/webhook/route')
    const res = await POST(makeWebhookRequest(JSON.stringify(event)))

    expect(res.status).toBe(200)
    // Verify write order: (1) reservation update, (2) order create, (3) stripe_events
    expect(updateReservationStatus).toHaveBeenCalledWith('res-1', 'reserved_paid', expect.objectContaining({
      stripe_payment_intent_id: 'pi_test_456',
    }))
    expect(createOrderFromCheckout).toHaveBeenCalled()
    expect(supabaseAdmin.from).toHaveBeenCalledWith('stripe_events')
  })

  it('returns 200 if reservation already reserved_paid (idempotent)', async () => {
    const event = {
      id: 'evt_789',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_789',
          payment_intent: 'pi_test_789',
          metadata: {},
          amount_total: 15000,
        },
      },
    }
    mockConstructEvent.mockReturnValue(event)

    const dedupeChain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(dedupeChain)

    getReservationByCheckoutSession.mockResolvedValue({
      id: 'res-1',
      status: 'reserved_paid', // Already paid
    })

    const { POST } = await import('@/app/api/stripe/webhook/route')
    const res = await POST(makeWebhookRequest(JSON.stringify(event)))
    expect(res.status).toBe(200)
    expect(updateReservationStatus).not.toHaveBeenCalled()
  })
})
```

```bash
npx jest --testPathPattern=stripe-webhook --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'
import {
  getReservationByCheckoutSession,
  updateReservationStatus,
} from '@/lib/db/reservations'
import { createOrderFromCheckout } from '@/lib/db/orders'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  // 1. Verify Stripe signature
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Deduplicate via stripe_events table
  const { data: existing } = await supabaseAdmin
    .from('stripe_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing) {
    // Already processed — return 200 to stop Stripe retrying
    return NextResponse.json({ received: true, duplicate: true })
  }

  // 3. Handle event types
  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(event)
  }

  // Acknowledge receipt for unhandled event types
  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session
  const checkoutSessionId = session.id
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

  // Find the reservation by checkout session ID
  const reservation = await getReservationByCheckoutSession(checkoutSessionId)

  if (!reservation) {
    console.error(`Webhook: no reservation found for checkout session ${checkoutSessionId}`)
    return
  }

  // Pre-check: if already paid, skip (idempotent)
  if (reservation.status === 'reserved_paid') {
    console.log(`Webhook: reservation ${reservation.id} already reserved_paid, skipping`)
    return
  }

  // === Write Order ===
  // (1) UPDATE reservation → reserved_paid
  await updateReservationStatus(reservation.id, 'reserved_paid', {
    stripe_payment_intent_id: paymentIntentId,
  })

  // (2) INSERT order + order_items
  const metadata = session.metadata ?? {}
  await createOrderFromCheckout({
    reservationId: reservation.id,
    userId: reservation.user_id,
    customerEmail: reservation.customer_email,
    totalCents: reservation.total_cents,
    stripeCheckoutSessionId: checkoutSessionId,
    stripePaymentIntentId: paymentIntentId ?? '',
    items: [
      {
        itemType: metadata.reservation_type ?? 'rental',
        referenceId: reservation.product_id,
        title: `Atlas 2 — ${metadata.reservation_type === 'rental_event' ? 'Event Rental' : 'Custom Rental'}`,
        unitPriceCents: reservation.total_cents,
        quantity: 1,
        metadata: { sail_number: metadata.sail_number, event_id: metadata.event_id },
      },
    ],
  })

  // (3) INSERT stripe_events — COMMIT FLAG (always last!)
  const { error: commitError } = await supabaseAdmin
    .from('stripe_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
    })

  if (commitError) {
    console.error('Failed to insert stripe_event commit flag:', commitError)
    // Do NOT throw — the reservation and order are already written.
    // The duplicate check will prevent re-processing on retry.
  }
}

// Note: No `export const config` needed — this is App Router.
// Raw body is read via `req.text()` above. The Pages Router `api.bodyParser: false` pattern does not apply here.
```

```bash
npx jest --testPathPattern=stripe-webhook --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts __tests__/api/stripe-webhook.test.ts
git commit -m "feat(api): add Stripe webhook — checkout.session.completed handler"
```

---

## Task 3: Admin Reservation API Routes

**Files:**
- Create: `app/api/admin/reservations/route.ts`
- Create: `app/api/admin/reservations/[id]/route.ts`
- Create: `app/api/admin/reservations/[id]/assign/route.ts`
- Create: `__tests__/api/admin/reservations.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/admin/reservations.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/db/reservations', () => ({
  listReservations: jest.fn(),
  getReservation: jest.fn(),
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { listReservations, getReservation } = require('@/lib/db/reservations') as {
  listReservations: jest.Mock
  getReservation: jest.Mock
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (!['single', 'maybeSingle'].includes(key) && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

const adminSession = { user: { id: 'admin-1', email: 'admin@navomarine.com' } }

beforeEach(() => jest.clearAllMocks())

describe('GET /api/admin/reservations', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { GET } = await import('@/app/api/admin/reservations/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reservations'))
    expect(res.status).toBe(401)
  })

  it('returns reservations list', async () => {
    auth.mockResolvedValueOnce(adminSession)
    listReservations.mockResolvedValueOnce([
      { id: 'res-1', status: 'reserved_paid' },
    ])
    const { GET } = await import('@/app/api/admin/reservations/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/reservations'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.reservations).toHaveLength(1)
  })
})

describe('PATCH /api/admin/reservations/[id]/assign', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
    const req = new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
      method: 'PATCH',
      body: JSON.stringify({ unit_id: 'unit-1' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 when reservation is not reserved_paid', async () => {
    auth.mockResolvedValueOnce(adminSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      status: 'reserved_unpaid',
    })
    const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
    const req = new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
      method: 'PATCH',
      body: JSON.stringify({ unit_id: 'unit-1' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when unit is not available', async () => {
    auth.mockResolvedValueOnce(adminSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      status: 'reserved_paid',
    })
    const unitChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', status: 'reserved_paid' },
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(unitChain)

    const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
    const req = new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
      method: 'PATCH',
      body: JSON.stringify({ unit_id: 'unit-1' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(409)
  })

  it('assigns unit successfully', async () => {
    auth.mockResolvedValueOnce(adminSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      status: 'reserved_paid',
      product_id: 'prod-1',
    })

    // Unit check: available
    const unitChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', status: 'available' },
        error: null,
      }),
    })
    // Reservation update
    const resUpdateChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-1', unit_id: 'unit-1' },
        error: null,
      }),
    })
    // Unit update
    const unitUpdateChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', status: 'reserved_paid' },
        error: null,
      }),
    })
    // Unit event insert
    const auditChain = makeChain()

    supabaseAdmin.from
      .mockReturnValueOnce(unitChain)       // unit status check
      .mockReturnValueOnce(resUpdateChain)   // reservation update
      .mockReturnValueOnce(unitUpdateChain)  // unit update
      .mockReturnValueOnce(auditChain)       // unit_events insert

    const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
    const req = new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
      method: 'PATCH',
      body: JSON.stringify({ unit_id: 'unit-1' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(200)
  })
})
```

```bash
npx jest --testPathPattern=admin/reservations --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement routes**

```typescript
// app/api/admin/reservations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listReservations } from '@/lib/db/reservations'

const ADMIN_DOMAIN = '@navomarine.com'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined

  try {
    const reservations = await listReservations({ status })
    return NextResponse.json({ reservations })
  } catch (err) {
    console.error('Failed to list reservations:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

```typescript
// app/api/admin/reservations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getReservation } from '@/lib/db/reservations'

const ADMIN_DOMAIN = '@navomarine.com'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const reservation = await getReservation(id)
    if (!reservation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ reservation })
  } catch (err) {
    console.error('Failed to get reservation:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

```typescript
// app/api/admin/reservations/[id]/assign/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'
import { getReservation } from '@/lib/db/reservations'

const ADMIN_DOMAIN = '@navomarine.com'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as { unit_id: string }

  if (!body.unit_id) {
    return NextResponse.json({ error: 'unit_id is required' }, { status: 400 })
  }

  // 1. Verify reservation exists and is reserved_paid
  const reservation = await getReservation(id)
  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }
  if (reservation.status !== 'reserved_paid') {
    return NextResponse.json(
      { error: 'Can only assign units to paid reservations' },
      { status: 400 },
    )
  }

  // 2. Verify unit exists and is available
  const { data: unit, error: unitError } = await supabaseAdmin
    .from('units')
    .select('id, status, navo_number')
    .eq('id', body.unit_id)
    .single()

  if (unitError || !unit) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
  }

  const unitData = unit as { id: string; status: string; navo_number: string }
  if (unitData.status !== 'available') {
    return NextResponse.json(
      { error: `Unit ${unitData.navo_number} is ${unitData.status}, not available` },
      { status: 409 },
    )
  }

  // 3. Assign: update reservation.unit_id
  const { error: resError } = await supabaseAdmin
    .from('reservations')
    .update({ unit_id: body.unit_id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (resError) {
    return NextResponse.json({ error: resError.message }, { status: 500 })
  }

  // 4. Update unit status to reserved_paid
  const { error: unitUpdateError } = await supabaseAdmin
    .from('units')
    .update({ status: 'reserved_paid' })
    .eq('id', body.unit_id)
    .select('*')
    .single()

  if (unitUpdateError) {
    return NextResponse.json({ error: unitUpdateError.message }, { status: 500 })
  }

  // 5. Audit log
  await supabaseAdmin.from('unit_events').insert({
    unit_id: body.unit_id,
    event_type: 'assigned',
    from_status: 'available',
    to_status: 'reserved_paid',
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: `Assigned to reservation ${id}`,
    metadata: { reservation_id: id },
  })

  return NextResponse.json({
    success: true,
    reservation_id: id,
    unit_id: body.unit_id,
  })
}
```

```bash
npx jest --testPathPattern=admin/reservations --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/reservations/ __tests__/api/admin/reservations.test.ts
git commit -m "feat(api): add admin reservation routes — list, detail, unit assignment"
```

---

## Task 4: Admin Reservation Pages

**Files:**
- Create: `app/admin/reservations/page.tsx`
- Create: `app/admin/reservations/[id]/page.tsx`
- Create: `app/admin/reservations/[id]/AssignUnitForm.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Create reservation list page**

`app/admin/reservations/page.tsx` — server component that fetches all reservations and renders a table with columns: Status badge, Customer Email, Type, Sail Number, Total, Created At, Expires At (with countdown for unpaid). Each row links to the detail page.

- [ ] **Step 2: Create reservation detail page**

`app/admin/reservations/[id]/page.tsx` — server component showing full reservation detail: status, customer info, product, event/window, sail number, payment info, assigned unit (if any). If `status === 'reserved_paid'` and no unit assigned, shows the AssignUnitForm.

- [ ] **Step 3: Create AssignUnitForm**

```typescript
// app/admin/reservations/[id]/AssignUnitForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Unit = {
  id: string
  navo_number: string
  status: string
}

type Props = {
  reservationId: string
  availableUnits: Unit[]
}

export function AssignUnitForm({ reservationId, availableUnits }: Props) {
  const router = useRouter()
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAssign() {
    if (!selectedUnitId) return
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: selectedUnitId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Assignment failed')
        return
      }

      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (availableUnits.length === 0) {
    return <p className="text-sm text-white/40">No available units to assign.</p>
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
      <h3 className="text-sm font-semibold text-white mb-4">Assign Physical Unit</h3>

      <select
        value={selectedUnitId}
        onChange={(e) => setSelectedUnitId(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white mb-4"
      >
        <option value="">Select a unit...</option>
        {availableUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.navo_number}
          </option>
        ))}
      </select>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <button
        onClick={handleAssign}
        disabled={!selectedUnitId || loading}
        className="glass-btn glass-btn-primary rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
      >
        {loading ? 'Assigning...' : 'Assign Unit'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add Reservations link to admin sidebar**

In `app/admin/layout.tsx`, add a new nav link after Fleet:

```tsx
<Link
  href="/admin/reservations"
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
>
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
  Reservations
</Link>
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/reservations/ app/admin/layout.tsx
git commit -m "feat(admin): add reservation list, detail, and unit assignment pages"
```

---

## Task 5: pg_cron Enable Migration

The `expire_unpaid_reservations()` function and cron job were created in `001_initial_schema.sql`. However, `pg_cron` must be enabled in the Supabase dashboard. This migration serves as documentation and will enable the extension if it can be done via SQL.

**Files:**
- Create: `supabase/migrations/004_pg_cron_enable.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/004_pg_cron_enable.sql
-- Enable pg_cron if not already enabled
-- NOTE: On Supabase, pg_cron must be enabled via the dashboard Extensions page.
-- This migration documents that the extension is required and verifies the jobs exist.

-- Verify the cron jobs exist (these were created in 001_initial_schema.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'expire-unpaid-reservations'
  ) THEN
    PERFORM cron.schedule(
      'expire-unpaid-reservations',
      '0 * * * *',
      'SELECT expire_unpaid_reservations()'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-return-reminders'
  ) THEN
    PERFORM cron.schedule(
      'send-return-reminders',
      '0 8 * * *',
      'SELECT send_return_form_reminders()'
    );
  END IF;
END;
$$;
```

- [ ] **Step 2: Apply migration via Supabase MCP or SQL editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_pg_cron_enable.sql
git commit -m "chore(migrations): add 004 — verify pg_cron jobs exist"
```

---

## Task 6: E2E Gate — Payment Lifecycle

- [ ] **Step 1: Create E2E test**

```typescript
// e2e/payment-lifecycle.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Payment Lifecycle', () => {
  // These tests require:
  // 1. Stripe test mode + webhook forwarding (stripe listen --forward-to localhost:3000/api/stripe/webhook)
  // 2. Active rental event with capacity > 0 seeded in DB
  // 3. Authenticated admin user session

  test('admin can view reservations list', async ({ page }) => {
    // Assumes admin auth session
    await page.goto('/admin/reservations')
    await expect(page.locator('h1')).toContainText('Reservations')
  })

  test('admin can view reservation detail', async ({ page }) => {
    // Navigate to a specific reservation
    await page.goto('/admin/reservations')
    // Click first reservation link if exists
    const firstLink = page.locator('a[href^="/admin/reservations/"]').first()
    if (await firstLink.isVisible()) {
      await firstLink.click()
      await expect(page.locator('h1')).toContainText('Reservation')
    }
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- --grep "Payment Lifecycle"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/payment-lifecycle.spec.ts
git commit -m "test(e2e): add payment lifecycle tests"
```

---

## Summary

After completing all tasks:
- `POST /api/stripe/webhook` — verifies signature, deduplicates via `stripe_events`, writes in order: (1) reservation update, (2) order create, (3) stripe_events commit flag
- `lib/db/reservations.ts` — list/get/update reservation queries with joined relations
- `lib/db/orders.ts` — `createOrderFromCheckout` inserts order + order_items
- `PATCH /api/admin/reservations/[id]/assign` — validates `reserved_paid` status + unit `available`, then assigns
- Admin pages for reservation list, detail, and unit assignment
- pg_cron verification migration
- Webhook is idempotent: if reservation already `reserved_paid`, returns 200 with no further writes
- stripe_events insert is ALWAYS the last write (commit flag)

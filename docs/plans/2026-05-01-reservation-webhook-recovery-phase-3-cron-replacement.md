# Reservation Webhook Recovery — Phase 3 (Self-Healing Cron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paused `expire_unpaid_reservations` pg_cron job with a Vercel Cron route that consults Stripe before cancelling, providing defense-in-depth so the Phase 1 webhook bug class cannot recur silently.

**Architecture:** A single Next.js Route Handler at `/api/cron/expire-unpaid-reservations` runs hourly via Vercel Cron. For each `reserved_unpaid` row past `expires_at`, it calls Stripe to retrieve the Checkout Session. If `payment_status === 'paid'` (or `no_payment_required`), it self-heals by flipping the row to `reserved_paid` and creating an `orders` record (mirroring `fulfillCheckoutSession`). Otherwise it cancels (mirroring the original plpgsql behaviour). Errors are caught per-row and counted — fail-open so Stripe outages don't cancel paid customers.

**Tech Stack:** Next.js App Router (Route Handler), Stripe SDK, Supabase (`supabaseAdmin`), Jest. No new dependencies. Vercel Cron config via `vercel.json`.

**Spec reference:** `docs/plans/2026-04-29-reservation-webhook-recovery-design.md` § Phase 3.

**Estimated time:** 3-4 hours including local TDD + preview smoke test.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/cron/reservation-lifecycle.ts` | NEW | Pure helpers `cancelReservation(row)` and `restoreReservationAsPaid(row, session)`. No HTTP, no auth — testable units. |
| `app/api/cron/expire-unpaid-reservations/route.ts` | NEW | Route handler: verifies `CRON_SECRET`, queries candidates, dispatches per-row to a helper, aggregates `{processed, restored, cancelled, errored}`. |
| `__tests__/lib/cron/reservation-lifecycle.test.ts` | NEW | Unit tests for both helpers. Covers happy paths + error branches. |
| `__tests__/api/cron/expire-unpaid-reservations.test.ts` | NEW | Route-level tests: auth, dispatch logic, multi-row partial failure, fail-open on Stripe errors. |
| `vercel.json` | NEW | Vercel Cron schedule entry. (We're staying on `vercel.json`; the `vercel.ts` migration is a separate cleanup.) |
| `supabase/migrations/012_document_pg_cron_retirement.sql` | NEW | Comment-only migration documenting that `expire_unpaid_reservations()` is permanently retired in favour of the Vercel Cron route. No DDL changes. |

No new TypeScript dependencies. No new Supabase tables.

---

## Pre-flight: confirm CRON_SECRET is set in Vercel production

### Task 0: Confirm `CRON_SECRET` env var

**Files:** none (env-var check only)

The route handler authenticates incoming Vercel Cron requests by comparing `req.headers.get('authorization')` against `Bearer ${process.env.CRON_SECRET}`. Vercel auto-generates this when a project first uses Cron Jobs. Confirm it exists before merging.

- [ ] **Step 1:** Diego opens Vercel → navo-marine → Settings → Environment Variables → Production scope. Filter for `CRON_SECRET`.

- [ ] **Step 2:** If present (any value), record that in the PR description and continue. Do **not** rotate or reveal the value.

- [ ] **Step 3:** If absent, Vercel will auto-create it the first time a deployed `vercel.json` declares a `crons` entry. Either let that happen on first preview deploy, or manually pre-create one (`vercel env add CRON_SECRET production`, paste a generated 64-char random string). Either path is fine — flag in PR which was used.

This is a discovery step. No commit.

---

## Task 1: Branch off main, verify clean tree

**Files:** none (git operations)

Phase 3 is a feature, not a hotfix. Branching off main keeps the PR clean.

- [ ] **Step 1:** Save uncommitted work if any.

```bash
git status -s
```

If output is non-empty, stash:

```bash
git stash push -m "WIP before phase-3 branch"
```

- [ ] **Step 2:** Sync main with origin.

```bash
git checkout main && git pull origin main
```

If SSH push/pull is blocked in this environment, ask Diego to pull manually before continuing.

- [ ] **Step 3:** Create the feature branch.

```bash
git checkout -b feature/phase-3-vercel-cron
```

- [ ] **Step 4:** Confirm clean state.

```bash
git status -s
```

Expected: no output.

---

## Task 2: TDD `cancelReservation` helper

**Files:**
- Create: `lib/cron/reservation-lifecycle.ts`
- Create: `__tests__/lib/cron/reservation-lifecycle.test.ts`

`cancelReservation(row)` mirrors the side effects the original plpgsql function performed when a row's `expires_at` passed:
1. Delete `reservation_units` rows for the reservation
2. If `unit_id` is set, free the unit (`units.status = 'available'`) and insert a `unit_events` audit row
3. Update the reservation: `status='cancelled'`, `updated_at=now()`
4. Insert a `notifications` row for the customer

We TDD the cancel path first because it has no Stripe coupling and is pure DB writes — easier to mock.

### Helper input type

```typescript
export type LifecycleRow = {
  id: string
  stripe_checkout_session_id: string | null
  unit_id: string | null
  customer_email: string
  user_id: string
  total_cents: number
  product_id: string | null
  start_date: string | null
  end_date: string | null
}
```

This is the shape returned by the candidate query in the route handler. Keeping it explicit avoids leaking Supabase row types into the helper interface.

### Step 1: Write the failing test

- [ ] **Step 1a:** Create the test file with mocks scaffolded after `__tests__/lib/stripe/webhook.test.ts`.

`__tests__/lib/cron/reservation-lifecycle.test.ts`:

```typescript
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/email/templates', () => ({
  bookingConfirmed: jest.fn().mockReturnValue({ to: 'sailor@test.com', subject: 'Confirmed', html: '<p/>' }),
}))

import {
  cancelReservation,
  restoreReservationAsPaid,
} from '@/lib/cron/reservation-lifecycle'
import { supabaseAdmin } from '@/lib/db/client'
import type Stripe from 'stripe'

const mockSupabase = supabaseAdmin as unknown as { from: jest.Mock }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const k of ['select', 'insert', 'update', 'delete', 'eq']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

const baseRow = {
  id: 'res-001',
  stripe_checkout_session_id: null,
  unit_id: null,
  customer_email: 'sailor@test.com',
  user_id: 'user-001',
  total_cents: 24500,
  product_id: 'prod-001',
  start_date: null,
  end_date: null,
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('cancelReservation', () => {
  it('deletes reservation_units, updates reservation to cancelled, and inserts a notification (no unit case)', async () => {
    const reservationUnitsChain = makeChain()
    const reservationsChain = makeChain()
    const notificationsChain = makeChain()
    const tableMap: Record<string, ReturnType<typeof makeChain>> = {
      reservation_units: reservationUnitsChain,
      reservations: reservationsChain,
      notifications: notificationsChain,
    }
    mockSupabase.from = jest.fn((t: string) => tableMap[t])

    await cancelReservation(baseRow)

    expect(reservationUnitsChain.delete).toHaveBeenCalledTimes(1)
    expect(reservationUnitsChain.eq).toHaveBeenCalledWith('reservation_id', 'res-001')

    expect(reservationsChain.update).toHaveBeenCalledTimes(1)
    const updateArg = reservationsChain.update.mock.calls[0][0]
    expect(updateArg.status).toBe('cancelled')
    expect(typeof updateArg.updated_at).toBe('string')
    expect(reservationsChain.eq).toHaveBeenCalledWith('id', 'res-001')

    expect(notificationsChain.insert).toHaveBeenCalledTimes(1)
    const notifArg = notificationsChain.insert.mock.calls[0][0]
    expect(notifArg.user_id).toBe('user-001')
    expect(notifArg.message).toMatch(/expired/i)
  })

  it('also frees the unit and inserts unit_events when unit_id is present', async () => {
    const reservationUnitsChain = makeChain()
    const reservationsChain = makeChain()
    const notificationsChain = makeChain()
    const unitsChain = makeChain()
    const unitEventsChain = makeChain()
    const tableMap: Record<string, ReturnType<typeof makeChain>> = {
      reservation_units: reservationUnitsChain,
      reservations: reservationsChain,
      notifications: notificationsChain,
      units: unitsChain,
      unit_events: unitEventsChain,
    }
    mockSupabase.from = jest.fn((t: string) => tableMap[t])

    await cancelReservation({ ...baseRow, unit_id: 'unit-001' })

    expect(unitsChain.update).toHaveBeenCalledWith({ status: 'available' })
    expect(unitsChain.eq).toHaveBeenCalledWith('id', 'unit-001')

    expect(unitEventsChain.insert).toHaveBeenCalledTimes(1)
    const unitEventArg = unitEventsChain.insert.mock.calls[0][0]
    expect(unitEventArg.unit_id).toBe('unit-001')
    expect(unitEventArg.from_status).toBe('reserved_unpaid')
    expect(unitEventArg.to_status).toBe('available')
    expect(unitEventArg.actor_type).toBe('system')
  })
})
```

- [ ] **Step 1b:** Run the test to confirm it fails (the helper file doesn't exist yet).

```bash
npm test -- __tests__/lib/cron/reservation-lifecycle.test.ts
```

Expected: FAIL with module-not-found error pointing to `@/lib/cron/reservation-lifecycle`.

### Step 2: Write the minimal implementation

- [ ] **Step 2a:** Create `lib/cron/reservation-lifecycle.ts` with the type and `cancelReservation` only.

`lib/cron/reservation-lifecycle.ts`:

```typescript
// lib/cron/reservation-lifecycle.ts
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/gmail'
import { bookingConfirmed } from '@/lib/email/templates'
import { generateOrderNumber } from '@/lib/stripe/webhook'

export type LifecycleRow = {
  id: string
  stripe_checkout_session_id: string | null
  unit_id: string | null
  customer_email: string
  user_id: string
  total_cents: number
  product_id: string | null
  start_date: string | null
  end_date: string | null
}

export async function cancelReservation(row: LifecycleRow): Promise<void> {
  // 1. Detach any reservation_units rows tied to this reservation
  await supabaseAdmin
    .from('reservation_units')
    .delete()
    .eq('reservation_id', row.id)

  // 2. If a unit was assigned, free it and audit the transition
  if (row.unit_id) {
    await supabaseAdmin
      .from('units')
      .update({ status: 'available' })
      .eq('id', row.unit_id)

    await supabaseAdmin.from('unit_events').insert({
      unit_id: row.unit_id,
      event_type: 'status_changed',
      from_status: 'reserved_unpaid',
      to_status: 'available',
      actor_type: 'system',
      notes: 'Reservation expired after 24 hours (Vercel Cron)',
    })
  }

  // 3. Mark the reservation cancelled
  await supabaseAdmin
    .from('reservations')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  // 4. Notify the customer via in-app notification
  await supabaseAdmin.from('notifications').insert({
    user_id: row.user_id,
    message: 'Your reservation expired. Book again anytime.',
    link: '/reserve',
  })
}

// restoreReservationAsPaid is added in Task 3
```

Note: the `import { generateOrderNumber }` line is added now to avoid a second edit in Task 3, but isn't yet used.

- [ ] **Step 2b:** Run the test again.

```bash
npm test -- __tests__/lib/cron/reservation-lifecycle.test.ts
```

Expected: 2 tests PASS.

### Step 3: Commit

- [ ] **Step 3:**

```bash
git add lib/cron/reservation-lifecycle.ts __tests__/lib/cron/reservation-lifecycle.test.ts
git commit -m "feat(cron): add cancelReservation helper

Pure-DB helper that mirrors the original plpgsql expire_unpaid_reservations
side-effects: detach reservation_units, free assigned unit, mark reservation
cancelled, notify customer.

Will be called from the Vercel Cron route in a follow-up commit. Tests
cover both the no-unit and unit-assigned paths.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 3: TDD `restoreReservationAsPaid` helper

**Files:**
- Modify: `lib/cron/reservation-lifecycle.ts`
- Modify: `__tests__/lib/cron/reservation-lifecycle.test.ts`

Mirrors `fulfillCheckoutSession()` from `lib/stripe/webhook.ts`:
1. Update the reservation: `status='reserved_paid'`, set `stripe_payment_intent_id`, set `expires_at=null`, bump `updated_at`
2. Insert an `orders` row with the same shape the webhook handler produces (order_number, totals, etc.)
3. If a unit was assigned, flip its status to `reserved_paid`
4. Send a `bookingConfirmed` email (fire-and-forget — same as the webhook)

### Step 1: Write the failing test

- [ ] **Step 1a:** Append to `__tests__/lib/cron/reservation-lifecycle.test.ts`:

```typescript
describe('restoreReservationAsPaid', () => {
  const sessionPaid: Partial<Stripe.Checkout.Session> = {
    id: 'cs_live_test',
    payment_intent: 'pi_test_123',
    payment_status: 'paid',
    customer_email: 'sailor@test.com',
  }

  it('updates reservation to reserved_paid, inserts an order, and sends confirmation email', async () => {
    const reservationsChain = makeChain()
    const ordersChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'ord-001' }, error: null }),
    })
    const productsChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { name: 'Atlas 2' }, error: null }),
    })
    const tableMap: Record<string, ReturnType<typeof makeChain>> = {
      reservations: reservationsChain,
      orders: ordersChain,
      products: productsChain,
    }
    mockSupabase.from = jest.fn((t: string) => tableMap[t])

    await restoreReservationAsPaid(baseRow, sessionPaid as Stripe.Checkout.Session)

    expect(reservationsChain.update).toHaveBeenCalledTimes(1)
    const updateArg = reservationsChain.update.mock.calls[0][0]
    expect(updateArg.status).toBe('reserved_paid')
    expect(updateArg.stripe_payment_intent_id).toBe('pi_test_123')
    expect(updateArg.expires_at).toBeNull()

    expect(ordersChain.insert).toHaveBeenCalledTimes(1)
    const orderArg = ordersChain.insert.mock.calls[0][0]
    expect(orderArg.reservation_id).toBe('res-001')
    expect(orderArg.stripe_payment_intent_id).toBe('pi_test_123')
    expect(orderArg.total_cents).toBe(24500)
    expect(orderArg.status).toBe('paid')
    expect(orderArg.order_number).toMatch(/^NAVO-\d{4}-[A-Z0-9]{8}$/)
  })

  it('handles no_payment_required by setting payment_intent_id null', async () => {
    const reservationsChain = makeChain()
    const ordersChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'ord-002' }, error: null }),
    })
    const productsChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const tableMap: Record<string, ReturnType<typeof makeChain>> = {
      reservations: reservationsChain,
      orders: ordersChain,
      products: productsChain,
    }
    mockSupabase.from = jest.fn((t: string) => tableMap[t])

    const sessionFree = { ...sessionPaid, payment_intent: null, payment_status: 'no_payment_required' }
    await restoreReservationAsPaid(baseRow, sessionFree as unknown as Stripe.Checkout.Session)

    const updateArg = reservationsChain.update.mock.calls[0][0]
    expect(updateArg.stripe_payment_intent_id).toBeNull()
    expect(ordersChain.insert.mock.calls[0][0].stripe_payment_intent_id).toBeNull()
  })

  it('flips unit status to reserved_paid when unit_id is present', async () => {
    const reservationsChain = makeChain()
    const ordersChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'ord-003' }, error: null }),
    })
    const unitsChain = makeChain()
    const productsChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { name: 'Atlas 2' }, error: null }),
    })
    const tableMap: Record<string, ReturnType<typeof makeChain>> = {
      reservations: reservationsChain,
      orders: ordersChain,
      units: unitsChain,
      products: productsChain,
    }
    mockSupabase.from = jest.fn((t: string) => tableMap[t])

    await restoreReservationAsPaid(
      { ...baseRow, unit_id: 'unit-001' },
      sessionPaid as Stripe.Checkout.Session,
    )

    expect(unitsChain.update).toHaveBeenCalledWith({ status: 'reserved_paid' })
    expect(unitsChain.eq).toHaveBeenCalledWith('id', 'unit-001')
  })
})
```

- [ ] **Step 1b:** Run the suite — the new tests fail because `restoreReservationAsPaid` is not exported yet.

```bash
npm test -- __tests__/lib/cron/reservation-lifecycle.test.ts
```

Expected: FAIL — `restoreReservationAsPaid is not a function` or import error.

### Step 2: Implement `restoreReservationAsPaid`

- [ ] **Step 2a:** Replace the placeholder comment in `lib/cron/reservation-lifecycle.ts` with the full implementation:

Append below `cancelReservation`:

```typescript
export async function restoreReservationAsPaid(
  row: LifecycleRow,
  session: Stripe.Checkout.Session,
): Promise<{ orderId: string }> {
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  // 1. Flip reservation to reserved_paid, link payment intent, clear expiry
  await supabaseAdmin
    .from('reservations')
    .update({
      status: 'reserved_paid',
      stripe_payment_intent_id: paymentIntentId,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  // 2. Create an orders row mirroring the webhook handler's shape
  const orderNumber = generateOrderNumber()
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: row.user_id,
      customer_email: row.customer_email ?? session.customer_email ?? '',
      reservation_id: row.id,
      shipping_address: null,
      status: 'paid',
      subtotal_cents: row.total_cents,
      tax_cents: 0,
      total_cents: row.total_cents,
      currency: 'usd',
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      stripe_payment_intent_id: paymentIntentId,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    throw new Error(`[cron] order insert failed for reservation ${row.id}: ${orderErr?.message}`)
  }

  const orderId = (order as { id: string }).id

  // 3. Flip unit status if assigned
  if (row.unit_id) {
    await supabaseAdmin
      .from('units')
      .update({ status: 'reserved_paid' })
      .eq('id', row.unit_id)
  }

  // 4. Send booking confirmed email (fire-and-forget — same shape as webhook)
  const { data: productRow } = row.product_id
    ? await supabaseAdmin.from('products').select('name').eq('id', row.product_id).single()
    : { data: null }

  const confirmedEmail = bookingConfirmed({
    to: row.customer_email ?? session.customer_email ?? '',
    reservationId: row.id,
    orderId,
    productName: (productRow as { name: string } | null)?.name ?? 'NAVO Rental',
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    totalCents: row.total_cents,
  })
  void sendEmail(confirmedEmail.to, confirmedEmail.subject, confirmedEmail.html).catch(
    (err) => console.error(`[cron] restore=warn step=email-send error=${err}`),
  )

  return { orderId }
}
```

- [ ] **Step 2b:** Run the suite.

```bash
npm test -- __tests__/lib/cron/reservation-lifecycle.test.ts
```

Expected: 5 tests PASS (2 from Task 2 + 3 new).

### Step 3: Commit

- [ ] **Step 3:**

```bash
git add lib/cron/reservation-lifecycle.ts __tests__/lib/cron/reservation-lifecycle.test.ts
git commit -m "feat(cron): add restoreReservationAsPaid helper

Mirrors fulfillCheckoutSession side-effects from lib/stripe/webhook.ts:
update reservation to reserved_paid + payment_intent_id + clear expires_at,
insert orders row with the standard NAVO-YYYY-XXXXXXXX order_number,
flip unit status if assigned, fire-and-forget bookingConfirmed email.

Tests cover paid sessions, no_payment_required sessions, and the
unit-assigned branch.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 4: TDD route handler

**Files:**
- Create: `app/api/cron/expire-unpaid-reservations/route.ts`
- Create: `__tests__/api/cron/expire-unpaid-reservations.test.ts`

The route is a thin orchestrator: auth check, candidate query, per-row dispatch, aggregate response. We TDD the four behaviours called out in the design's acceptance criteria: no session, paid session, unpaid session, Stripe 404.

### Step 1: Write the failing test

- [ ] **Step 1:** Create `__tests__/api/cron/expire-unpaid-reservations.test.ts`:

```typescript
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: {
      sessions: { retrieve: jest.fn() },
    },
  },
}))
jest.mock('@/lib/cron/reservation-lifecycle', () => ({
  cancelReservation: jest.fn().mockResolvedValue(undefined),
  restoreReservationAsPaid: jest.fn().mockResolvedValue({ orderId: 'ord-stub' }),
}))

import { GET } from '@/app/api/cron/expire-unpaid-reservations/route'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import {
  cancelReservation,
  restoreReservationAsPaid,
} from '@/lib/cron/reservation-lifecycle'

const mockSupabase = supabaseAdmin as unknown as { from: jest.Mock }
const mockRetrieve = stripe.checkout.sessions.retrieve as jest.Mock
const mockCancel = cancelReservation as jest.Mock
const mockRestore = restoreReservationAsPaid as jest.Mock

const ORIGINAL_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
})

afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET
})

function authedReq() {
  return new Request('https://example.test/api/cron/expire-unpaid-reservations', {
    headers: { authorization: 'Bearer test-secret' },
  })
}

function rowsResolver(rows: unknown[]) {
  // The candidate query is reservations.select(...).eq('status', ...).lt('expires_at', ...).not('expires_at', 'is', null)
  // The chain ends without .single() — the awaited value is { data, error }.
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    not: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return chain
}

describe('GET /api/cron/expire-unpaid-reservations', () => {
  it('returns 401 when authorization header missing or wrong', async () => {
    const res = await GET(new Request('https://x/y'))
    expect(res.status).toBe(401)
  })

  it('returns {processed:0} on a clean DB', async () => {
    mockSupabase.from = jest.fn(() => rowsResolver([]))
    const res = await GET(authedReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ processed: 0, restored: 0, cancelled: 0, errored: 0 })
  })

  it('cancels rows with no stripe_checkout_session_id (no Stripe call)', async () => {
    mockSupabase.from = jest.fn(() =>
      rowsResolver([
        { id: 'r1', stripe_checkout_session_id: null, unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
      ]),
    )
    const res = await GET(authedReq())
    const body = await res.json()
    expect(mockRetrieve).not.toHaveBeenCalled()
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(body).toEqual({ processed: 1, restored: 0, cancelled: 1, errored: 0 })
  })

  it('restores rows when Stripe says payment_status=paid', async () => {
    mockSupabase.from = jest.fn(() =>
      rowsResolver([
        { id: 'r2', stripe_checkout_session_id: 'cs_live_x', unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
      ]),
    )
    mockRetrieve.mockResolvedValueOnce({ id: 'cs_live_x', payment_status: 'paid', payment_intent: 'pi_x' })

    const res = await GET(authedReq())
    const body = await res.json()
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(mockCancel).not.toHaveBeenCalled()
    expect(body).toEqual({ processed: 1, restored: 1, cancelled: 0, errored: 0 })
  })

  it('cancels rows when Stripe says payment_status=unpaid', async () => {
    mockSupabase.from = jest.fn(() =>
      rowsResolver([
        { id: 'r3', stripe_checkout_session_id: 'cs_live_y', unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
      ]),
    )
    mockRetrieve.mockResolvedValueOnce({ id: 'cs_live_y', payment_status: 'unpaid' })

    const res = await GET(authedReq())
    const body = await res.json()
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockRestore).not.toHaveBeenCalled()
    expect(body).toEqual({ processed: 1, restored: 0, cancelled: 1, errored: 0 })
  })

  it('counts errors fail-open when Stripe throws (row left unchanged)', async () => {
    mockSupabase.from = jest.fn(() =>
      rowsResolver([
        { id: 'r4', stripe_checkout_session_id: 'cs_live_z', unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
      ]),
    )
    mockRetrieve.mockRejectedValueOnce(new Error('Stripe 502'))

    const res = await GET(authedReq())
    const body = await res.json()
    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockRestore).not.toHaveBeenCalled()
    expect(body).toEqual({ processed: 1, restored: 0, cancelled: 0, errored: 1 })
  })

  it('handles a multi-row partial failure (mix of paid + error + cancel)', async () => {
    mockSupabase.from = jest.fn(() =>
      rowsResolver([
        { id: 'a', stripe_checkout_session_id: 'cs1', unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
        { id: 'b', stripe_checkout_session_id: 'cs2', unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
        { id: 'c', stripe_checkout_session_id: null, unit_id: null, customer_email: 'a@b', user_id: 'u', total_cents: 100, product_id: null, start_date: null, end_date: null },
      ]),
    )
    mockRetrieve
      .mockResolvedValueOnce({ id: 'cs1', payment_status: 'paid' })
      .mockRejectedValueOnce(new Error('Stripe 503'))

    const res = await GET(authedReq())
    const body = await res.json()
    expect(body).toEqual({ processed: 3, restored: 1, cancelled: 1, errored: 1 })
  })
})
```

- [ ] **Step 2:** Run — expect FAIL because the route doesn't exist.

```bash
npm test -- __tests__/api/cron/expire-unpaid-reservations.test.ts
```

Expected: FAIL with "Cannot find module".

### Step 3: Implement the route

- [ ] **Step 3a:** Create `app/api/cron/expire-unpaid-reservations/route.ts`:

```typescript
// app/api/cron/expire-unpaid-reservations/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/db/client'
import {
  cancelReservation,
  restoreReservationAsPaid,
  type LifecycleRow,
} from '@/lib/cron/reservation-lifecycle'

export async function GET(req: Request): Promise<Response> {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: candidates, error: queryErr } = await supabaseAdmin
    .from('reservations')
    .select(
      'id, stripe_checkout_session_id, unit_id, customer_email, user_id, total_cents, product_id, start_date, end_date',
    )
    .eq('status', 'reserved_unpaid')
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)

  if (queryErr) {
    console.error('[cron] expire-unpaid: candidate query failed', queryErr.message)
    return NextResponse.json(
      { error: 'candidate query failed', details: queryErr.message },
      { status: 500 },
    )
  }

  let restored = 0
  let cancelled = 0
  let errored = 0

  for (const row of (candidates ?? []) as LifecycleRow[]) {
    try {
      if (!row.stripe_checkout_session_id) {
        await cancelReservation(row)
        cancelled++
        continue
      }

      const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id)

      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        await restoreReservationAsPaid(row, session)
        restored++
      } else {
        await cancelReservation(row)
        cancelled++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cron] expire-unpaid: error on ${row.id} reason=${message}`)
      errored++
    }
  }

  return NextResponse.json({
    processed: candidates?.length ?? 0,
    restored,
    cancelled,
    errored,
  })
}
```

- [ ] **Step 3b:** Run the test.

```bash
npm test -- __tests__/api/cron/expire-unpaid-reservations.test.ts
```

Expected: 7 tests PASS.

### Step 4: Run the full suite to confirm nothing else broke

- [ ] **Step 4:**

```bash
npm test -- --silent 2>&1 | tail -8
```

Expected: all suites pass. Count should be previous-total + 12 (7 route + 5 helper).

### Step 5: Commit

- [ ] **Step 5:**

```bash
git add app/api/cron/expire-unpaid-reservations/route.ts __tests__/api/cron/expire-unpaid-reservations.test.ts
git commit -m "feat(cron): add /api/cron/expire-unpaid-reservations route

Hourly Vercel Cron handler that replaces the paused pg_cron job. For each
reserved_unpaid row past expires_at, retrieves the Stripe Checkout Session
and either restores (paid / no_payment_required) or cancels. Errors are
caught per-row and counted — fail-open so Stripe outages do not cancel
paid customers.

Auth: Bearer CRON_SECRET (Vercel auto-generates and injects).

Tests cover: 401 on missing auth, empty DB, no-session cancel, paid
restore, unpaid cancel, Stripe error fail-open, multi-row mix.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 5: Add Vercel Cron schedule

**Files:**
- Create: `vercel.json`

The repo currently has no `vercel.json`. We add one with just the cron entry. Hourly cadence matches the previous pg_cron job.

- [ ] **Step 1:** Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/expire-unpaid-reservations",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 2:** Validate it's well-formed JSON.

```bash
python3 -c "import json; json.load(open('vercel.json'))" && echo "ok"
```

Expected: `ok`.

- [ ] **Step 3:** Commit.

```bash
git add vercel.json
git commit -m "feat(cron): wire Vercel Cron to call expire-unpaid-reservations hourly

Hourly cadence matches the original pg_cron schedule paused in Phase 1.
First deploy will trigger Vercel to auto-generate CRON_SECRET if not
already set in production env.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 6: Documentation migration

**Files:**
- Create: `supabase/migrations/012_document_pg_cron_retirement.sql`

Comment-only migration that documents the retirement of `expire_unpaid_reservations()` plpgsql in favour of the Vercel Cron route. No DDL — keeps the function defined in case anyone wants to read it for reference.

- [ ] **Step 1:** Create `supabase/migrations/012_document_pg_cron_retirement.sql`:

```sql
-- Documentation-only migration: no DDL changes.
--
-- The pg_cron job 'expire-unpaid-reservations' was unscheduled in
-- migration 011 (Phase 1 hotfix) because the plpgsql implementation
-- could not consult Stripe before cancelling rows whose webhook
-- delivery had silently failed. Phase 3 of the recovery plan replaces
-- it with a Vercel Cron route at /api/cron/expire-unpaid-reservations
-- that retrieves each Checkout Session and self-heals paid rows before
-- cancelling unpaid ones.
--
-- The plpgsql function expire_unpaid_reservations() remains DEFINED
-- but is no longer called by anything. We keep it for archival reference
-- so the original semantics (free unit, audit, notify, mark cancelled)
-- are inspectable next to this comment. Do not re-`cron.schedule` it.
--
-- Owner of the lifecycle as of this migration:
--   GET https://www.navomarine.com/api/cron/expire-unpaid-reservations
--   Authorization: Bearer ${CRON_SECRET}
--   Schedule: 0 * * * * (hourly, configured in vercel.json)
--
-- Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md § Phase 3
```

- [ ] **Step 2:** Commit.

```bash
git add supabase/migrations/012_document_pg_cron_retirement.sql
git commit -m "docs(db): document pg_cron retirement and Vercel Cron handoff

Comment-only migration. No DDL. Records that
expire_unpaid_reservations() plpgsql is retired in favour of the
Vercel Cron route added in this PR. Future readers grepping the
migrations history will see the link.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 7: Local lint + typecheck

**Files:** none

Quick sanity check that the new TS files compile with the project's strict settings.

- [ ] **Step 1:** TypeScript check.

```bash
npx tsc --noEmit
```

Expected: zero errors. If errors point to the new files, fix them in place and re-run before committing fixes.

- [ ] **Step 2:** Lint.

```bash
npm run lint -- --quiet
```

Expected: zero errors. Warnings are OK if they pre-existed; new warnings should be fixed.

If either check fails: fix in place, re-run, then `git add ... && git commit -m "fix(cron): typecheck/lint cleanups"`. Otherwise skip the commit step.

---

## Task 8: Final verification + push + PR

**Files:** none

- [ ] **Step 1:** Confirm full test suite is green.

```bash
npm test -- --silent 2>&1 | tail -8
```

Expected: previous-total + 12 tests pass. No failures.

- [ ] **Step 2:** Review the diff vs main.

```bash
git diff main..HEAD --stat
```

Expected: 6 files changed:

- `lib/cron/reservation-lifecycle.ts` (new)
- `app/api/cron/expire-unpaid-reservations/route.ts` (new)
- `__tests__/lib/cron/reservation-lifecycle.test.ts` (new)
- `__tests__/api/cron/expire-unpaid-reservations.test.ts` (new)
- `vercel.json` (new)
- `supabase/migrations/012_document_pg_cron_retirement.sql` (new)

Any other files in the diff: investigate before pushing.

- [ ] **Step 3:** Push the feature branch to origin.

```bash
git push -u origin feature/phase-3-vercel-cron
```

If SSH push fails (recurring issue in this environment), pause for Diego to push manually.

- [ ] **Step 4:** Open PR targeting `main`.

```bash
gh pr create --base main --head feature/phase-3-vercel-cron \
  --title "feat: Vercel Cron self-heal for unpaid reservations (Phase 3 of recovery)" \
  --body "$(cat <<'EOF'
## Summary

Phase 3 of the reservation webhook recovery plan. Replaces the paused pg_cron job with a Vercel Cron route that consults Stripe before cancelling — defense-in-depth against the bug class that caused the Phase 1 incident.

**Components:**

1. **`/api/cron/expire-unpaid-reservations` route** — hourly Vercel Cron. For each `reserved_unpaid` row past `expires_at`, retrieves the Stripe Checkout Session. Restores (`reserved_paid` + order row) on `paid` / `no_payment_required`, cancels otherwise. Errors are caught per row and counted — fail-open so a Stripe outage does not cancel paid customers.

2. **`lib/cron/reservation-lifecycle.ts`** — pure helpers `cancelReservation` and `restoreReservationAsPaid`. Mirror the side effects of the original plpgsql function and `fulfillCheckoutSession()` respectively.

3. **`vercel.json`** — adds `/api/cron/expire-unpaid-reservations` on `0 * * * *`.

4. **`012_document_pg_cron_retirement.sql`** — comment-only migration recording the handoff.

## Defense-in-depth

| Scenario | Behavior |
|---|---|
| Webhook works | Most rows flip to `reserved_paid` in seconds, never reach cron |
| Webhook breaks again | Cron catches it within an hour and self-heals |
| Stripe down at cron time | Per-row try/catch records `errored++`, row left alone, next hour retries |
| Stripe says `unpaid` after 24h | Genuine abandonment — cancel as before |

## Test plan

- [x] Unit tests cover: no-session cancel, paid restore, no_payment_required restore, unpaid cancel, Stripe error fail-open, multi-row partial failure, and the 401 unauthorized path
- [x] Full Jest suite passes
- [x] `npx tsc --noEmit` clean
- [ ] CRON_SECRET confirmed set in Vercel Production env (Diego — pre-merge)
- [ ] After merge, manual smoke test: trigger preview deploy URL with `Authorization: Bearer <CRON_SECRET>`, confirm `{processed: 0}` against a clean preview DB
- [ ] After prod deploy, Vercel Cron logs show hourly hits with `processed=N, restored=0, cancelled=0` once the system is healthy

## Spec

`docs/plans/2026-04-29-reservation-webhook-recovery-design.md` § Phase 3
EOF
)"
```

- [ ] **Step 5:** Note the PR URL returned. Surface it to the user.

---

## Task 9: Post-merge smoke test on production

**Files:** none

After merge + Vercel auto-deploy, do a one-shot manual probe so we confirm the route is actually wired.

- [ ] **Step 1:** From Diego's terminal (where Vercel CLI auth is loaded), pull the cron secret:

```bash
vercel env pull .env.production.local
grep ^CRON_SECRET .env.production.local
```

If absent, set it:

```bash
vercel env add CRON_SECRET production
# paste a generated 64-char random token
```

- [ ] **Step 2:** Probe the prod route once with auth.

```bash
SECRET=$(grep ^CRON_SECRET .env.production.local | cut -d= -f2 | tr -d '"')
curl -sS https://www.navomarine.com/api/cron/expire-unpaid-reservations \
  -H "Authorization: Bearer $SECRET"
```

Expected JSON shape: `{"processed":N,"restored":0,"cancelled":0,"errored":0}` where `N` is the count of rows currently past `expires_at` (likely small since Phase 2 backfill cleaned up the historical batch).

- [ ] **Step 3:** Watch the Vercel Cron tab for the next hourly fire.

Vercel Dashboard → navo-marine → Cron Jobs. The new entry should appear after first deploy. Subsequent fires log to the function logs and should show the same `[cron] ...` lines (and no error counters in steady state).

- [ ] **Step 4:** Clean up the local env file.

```bash
shred -u .env.production.local 2>/dev/null || rm .env.production.local
```

(Avoid leaving a copy of `CRON_SECRET` on the laptop.)

---

## Acceptance criteria (recap from spec)

- [x] Unit tests cover: no session, paid session, unpaid session, Stripe 404, multi-row partial failure
- [ ] Manual integration smoke test on a Vercel preview: trigger the cron route with a valid `CRON_SECRET`, verify it returns `{processed: 0}` against a clean DB
- [ ] After deploy to prod, Vercel Cron logs show hourly hits with `processed=N, restored=0, cancelled=0` once the system is healthy

---

## Risks (recap from spec)

- **`CRON_SECRET` env var absent on first deploy.** Mitigation: Pre-flight check in Task 0. If still missing, Vercel auto-generates on first cron config.
- **First cron run after Phase 3 is the first integration test of self-heal logic in production.** Acceptable risk because the route is fail-open: errors leave rows unchanged, next hourly run retries.
- **Webhook re-enabled before this lands.** If a customer pays during the gap between Phase 1 (webhook fixed) and Phase 3 (cron replaced), and they abandon checkout for >24h, their `reserved_unpaid` row will sit forever until manually trashed. Acceptable per Phase 1 plan's documented side effect.

---

## Out of scope (deferred to subsequent phases)

| Item | Phase |
|---|---|
| Sticky Actions column + CSV export in admin reservations | 4 |
| Playwright E2E + GHA scheduled probe + Resend alerts on webhook regression | 5 |
| `vercel.ts` migration (replace `vercel.json` with TypeScript config) | Separate cleanup |
| `/admin/orders` page (currently no UI for the orders table) | Separate cleanup |
| Atlas 2 product seed migration so Supabase preview branches replay cleanly | Separate cleanup |

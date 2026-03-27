# Track A — Final MVP Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 3 remaining Track A blockers before first production booking: fix the unit assignment dropdown, build the admin KPI dashboard, and add webhook integration tests.

**Architecture:** Three independent slices. Unit dropdown fix is a server-component data change + component prop change — no new API route needed. KPI dashboard replaces the `/admin` redirect with a server component that aggregates from existing tables. Webhook integration tests add a second test file that exercises the real HMAC path.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase (`supabaseAdmin`), Stripe SDK, Jest + React Testing Library

---

## Pre-flight Checks

Before starting, confirm:

- `app/admin/reservations/page.tsx` — understand the existing reservations + units fetch (units query is the one to fix)
- `app/admin/reservations/AssignUnitDropdown.tsx` — receives `units` prop; currently shows `serial_number`
- `app/admin/page.tsx` — currently just `redirect("/admin/products")`; this is what we replace
- `app/api/admin/units/[id]/route.ts` — understand the `DELETE` handler (retires unit by setting `retired_at`) — already exists, fleet management is done

> **NOTE: A2 (Fleet management) and A3 (payment double-submit) are already complete.**
> - Fleet: `AddUnitForm`, `POST /api/admin/units`, `DELETE /api/admin/units/[id]` all exist and work.
> - Double-submit: both `ReserveBookingUI` and `PackageReviewStep` already have `disabled={loading}` on their submit buttons.

---

## File Map

### Modified Files

| File | Change |
|------|--------|
| `app/admin/reservations/page.tsx` | Filter units to available-for-each-row; select `navo_number` instead of `serial_number` |
| `app/admin/reservations/AssignUnitDropdown.tsx` | Display `navo_number` instead of `serial_number` |
| `app/admin/page.tsx` | Replace redirect with KPI server component |

### New Files

| File | Purpose |
|------|---------|
| `app/admin/AdminKPICards.tsx` | Server component: revenue, bookings, fleet utilization tiles |
| `__tests__/lib/admin/filtering.test.ts` | Unit test: available-unit filtering logic |
| `__tests__/lib/stripe/webhook-integration.test.ts` | Integration test: real HMAC via `generateTestHeaderString` |

---

## Task 1: Fix Unit Assignment Dropdown

The dropdown currently:
- Shows `serial_number` (nullable — blank for many units)
- Shows ALL units including ones already assigned to other active reservations

Fix:
- Show `navo_number` (always set, e.g. "NAVO-001")
- Filter to units not currently assigned to another active reservation — computed from the reservations already in memory (no extra DB query)
- Always include the unit currently assigned to _this_ reservation so it stays selectable

**Files:**
- Modify: `app/admin/reservations/page.tsx`
- Modify: `app/admin/reservations/AssignUnitDropdown.tsx`
- Create: `__tests__/lib/admin/filtering.test.ts`

### Step 1: Write failing test for the filtering logic

Create `__tests__/lib/admin/filtering.test.ts`:

```typescript
/**
 * Tests the available-unit filtering logic extracted from the reservations page.
 * Pure function — no DB or Next.js involved.
 */

type UnitRow = { id: string; navo_number: string; status: string }
type ReservationRow = { id: string; unit_id: string | null; status: string }

const ACTIVE_STATUSES = ['reserved_unpaid', 'reserved_authorized', 'reserved_paid']

function availableUnitsForReservation(
  allUnits: UnitRow[],
  allReservations: ReservationRow[],
  reservationId: string,
  currentUnitId: string | null,
): UnitRow[] {
  const busyUnitIds = new Set(
    allReservations
      .filter((r) => r.id !== reservationId && r.unit_id && ACTIVE_STATUSES.includes(r.status))
      .map((r) => r.unit_id!),
  )
  return allUnits.filter((u) => !busyUnitIds.has(u.id) || u.id === currentUnitId)
}

const units: UnitRow[] = [
  { id: 'u1', navo_number: 'NAVO-001', status: 'available' },
  { id: 'u2', navo_number: 'NAVO-002', status: 'available' },
  { id: 'u3', navo_number: 'NAVO-003', status: 'available' },
]

it('excludes units assigned to other active reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'reserved_paid' },
    { id: 'res-2', unit_id: 'u2', status: 'reserved_unpaid' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-3', null)
  expect(result.map((u) => u.id)).toEqual(['u3'])
})

it('always includes the current unit for this reservation even if assigned elsewhere', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'reserved_paid' },
  ]
  // res-1 is the current reservation and u1 is its current unit
  const result = availableUnitsForReservation(units, reservations, 'res-1', 'u1')
  expect(result.map((u) => u.id)).toContain('u1')
})

it('includes all units when none are assigned', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: null, status: 'reserved_unpaid' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null)
  expect(result).toHaveLength(3)
})

it('does not exclude units assigned to cancelled reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'cancelled' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null)
  expect(result).toHaveLength(3)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest --testPathPatterns="__tests__/lib/admin/filtering" --no-coverage
```

Expected: FAIL (module not found or function not defined).

- [ ] **Step 3: Update `app/admin/reservations/page.tsx`**

Change the units query to select `navo_number` instead of `serial_number`, add the `Reservation` type field for `unit_id`, compute busy unit IDs, and pass filtered units per row.

Replace the units fetch:

```typescript
  const { data: units } = await supabaseAdmin
    .from('units')
    .select('id, navo_number, status')
    .is('retired_at', null)
    .order('navo_number')
```

Update the `Unit` type:

```typescript
type Unit = { id: string; navo_number: string; status: string }
```

After `const unitList = (units ?? []) as Unit[]`, add:

```typescript
  const ACTIVE_STATUSES = ['reserved_unpaid', 'reserved_authorized', 'reserved_paid']

  // Compute which unit IDs are already assigned to OTHER active reservations
  const busyUnitIds = new Set(
    rows
      .filter((r) => r.unit_id && ACTIVE_STATUSES.includes(r.status))
      .map((r) => r.unit_id!),
  )

  function availableUnitsFor(reservationId: string, currentUnitId: string | null): Unit[] {
    return unitList.filter((u) => !busyUnitIds.has(u.id) || u.id === currentUnitId)
  }
```

> Note: `busyUnitIds` includes ALL active assignments, including this row's own. That's fine — `availableUnitsFor` re-admits the current unit via the `|| u.id === currentUnitId` clause.

Update the `AssignUnitDropdown` call in the table body:

```tsx
                  <td className="px-5 py-3">
                    <AssignUnitDropdown
                      reservationId={r.id}
                      currentUnitId={r.unit_id}
                      units={availableUnitsFor(r.id, r.unit_id)}
                    />
                  </td>
```

- [ ] **Step 4: Update `app/admin/reservations/AssignUnitDropdown.tsx`**

Change the `Unit` type and option display from `serial_number` to `navo_number`:

```typescript
type Unit = { id: string; navo_number: string; status: string }
```

Change the option label:

```tsx
        <option key={u.id} value={u.id}>
          {u.navo_number}
        </option>
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npx jest --testPathPatterns="__tests__/lib/admin/filtering" --no-coverage
```

Expected: 4/4 passing.

- [ ] **Step 6: Run full build check**

```bash
npm run build 2>&1 | grep -E "error TS|Type error|Failed to compile|✓ Compiled"
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add app/admin/reservations/page.tsx app/admin/reservations/AssignUnitDropdown.tsx __tests__/lib/admin/filtering.test.ts
git commit -m "fix: unit dropdown shows navo_number and filters to available units only"
```

---

## Task 2: Admin KPI Dashboard

Replace the `/admin` redirect with a real dashboard. Fetch from existing tables.

**KPIs to show:**
- Total revenue (sum of `total_cents` on `reserved_paid` + `completed` reservations)
- Active bookings count (status in `reserved_unpaid`, `reserved_authorized`, `reserved_paid`)
- Fleet utilization (units with `status != 'available'` and `retired_at IS NULL` / total active units)
- Recent reservations (last 5, linking to `/admin/reservations`)

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `app/admin/AdminKPICards.tsx`

- [ ] **Step 1: Create `app/admin/AdminKPICards.tsx`**

This is a server component — it fetches directly from Supabase.

```tsx
// app/admin/AdminKPICards.tsx
import { supabaseAdmin } from '@/lib/db/client'

type KPI = {
  label: string
  value: string
  sub?: string
}

function KPICard({ label, value, sub }: KPI) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 font-heading text-3xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/30">{sub}</p>}
    </div>
  )
}

export async function AdminKPICards() {
  const [reservationsResult, unitsResult] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, status, total_cents, customer_email, created_at, products(name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('units')
      .select('id, status')
      .is('retired_at', null),
  ])

  const reservations = reservationsResult.data ?? []
  const units = unitsResult.data ?? []

  const paidStatuses = ['reserved_paid', 'completed']
  const activeStatuses = ['reserved_unpaid', 'reserved_authorized', 'reserved_paid']

  const totalRevenueCents = reservations
    .filter((r) => paidStatuses.includes(r.status))
    .reduce((sum, r) => sum + (r.total_cents ?? 0), 0)

  const activeBookings = reservations.filter((r) => activeStatuses.includes(r.status))

  const deployedUnits = units.filter((u) => u.status !== 'available').length
  const totalUnits = units.length

  const recentReservations = reservations.slice(0, 5) as Array<{
    id: string
    status: string
    total_cents: number
    customer_email: string
    created_at: string
    products: { name: string } | null
  }>

  const kpis: KPI[] = [
    {
      label: 'Total Revenue',
      value: `$${(totalRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
      sub: 'paid + completed bookings',
    },
    {
      label: 'Active Bookings',
      value: String(activeBookings.length),
      sub: 'pending payment or paid',
    },
    {
      label: 'Fleet Utilization',
      value: totalUnits > 0 ? `${Math.round((deployedUnits / totalUnits) * 100)}%` : '—',
      sub: `${deployedUnits} of ${totalUnits} units deployed`,
    },
  ]

  return (
    <div className="space-y-8">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <KPICard key={k.label} {...k} />
        ))}
      </div>

      {/* Recent bookings */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Recent Bookings
          </h2>
          <a href="/admin/reservations" className="text-xs text-marine-400 hover:text-marine-300">
            View all →
          </a>
        </div>
        {recentReservations.length === 0 ? (
          <p className="text-sm text-white/30">No reservations yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Package</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentReservations.map((r) => (
                  <tr key={r.id} className="bg-white/[0.02]">
                    <td className="px-5 py-3 text-white/70">{r.customer_email}</td>
                    <td className="px-5 py-3 text-white/50">{r.products?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-white/50 text-xs">{r.status.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-white/70">${(r.total_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `app/admin/page.tsx`**

```tsx
// app/admin/page.tsx
import type { Metadata } from 'next'
import { AdminKPICards } from './AdminKPICards'

export const metadata: Metadata = { title: 'Dashboard | NAVO Admin' }

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-white/40">Overview of revenue, bookings, and fleet</p>
      </div>
      <AdminKPICards />
    </div>
  )
}
```

- [ ] **Step 3: Run build check**

```bash
npm run build 2>&1 | grep -E "error TS|Type error|Failed to compile|✓ Compiled"
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx app/admin/AdminKPICards.tsx
git commit -m "feat: admin KPI dashboard — revenue, active bookings, fleet utilization"
```

---

## Task 3: Webhook Integration Tests (Low Priority)

Add a second webhook test file that exercises the real HMAC path using Stripe's `generateTestHeaderString`. The existing `__tests__/api/webhooks/stripe.test.ts` uses mocked headers — this adds a true integration-style test alongside it.

**Files:**
- Create: `__tests__/lib/stripe/webhook-integration.test.ts`

> **Note:** Do NOT modify the existing `__tests__/api/webhooks/stripe.test.ts` — it has a different structure and the registry isolation is fragile.

- [ ] **Step 1: Write the integration test**

Create `__tests__/lib/stripe/webhook-integration.test.ts`:

```typescript
/**
 * @jest-environment node
 *
 * Integration test for Stripe webhook HMAC verification.
 * Uses Stripe's generateTestHeaderString to produce a real signature.
 * Mocks Supabase to avoid DB dependency.
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/email/templates', () => ({
  bookingConfirmed: jest.fn().mockReturnValue({ to: 'test@test.com', subject: 'sub', html: '<p/>' }),
}))

import Stripe from 'stripe'
import { NextRequest } from 'next/server'

const TEST_SECRET = 'whsec_test_secret_for_integration'
const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-02-25.clover' })

function makeChain(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  for (const [k, v] of Object.entries(overrides)) chain[k] = v
  for (const key of ['select', 'update', 'insert', 'eq']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET
})

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET
})

it('returns 400 with an invalid HMAC signature', async () => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } })
  const badHeader = 't=12345,v1=badhash'

  const req = new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': badHeader },
    body: payload,
  })

  const { POST } = await import('@/app/api/webhooks/stripe/route')
  const res = await POST(req)
  expect(res.status).toBe(400)
})

it('returns 200 with a valid HMAC signature for an unhandled event type', async () => {
  const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.created', data: { object: {} } })
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
  })

  const req = new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  })

  const { supabaseAdmin } = require('@/lib/db/client')
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(makeChain())

  const { POST } = await import('@/app/api/webhooks/stripe/route')
  const res = await POST(req)
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run test — expect PASS**

```bash
npx jest --testPathPatterns="__tests__/lib/stripe/webhook-integration" --no-coverage
```

Expected: 2/2 passing.

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -8
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add __tests__/lib/stripe/webhook-integration.test.ts
git commit -m "test: webhook integration tests with real HMAC via generateTestHeaderString"
```

---

## Final Step: Update current-state.md

After all tasks complete, update `docs/context/current-state.md`:
- Mark all Track A items complete
- Note that staging E2E pass is the only remaining gate before `dev` → `main`

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | mode: SCOPE_REDUCTION, 2 deferred (KPI dashboard → P2, webhook tests kept P1) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 3 issues found, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT: CEO + ENG CLEARED — ready to implement.**

### Engineering Review Amendments (apply before implementing)

Three changes were agreed during eng review:

**1. Extract filter function** — Do NOT define `availableUnitsFor` inline in `page.tsx`. Instead:
- Create `lib/admin/unit-availability.ts` with the exported function
- Import it in `app/admin/reservations/page.tsx`
- Import it in `__tests__/lib/admin/filtering.test.ts`

This ensures tests cover the real implementation, not a hand-rolled copy.

**2. Add error feedback to `AssignUnitDropdown`** — After the PATCH call, check `response.ok`. On failure, surface an error to the admin (e.g., `alert('Failed to assign unit. Please try again.')` or `setError(...)` + inline message). Do NOT silently reset the dropdown on API failure.

**3. Add component test** — Create `__tests__/components/admin/AssignUnitDropdown.test.tsx` covering:
- Renders unit options with `navo_number`
- Calls the PATCH API on selection change
- Shows error message when API returns an error response

### Final File Map (after amendments)

| File | Action |
|------|--------|
| `lib/admin/unit-availability.ts` | **New** — exported `availableUnitsForReservation()` function |
| `app/admin/reservations/page.tsx` | Modify — import + call from lib, change units query to `navo_number` + `retired_at` filter |
| `app/admin/reservations/AssignUnitDropdown.tsx` | Modify — `navo_number` display + error feedback |
| `__tests__/lib/admin/filtering.test.ts` | **New** — imports from `lib/admin/unit-availability.ts` |
| `__tests__/components/admin/AssignUnitDropdown.test.tsx` | **New** — component render + behavior tests |

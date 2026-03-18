# Phase 5: Return Form + Customer Dashboard

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the post-rental return workflow (customer submits return condition report, admin reviews damage) and a full customer dashboard with orders, rentals, warranty, and return form pages.

**Architecture:** A `POST /api/return/[id]` route lets authenticated customers submit a return report for their own reservation — creating a `return_reports` row and updating the unit status. The customer dashboard at `/dashboard` gets a sidebar layout with Orders, Rentals, and Warranty sub-pages, each fetching data via `supabaseAdmin` keyed by `session.user.id`. An admin returns page lists all submitted reports sorted by damage-flagged first.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `lib/db/returns.ts` | Repository: create/list return reports |
| Create | `app/api/return/[id]/route.ts` | POST: customer submits return report |
| Create | `app/dashboard/layout.tsx` | Dashboard sidebar layout |
| Modify | `app/dashboard/page.tsx` | Summary: active reservation + recent order |
| Create | `app/dashboard/orders/page.tsx` | Customer order history |
| Create | `app/dashboard/orders/[id]/page.tsx` | Order detail with line items |
| Create | `app/dashboard/rentals/page.tsx` | Customer rental history |
| Create | `app/dashboard/rentals/[id]/page.tsx` | Rental detail |
| Create | `app/dashboard/rentals/[id]/return/page.tsx` | Return form page |
| Create | `app/dashboard/rentals/[id]/return/ReturnForm.tsx` | Client component: return condition form |
| Create | `app/dashboard/warranty/page.tsx` | Warranty add-ons from orders |
| Create | `app/admin/returns/page.tsx` | Admin: list return reports, damage first |
| Modify | `app/admin/layout.tsx` | Add Returns link to sidebar |
| Create | `__tests__/api/return.test.ts` | Unit tests for return route |
| Create | `__tests__/lib/db/returns.test.ts` | Unit tests for returns repository |

---

## Task 0: Returns Repository (`lib/db/returns.ts`)

**Files:**
- Create: `lib/db/returns.ts`
- Create: `__tests__/lib/db/returns.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/db/returns.test.ts
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
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (!['single', 'maybeSingle', 'order'].includes(key) && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  if (!overrides['order']) chain.order = jest.fn().mockReturnValue(chain)
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('createReturnReport', () => {
  it('inserts a return report row', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'rr-1', reservation_id: 'res-1', condition: 'good' },
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { createReturnReport } = await import('@/lib/db/returns')
    const result = await createReturnReport({
      reservationId: 'res-1',
      unitId: 'unit-1',
      submittedBy: 'user-1',
      condition: 'good',
      notes: 'All good',
    })

    expect(result.id).toBe('rr-1')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('return_reports')
  })

  it('throws on duplicate (unique constraint)', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { createReturnReport } = await import('@/lib/db/returns')
    await expect(
      createReturnReport({
        reservationId: 'res-1',
        unitId: 'unit-1',
        submittedBy: 'user-1',
        condition: 'good',
      }),
    ).rejects.toThrow()
  })
})

describe('listReturnReports', () => {
  it('returns reports ordered by damage_flagged desc, created_at desc', async () => {
    const mockData = [
      { id: 'rr-1', damage_flagged: true, condition: 'major_damage' },
      { id: 'rr-2', damage_flagged: false, condition: 'good' },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listReturnReports } = await import('@/lib/db/returns')
    const result = await listReturnReports()
    expect(result).toHaveLength(2)
    expect(result[0].damage_flagged).toBe(true)
  })
})

describe('getReturnReportByReservation', () => {
  it('returns null when no report exists', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getReturnReportByReservation } = await import('@/lib/db/returns')
    const result = await getReturnReportByReservation('res-1')
    expect(result).toBeNull()
  })
})
```

```bash
npx jest --testPathPattern=lib/db/returns --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/db/returns.ts
import { supabaseAdmin } from '@/lib/db/client'

// ── Types ──────────────────────────────────────────────────────────────────

export type ReturnReportRow = {
  id: string
  reservation_id: string
  unit_id: string | null
  submitted_by: string
  condition: 'good' | 'minor_damage' | 'major_damage'
  notes: string | null
  damage_flagged: boolean
  created_at: string
  // Joined relations
  reservations?: {
    customer_email: string
    sail_number: string | null
    products?: { name: string }
  }
  units?: { navo_number: string }
}

export type CreateReturnInput = {
  reservationId: string
  unitId: string | null
  submittedBy: string
  condition: 'good' | 'minor_damage' | 'major_damage'
  notes?: string
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createReturnReport(
  input: CreateReturnInput,
): Promise<ReturnReportRow> {
  const damageFlagged = input.condition !== 'good'

  const { data, error } = await supabaseAdmin
    .from('return_reports')
    .insert({
      reservation_id: input.reservationId,
      unit_id: input.unitId,
      submitted_by: input.submittedBy,
      condition: input.condition,
      notes: input.notes ?? null,
      damage_flagged: damageFlagged,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Return report already submitted for this reservation')
    }
    throw new Error(`createReturnReport: ${error.message}`)
  }
  return data as unknown as ReturnReportRow
}

// ── Queries ────────────────────────────────────────────────────────────────

const REPORT_SELECT = `
  *,
  reservations (
    customer_email, sail_number,
    products ( name )
  ),
  units ( navo_number )
`

export async function listReturnReports(): Promise<ReturnReportRow[]> {
  const { data, error } = await supabaseAdmin
    .from('return_reports')
    .select(REPORT_SELECT)
    .order('damage_flagged', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listReturnReports: ${error.message}`)
  return data as unknown as ReturnReportRow[]
}

export async function getReturnReportByReservation(
  reservationId: string,
): Promise<ReturnReportRow | null> {
  const { data, error } = await supabaseAdmin
    .from('return_reports')
    .select(REPORT_SELECT)
    .eq('reservation_id', reservationId)
    .maybeSingle()

  if (error) throw new Error(`getReturnReportByReservation: ${error.message}`)
  return data as unknown as ReturnReportRow | null
}
```

```bash
npx jest --testPathPattern=lib/db/returns --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/returns.ts __tests__/lib/db/returns.test.ts
git commit -m "feat(db): add returns repository — create/list return reports"
```

---

## Task 1: POST /api/return/[id] Route

**Files:**
- Create: `app/api/return/[id]/route.ts`
- Create: `__tests__/api/return.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/return.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/db/reservations', () => ({
  getReservation: jest.fn(),
}))
jest.mock('@/lib/db/returns', () => ({
  createReturnReport: jest.fn(),
  getReturnReportByReservation: jest.fn(),
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { getReservation } = require('@/lib/db/reservations') as {
  getReservation: jest.Mock
}
const { createReturnReport, getReturnReportByReservation } =
  require('@/lib/db/returns') as {
    createReturnReport: jest.Mock
    getReturnReportByReservation: jest.Mock
  }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
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

const userSession = { user: { id: 'user-1', email: 'sailor@test.com' } }

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/return/res-1', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/return/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    auth.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/return/[id]/route')
    const res = await POST(makeRequest({ condition: 'good' }), {
      params: Promise.resolve({ id: 'res-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 when user does not own the reservation', async () => {
    auth.mockResolvedValueOnce(userSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      user_id: 'other-user',
      unit_id: 'unit-1',
      status: 'reserved_paid',
    })
    getReturnReportByReservation.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/return/[id]/route')
    const res = await POST(makeRequest({ condition: 'good' }), {
      params: Promise.resolve({ id: 'res-1' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 409 when report already submitted', async () => {
    auth.mockResolvedValueOnce(userSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      user_id: 'user-1',
      unit_id: 'unit-1',
      status: 'reserved_paid',
    })
    getReturnReportByReservation.mockResolvedValueOnce({ id: 'rr-existing' })

    const { POST } = await import('@/app/api/return/[id]/route')
    const res = await POST(makeRequest({ condition: 'good' }), {
      params: Promise.resolve({ id: 'res-1' }),
    })
    expect(res.status).toBe(409)
  })

  it('creates return report and updates unit status on success', async () => {
    auth.mockResolvedValueOnce(userSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      user_id: 'user-1',
      unit_id: 'unit-1',
      status: 'reserved_paid',
    })
    getReturnReportByReservation.mockResolvedValueOnce(null)
    createReturnReport.mockResolvedValueOnce({
      id: 'rr-1',
      condition: 'good',
      damage_flagged: false,
    })

    // unit update + unit_events insert + notification insert
    const unitChain = makeChain()
    const auditChain = makeChain()
    const notifChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(unitChain)  // units update
      .mockReturnValueOnce(auditChain) // unit_events insert
      .mockReturnValueOnce(notifChain) // notifications insert

    const { POST } = await import('@/app/api/return/[id]/route')
    const res = await POST(makeRequest({ condition: 'good', notes: 'All clean' }), {
      params: Promise.resolve({ id: 'res-1' }),
    })
    expect(res.status).toBe(200)
    expect(createReturnReport).toHaveBeenCalled()
  })

  it('sets unit to damaged when condition is major_damage', async () => {
    auth.mockResolvedValueOnce(userSession)
    getReservation.mockResolvedValueOnce({
      id: 'res-1',
      user_id: 'user-1',
      unit_id: 'unit-1',
      status: 'reserved_paid',
    })
    getReturnReportByReservation.mockResolvedValueOnce(null)
    createReturnReport.mockResolvedValueOnce({
      id: 'rr-1',
      condition: 'major_damage',
      damage_flagged: true,
    })

    const unitChain = makeChain()
    const auditChain = makeChain()
    const notifChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(unitChain)
      .mockReturnValueOnce(auditChain)
      .mockReturnValueOnce(notifChain)

    const { POST } = await import('@/app/api/return/[id]/route')
    const res = await POST(
      makeRequest({ condition: 'major_damage', notes: 'Cracked screen' }),
      { params: Promise.resolve({ id: 'res-1' }) },
    )
    expect(res.status).toBe(200)

    // Verify unit was updated to 'damaged'
    expect(supabaseAdmin.from).toHaveBeenCalledWith('units')
  })
})
```

```bash
npx jest --testPathPattern=api/return --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// app/api/return/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'
import { getReservation } from '@/lib/db/reservations'
import { createReturnReport, getReturnReportByReservation } from '@/lib/db/returns'

const VALID_CONDITIONS = ['good', 'minor_damage', 'major_damage'] as const
type Condition = typeof VALID_CONDITIONS[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth — any logged-in user
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: reservationId } = await params
  const body = (await req.json()) as { condition: string; notes?: string }

  // 2. Validate condition
  if (!body.condition || !VALID_CONDITIONS.includes(body.condition as Condition)) {
    return NextResponse.json(
      { error: 'condition must be one of: good, minor_damage, major_damage' },
      { status: 400 },
    )
  }

  // 3. Get reservation and verify ownership
  const reservation = await getReservation(reservationId)
  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }
  if (reservation.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Check for existing report (unique constraint)
  const existingReport = await getReturnReportByReservation(reservationId)
  if (existingReport) {
    return NextResponse.json(
      { error: 'Return report already submitted for this reservation' },
      { status: 409 },
    )
  }

  // 5. Create return report
  const condition = body.condition as Condition
  const report = await createReturnReport({
    reservationId,
    unitId: reservation.unit_id,
    submittedBy: session.user.id ?? '',
    condition,
    notes: body.notes,
  })

  // 6. Update unit status if unit is assigned
  if (reservation.unit_id) {
    const newUnitStatus = condition === 'good' ? 'returned' : 'damaged'

    await supabaseAdmin
      .from('units')
      .update({ status: newUnitStatus })
      .eq('id', reservation.unit_id)

    await supabaseAdmin.from('unit_events').insert({
      unit_id: reservation.unit_id,
      event_type: 'status_changed',
      from_status: 'reserved_paid',
      to_status: newUnitStatus,
      actor_type: 'customer',
      actor_id: session.user.id,
      notes: `Return report: ${condition}${body.notes ? ` — ${body.notes}` : ''}`,
    })
  }

  // 7. Create notification
  await supabaseAdmin.from('notifications').insert({
    user_id: session.user.id ?? '',
    message: 'Return report submitted successfully.',
    link: `/dashboard/rentals/${reservationId}`,
  })

  // 8. Update reservation status to completed
  await supabaseAdmin
    .from('reservations')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', reservationId)

  return NextResponse.json({ report })
}
```

```bash
npx jest --testPathPattern=api/return --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/return/[id]/route.ts __tests__/api/return.test.ts
git commit -m "feat(api): add POST /api/return/[id] — customer return report submission"
```

---

## Task 2: Customer Dashboard Layout + Summary Page

**Files:**
- Create: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard layout**

```typescript
// app/dashboard/layout.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <>
      <Navbar />
      <div className="flex min-h-screen bg-navy-900 pt-20">
        {/* Sidebar */}
        <aside className="hidden w-56 flex-col border-r border-white/10 bg-navy-800 md:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Dashboard
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Orders
            </Link>
            <Link
              href="/dashboard/rentals"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Rentals
            </Link>
            <Link
              href="/dashboard/warranty"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Warranty
            </Link>
          </nav>
          <div className="border-t border-white/10 px-4 py-4">
            <p className="truncate text-xs text-white/30">{session.user.email}</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update dashboard page**

Update `app/dashboard/page.tsx` to show a summary of active reservation + recent order, replacing the current stub. This is a server component that queries reservations and orders for the current user.

The page should show:
- Welcome greeting with user name
- Active Reservation card (if any `reserved_paid` reservation exists) — shows event name, sail number, assigned unit
- Recent Order card (if any) — shows order number, total, status
- Quick links to Orders and Rentals pages

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/layout.tsx app/dashboard/page.tsx
git commit -m "feat(dashboard): add sidebar layout and summary overview page"
```

---

## Task 3: Customer Orders Pages

**Files:**
- Create: `app/dashboard/orders/page.tsx`
- Create: `app/dashboard/orders/[id]/page.tsx`

- [ ] **Step 1: Create orders list page**

`app/dashboard/orders/page.tsx` — server component that queries orders for `session.user.id`. Renders a table with: Order Number, Date, Status badge, Total. Each row links to detail page.

- [ ] **Step 2: Create order detail page**

`app/dashboard/orders/[id]/page.tsx` — server component that queries order + order_items for the given ID. Validates the order belongs to the current user. Shows: order number, date, status, payment info, line items table (title, quantity, unit price, subtotal), total.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/orders/
git commit -m "feat(dashboard): add customer orders list and detail pages"
```

---

## Task 4: Customer Rentals Pages + Return Form

**Files:**
- Create: `app/dashboard/rentals/page.tsx`
- Create: `app/dashboard/rentals/[id]/page.tsx`
- Create: `app/dashboard/rentals/[id]/return/page.tsx`
- Create: `app/dashboard/rentals/[id]/return/ReturnForm.tsx`

- [ ] **Step 1: Create rentals list page**

`app/dashboard/rentals/page.tsx` — server component that queries reservations where `reservation_type IN ('rental_event', 'rental_custom')` for the current user. Renders table with: Event Name, Sail Number, Unit (if assigned), Status badge, Date. Each row links to detail.

- [ ] **Step 2: Create rental detail page**

`app/dashboard/rentals/[id]/page.tsx` — server component showing: reservation status, event info, sail number, assigned unit number, payment amount, return report status. If `reserved_paid` and event has ended and no return report exists, shows a link to the return form.

- [ ] **Step 3: Create return form page + component**

```typescript
// app/dashboard/rentals/[id]/return/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getReservation } from '@/lib/db/reservations'
import { getReturnReportByReservation } from '@/lib/db/returns'
import { ReturnForm } from './ReturnForm'

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const reservation = await getReservation(id)

  if (!reservation || reservation.user_id !== session.user.id) {
    redirect('/dashboard/rentals')
  }

  const existingReport = await getReturnReportByReservation(id)

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold text-white mb-2">
        Return Report
      </h1>
      <p className="text-sm text-white/40 mb-8">
        Sail #{reservation.sail_number} — {reservation.rental_events?.name ?? 'Custom Rental'}
      </p>

      {existingReport ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/60">
            Return report already submitted on{' '}
            {new Date(existingReport.created_at).toLocaleDateString()}.
          </p>
          <p className="mt-2 text-sm text-white/40">
            Condition: <span className="text-white">{existingReport.condition}</span>
          </p>
          {existingReport.notes && (
            <p className="mt-1 text-sm text-white/40">Notes: {existingReport.notes}</p>
          )}
        </div>
      ) : (
        <ReturnForm reservationId={id} />
      )}
    </div>
  )
}
```

```typescript
// app/dashboard/rentals/[id]/return/ReturnForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Condition = 'good' | 'minor_damage' | 'major_damage'

const CONDITIONS: { value: Condition; label: string; description: string }[] = [
  { value: 'good', label: 'Good', description: 'Unit is in good condition, no issues.' },
  { value: 'minor_damage', label: 'Minor Damage', description: 'Cosmetic scratches or minor wear.' },
  { value: 'major_damage', label: 'Major Damage', description: 'Functional damage requiring repair.' },
]

export function ReturnForm({ reservationId }: { reservationId: string }) {
  const router = useRouter()
  const [condition, setCondition] = useState<Condition | ''>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!condition) return

    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/return/${reservationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, notes: notes || undefined }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Submission failed')
        return
      }

      setSubmitted(true)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6">
        <p className="text-sm text-green-400">Return report submitted successfully.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-white mb-3">Unit Condition</legend>
        <div className="space-y-3">
          {CONDITIONS.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                condition === c.value
                  ? 'border-marine-500 bg-marine-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <input
                type="radio"
                name="condition"
                value={c.value}
                checked={condition === c.value}
                onChange={() => setCondition(c.value)}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-medium text-white">{c.label}</span>
                <p className="text-xs text-white/40">{c.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm text-white/60 mb-2 block">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Describe any issues or observations..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 resize-none"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!condition || loading}
        className="glass-btn glass-btn-primary w-full rounded-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
      >
        {loading ? 'Submitting...' : 'Submit Return Report'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/rentals/
git commit -m "feat(dashboard): add customer rentals list, detail, and return form"
```

---

## Task 5: Customer Warranty Page

**Files:**
- Create: `app/dashboard/warranty/page.tsx`

- [ ] **Step 1: Create warranty page**

`app/dashboard/warranty/page.tsx` — server component that queries order_items where `item_type = 'addon'` and the addon is a warranty type, joined with orders for the current user. Shows a list of warranty add-ons with purchase date and order number. If no warranties, shows empty state.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/warranty/
git commit -m "feat(dashboard): add customer warranty page"
```

---

## Task 6: Admin Returns Page

**Files:**
- Create: `app/admin/returns/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Create admin returns page**

`app/admin/returns/page.tsx` — server component that calls `listReturnReports()` and renders a table sorted damage-flagged first. Columns: Damage flag (red badge), Customer Email, Unit Number, Condition, Notes, Date. Each row with a damaged unit shows a "Mark Repaired" button that calls `PATCH /api/admin/units/[id]` with `{ status: 'available' }`.

- [ ] **Step 2: Add Returns link to admin sidebar**

In `app/admin/layout.tsx`, add after Reservations:

```tsx
<Link
  href="/admin/returns"
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
>
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
  Returns
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/returns/ app/admin/layout.tsx
git commit -m "feat(admin): add returns list page with damage flag view"
```

---

## Task 7: E2E Gate — Return with Damage

- [ ] **Step 1: Create E2E test**

```typescript
// e2e/return-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Return Flow', () => {
  test('customer sees return form for completed rental', async ({ page }) => {
    // Requires: authenticated user with a reserved_paid reservation
    await page.goto('/dashboard/rentals')
    await expect(page.locator('h1')).toContainText('Rentals')
  })

  test('admin sees returns list with damage flags', async ({ page }) => {
    // Requires: admin auth session
    await page.goto('/admin/returns')
    await expect(page.locator('h1')).toContainText('Returns')
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- --grep "Return Flow"
```

> **Note:** Damage notification emails (to customer and admin) are wired in Phase 6.
> This gate verifies unit status transitions and form behavior only.

- [ ] **Step 3: Commit**

```bash
git add e2e/return-flow.spec.ts
git commit -m "test(e2e): add return flow tests"
```

---

## Summary

After completing all tasks:
- `POST /api/return/[id]` — auth-gated, ownership-checked, creates return report, updates unit status (returned/damaged), creates notification
- `lib/db/returns.ts` — create/list/get return reports
- Customer dashboard with sidebar layout: Overview, Orders, Rentals, Warranty
- Return form disabled after submission (idempotent)
- Admin returns page showing damage-flagged reports first with "Mark Repaired" action
- All routes require auth. Return endpoint verifies user owns the reservation.

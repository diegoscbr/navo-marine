# Event Auto-Link & Reservation Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Auto-create `rental_event_products` rows when an admin creates a new event, linking all available products. (2) Allow admins to delete reservations (unpaid, cancelled, or paid-past-date) with a confirmation popup, nulling out any associated orders before delete.

**Architecture:** Feature 1 is a backend-only change to `POST /api/admin/events` — after inserting the event, query all `individual_rental` products and bulk-insert `rental_event_products` rows with auto-calculated `rental_price_cents`. Feature 2 adds a new `DELETE /api/admin/reservations/[id]` route with eligibility checks, a client-side `DeleteReservationButton` component with a confirmation dialog, and integration into the existing reservations page.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (supabaseAdmin), Jest + React Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/admin/events/route.ts` | Modify | POST handler: after event insert, query products + bulk-insert `rental_event_products` |
| `app/api/admin/reservations/[id]/route.ts` | Create | DELETE handler: eligibility check, null out orders, delete reservation |
| `app/admin/reservations/DeleteReservationButton.tsx` | Create | Client component: trash icon + confirmation dialog + fetch DELETE |
| `app/admin/reservations/page.tsx` | Modify | Add `DeleteReservationButton` to each eligible row |
| `__tests__/api/admin/events.test.ts` | Modify | Add tests for auto-link behavior in POST |
| `__tests__/api/admin/reservations-delete.test.ts` | Create | Full test suite for DELETE route |
| `__tests__/components/admin/DeleteReservationButton.test.tsx` | Create | Component tests for confirmation flow |

---

## Task 1: Auto-link events to products on creation

### Files:
- Modify: `app/api/admin/events/route.ts:30-66` (POST handler)
- Modify: `__tests__/api/admin/events.test.ts` (add auto-link tests)

- [ ] **Step 1: Write the failing test — auto-link inserts rental_event_products**

Add this test to `__tests__/api/admin/events.test.ts` inside the `POST /api/admin/events` describe block:

```typescript
it('auto-links all individual_rental products after creating event', async () => {
  auth.mockResolvedValue(ADMIN_SESSION)

  const newEvent = {
    id: 'e3',
    name: 'Auto-Link Event',
    location: 'Miami',
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    active: true,
  }

  const products = [
    { id: 'p1', name: 'Vakaros Atlas 2', price_per_day_cents: 3500 },
    { id: 'p2', name: 'Tablet (Internal)', price_per_day_cents: null },
  ]

  // Track all from() calls in order
  const fromCalls: string[] = []

  // Chain for rental_events insert
  const eventChain = makeChain({
    single: jest.fn().mockResolvedValue({ data: newEvent, error: null }),
  })

  // Chain for products query
  const productsChain = makeChain({
    eq: jest.fn().mockResolvedValue({ data: products, error: null }),
  })

  // Chain for rental_event_products insert
  const linkChain = makeChain({
    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
  })

  supabaseAdmin.from.mockImplementation((table: string) => {
    fromCalls.push(table)
    if (table === 'rental_events') return eventChain
    if (table === 'products') return productsChain
    if (table === 'rental_event_products') return linkChain
    return makeChain()
  })

  const { POST } = await import('@/app/api/admin/events/route')
  const req = new NextRequest('http://localhost/api/admin/events', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Auto-Link Event',
      location: 'Miami',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    }),
  })
  const res = await POST(req)
  expect(res.status).toBe(201)

  // Verify products were queried
  expect(fromCalls).toContain('products')

  // Verify rental_event_products insert was called
  expect(fromCalls).toContain('rental_event_products')

  // Verify the insert payload
  const insertCall = linkChain.insert.mock.calls[0][0]
  expect(insertCall).toHaveLength(2)

  // 5 days * $35/day = $175 = 17500 cents for Atlas 2
  expect(insertCall[0]).toEqual({
    event_id: 'e3',
    product_id: 'p1',
    rental_price_cents: 17500,
    late_fee_cents: 3500,
    reserve_cutoff_days: 14,
    capacity: 40,
    inventory_status: 'in_stock',
    rental_price_per_day_cents: 3500,
  })

  // Tablet has no price_per_day_cents, so rental_price_cents = 0
  expect(insertCall[1]).toEqual({
    event_id: 'e3',
    product_id: 'p2',
    rental_price_cents: 0,
    late_fee_cents: 3500,
    reserve_cutoff_days: 14,
    capacity: 40,
    inventory_status: 'in_stock',
    rental_price_per_day_cents: null,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runTestsByPath __tests__/api/admin/events.test.ts --no-coverage`
Expected: FAIL — the POST handler does not query products or insert rental_event_products.

- [ ] **Step 3: Implement auto-link in POST handler**

Replace the POST handler in `app/api/admin/events/route.ts`:

```typescript
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name: string
    location: string
    event_url?: string
    start_date: string
    end_date: string
    active?: boolean
  }

  if (!body.name || !body.location || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'name, location, start_date, end_date are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .insert({
      name: body.name,
      location: body.location,
      event_url: body.event_url ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
      active: body.active ?? true,
    })
    .select('id, name, location, event_url, start_date, end_date, active, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-link all individual_rental products to this event
  const eventDays = Math.max(
    1,
    Math.ceil(
      (new Date(body.end_date).getTime() - new Date(body.start_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1,
  )

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, price_per_day_cents')
    .eq('category', 'individual_rental')

  if (products && products.length > 0) {
    const allocations = products.map((p: { id: string; price_per_day_cents: number | null }) => ({
      event_id: data.id,
      product_id: p.id,
      rental_price_cents: (p.price_per_day_cents ?? 0) * eventDays,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 40,
      inventory_status: 'in_stock',
      rental_price_per_day_cents: p.price_per_day_cents ?? null,
    }))

    await supabaseAdmin.from('rental_event_products').insert(allocations)
  }

  return NextResponse.json({ event: data }, { status: 201 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runTestsByPath __tests__/api/admin/events.test.ts --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Run the full existing test suite to check for regressions**

Run: `npx jest --runTestsByPath __tests__/api/admin/events.test.ts --no-coverage`
Expected: All 6+ tests pass (including the 4 pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/events/route.ts __tests__/api/admin/events.test.ts
git commit -m "feat: auto-link all individual_rental products when creating events"
```

---

## Task 2: DELETE reservation API route

### Files:
- Create: `app/api/admin/reservations/[id]/route.ts`
- Create: `__tests__/api/admin/reservations-delete.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/admin/reservations-delete.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

const ADMIN_SESSION = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const NON_ADMIN = { user: { email: 'user@gmail.com', id: 'u2' } }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('DELETE /api/admin/reservations/[id]', () => {
  const makeReq = () =>
    new NextRequest('http://localhost/api/admin/reservations/r1', {
      method: 'DELETE',
    })

  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when reservation not found', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const chain = makeChain({
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 for reserved_paid reservation with future end_date', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_paid',
      end_date: '2099-12-31',
      event_id: null,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows delete of reserved_unpaid reservation', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_unpaid',
      end_date: '2099-12-31',
      event_id: null,
    }

    const fromCalls: string[] = []

    // Reservation lookup
    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    // Orders update (null out reservation_id)
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    // Reservation delete
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'reservations') {
        reservationCallCount++
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
    expect(fromCalls).toContain('orders')
    expect(fromCalls.filter((t) => t === 'reservations')).toHaveLength(2)
  })

  it('allows delete of reserved_paid reservation with past end_date', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_paid',
      end_date: '2020-01-01',
      event_id: null,
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      reservationCallCount =
        table === 'reservations' ? reservationCallCount + 1 : reservationCallCount
      if (table === 'reservations') {
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
  })

  it('allows delete of cancelled reservation', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'cancelled',
      end_date: '2099-12-31',
      event_id: null,
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      reservationCallCount =
        table === 'reservations' ? reservationCallCount + 1 : reservationCallCount
      if (table === 'reservations') {
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runTestsByPath __tests__/api/admin/reservations-delete.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DELETE route**

Create `app/api/admin/reservations/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

const DELETABLE_WITHOUT_DATE_CHECK = new Set(['reserved_unpaid', 'cancelled'])

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch reservation with event info for date check
  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, end_date, event_id')
    .eq('id', id)
    .single()

  if (fetchError || !reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  // Eligibility check
  const { status, end_date } = reservation as {
    id: string
    status: string
    end_date: string | null
    event_id: string | null
  }

  if (!DELETABLE_WITHOUT_DATE_CHECK.has(status)) {
    // For paid/authorized — only allow if end_date is in the past
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const endDate = end_date ? new Date(end_date) : null

    if (!endDate || endDate >= now) {
      return NextResponse.json(
        { error: 'Paid reservations can only be deleted after their end date' },
        { status: 403 },
      )
    }
  }

  // Null out orders.reservation_id before deleting
  await supabaseAdmin
    .from('orders')
    .update({ reservation_id: null })
    .eq('reservation_id', id)

  // Delete reservation (reservation_units cascade automatically)
  const { error: deleteError } = await supabaseAdmin
    .from('reservations')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runTestsByPath __tests__/api/admin/reservations-delete.test.ts --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/reservations/[id]/route.ts __tests__/api/admin/reservations-delete.test.ts
git commit -m "feat: DELETE /api/admin/reservations/[id] with eligibility checks"
```

---

## Task 3: Delete reservation button component

### Files:
- Create: `app/admin/reservations/DeleteReservationButton.tsx`
- Create: `__tests__/components/admin/DeleteReservationButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/admin/DeleteReservationButton.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteReservationButton } from '@/app/admin/reservations/DeleteReservationButton'

// Mock useRouter
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

describe('DeleteReservationButton', () => {
  it('renders trash icon button', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('shows confirmation dialog on click', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByText(/rental_event/i)).toBeInTheDocument()
  })

  it('calls DELETE API and refreshes on confirm', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/reservations/r1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('closes dialog on cancel', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Cannot delete active reservation' }),
    })

    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByText(/cannot delete/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runTestsByPath __tests__/components/admin/DeleteReservationButton.test.tsx --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DeleteReservationButton**

Create `app/admin/reservations/DeleteReservationButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  reservationId: string
  customerEmail: string
  reservationType: string
}

export function DeleteReservationButton({
  reservationId,
  customerEmail,
  reservationType,
}: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Failed to delete')
        return
      }
      setShowConfirm(false)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setShowConfirm(true); setError(null) }}
        aria-label="Delete reservation"
        className="rounded p-1 text-white/30 transition-colors hover:bg-red-500/20 hover:text-red-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <h3 className="font-heading text-base font-semibold text-white">
              Are you sure?
            </h3>
            <p className="mt-2 text-sm text-white/60">
              This will permanently delete the{' '}
              <span className="text-white/80">{reservationType}</span>{' '}
              reservation for{' '}
              <span className="text-white/80">{customerEmail}</span>.
            </p>
            <p className="mt-1 text-xs text-white/40">
              Associated units will be freed. This cannot be undone.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                aria-label="Confirm delete"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                aria-label="Cancel"
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runTestsByPath __tests__/components/admin/DeleteReservationButton.test.tsx --no-coverage`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/reservations/DeleteReservationButton.tsx __tests__/components/admin/DeleteReservationButton.test.tsx
git commit -m "feat: DeleteReservationButton with confirmation dialog"
```

---

## Task 4: Wire delete button into reservations page

### Files:
- Modify: `app/admin/reservations/page.tsx`

- [ ] **Step 1: Add import and eligibility helper**

At the top of `app/admin/reservations/page.tsx`, add the import:

```typescript
import { DeleteReservationButton } from './DeleteReservationButton'
```

Add this helper function inside the component, after the `statusCounts` block:

```typescript
function canDelete(r: Reservation): boolean {
  if (r.status === 'reserved_unpaid' || r.status === 'cancelled') return true
  if (r.status === 'reserved_paid' || r.status === 'completed') {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const endDate = r.end_date ? new Date(r.end_date) : null
    return endDate !== null && endDate < now
  }
  return false
}
```

- [ ] **Step 2: Add Actions column header**

In the `<thead>` row, after the `Created` header, add:

```tsx
<th className="px-5 py-3">Actions</th>
```

- [ ] **Step 3: Add delete button cell to each row**

In the `<tbody>`, after the `Created` `<td>` for each row, add:

```tsx
<td className="px-5 py-3">
  {canDelete(r) && (
    <DeleteReservationButton
      reservationId={r.id}
      customerEmail={r.customer_email}
      reservationType={r.reservation_type}
    />
  )}
</td>
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build 2>&1 | head -30` (or `npm run build`)
Expected: No TypeScript errors related to the reservations page.

- [ ] **Step 5: Commit**

```bash
git add app/admin/reservations/page.tsx
git commit -m "feat: wire delete button into admin reservations table"
```

---

## Task 5: Stripe refund instructions document

### Files:
- Create: `docs/admin/stripe-manual-refund.md`

- [ ] **Step 1: Write the refund instructions**

Create `docs/admin/stripe-manual-refund.md`:

```markdown
# Manual Stripe Refund Guide

When deleting a paid reservation from the admin dashboard, no automatic refund is issued. Follow these steps to process a refund through Stripe.

## Steps

1. **Go to Stripe Dashboard**
   - Production: https://dashboard.stripe.com/payments
   - Test mode: https://dashboard.stripe.com/test/payments

2. **Find the payment**
   - Search by customer email or the reservation's `stripe_payment_intent_id`
   - Or browse recent payments and match by amount/date

3. **Issue the refund**
   - Click the payment to open details
   - Click **"Refund"** in the top-right
   - Choose **Full refund** or enter a **Partial refund** amount
   - Select a reason (e.g., "Requested by customer")
   - Click **"Refund"**

4. **Verify**
   - Payment status changes to **"Refunded"** (full) or **"Partially refunded"**
   - Customer receives a refund confirmation email from Stripe
   - Refund typically takes 5-10 business days to appear on the customer's statement

## Notes

- Stripe refunds can only be issued within **180 days** of the original charge
- Stripe fees on the original charge are **not** returned on refund
- For held payments (`reserved_authorized`), use **"Cancel payment"** instead of refund — this releases the hold without charging
```

- [ ] **Step 2: Commit**

```bash
git add docs/admin/stripe-manual-refund.md
git commit -m "docs: add manual Stripe refund instructions for admin"
```

---

## Verification

After all tasks are complete:

- [ ] Run all new + modified tests together:

```bash
npx jest --runTestsByPath \
  __tests__/api/admin/events.test.ts \
  __tests__/api/admin/reservations-delete.test.ts \
  __tests__/components/admin/DeleteReservationButton.test.tsx \
  --no-coverage
```

Expected: ALL PASS

- [ ] Run lint on changed files:

```bash
npx eslint \
  app/api/admin/events/route.ts \
  app/api/admin/reservations/[id]/route.ts \
  app/admin/reservations/DeleteReservationButton.tsx \
  app/admin/reservations/page.tsx
```

Expected: No errors

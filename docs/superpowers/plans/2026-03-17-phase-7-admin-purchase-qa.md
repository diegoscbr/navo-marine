# Phase 7: Admin Dashboard + Purchase Flow + QA

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin KPI dashboard and event management, add the purchase checkout flow for product sales, add an Admin link to the Navbar, and run a full end-to-end QA walkthrough of the complete system.

**Architecture:** The admin dashboard page displays real-time KPIs (available units, out on rental, expiring unpaid, open damage reports) and a recent activity feed from `unit_events`. Admin event management provides CRUD for rental events with product capacity editing. The purchase flow extends `POST /api/checkout` to handle `reservation_type: 'purchase'` — creating a cart, Stripe session, and reservation without requiring a sail number or event. The webhook handler is extended to mark units as `sold` for purchases. The Navbar shows an Admin link when the user's email ends in `@navomarine.com`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `app/admin/page.tsx` | KPI dashboard with unit counts + activity feed |
| Create | `app/admin/events/page.tsx` | List rental events with allocations |
| Create | `app/admin/events/[id]/page.tsx` | Event detail with capacity editing |
| Create | `app/admin/events/AddEventForm.tsx` | Client component: add event form |
| Create | `app/api/admin/events/route.ts` | GET/POST rental events |
| Create | `app/api/admin/events/[id]/route.ts` | PATCH/DELETE rental events |
| Create | `app/admin/orders/page.tsx` | Financial view: all orders |
| Modify | `app/admin/layout.tsx` | Add Events + Orders links to sidebar |
| Create | `app/checkout/page.tsx` | Purchase checkout page |
| Create | `app/checkout/CheckoutForm.tsx` | Client component: shipping + pay |
| Modify | `app/api/checkout/route.ts` | Handle `reservation_type: 'purchase'` |
| Modify | `app/api/stripe/webhook/route.ts` | Handle purchase completion: mark unit sold |
| Modify | `components/layout/Navbar.tsx` | Show Admin link for @navomarine.com users |
| Create | `__tests__/api/admin/events.test.ts` | Unit tests for events admin routes |
| Create | `__tests__/api/checkout-purchase.test.ts` | Unit tests for purchase checkout |

---

## Task 0: Admin KPI Dashboard

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Implement KPI dashboard**

The admin page should be a server component that queries:
1. `units` — COUNT by status (available, reserved_paid, damaged)
2. `reservations` — COUNT where status = 'reserved_unpaid' and expires_at < now() + 24h
3. `return_reports` — COUNT where damage_flagged = true
4. `unit_events` — recent 10 events ordered by created_at desc

Display as a grid of KPI cards + a recent activity table.

```typescript
// app/admin/page.tsx
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session?.user?.email?.endsWith('@navomarine.com')) {
    return <p className="text-white">Unauthorized</p>
  }

  // Parallel KPI queries
  const [
    { count: availableCount },
    { count: rentalCount },
    { count: damagedCount },
    { count: expiringCount },
    { data: recentActivity },
  ] = await Promise.all([
    supabaseAdmin
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available')
      .is('retired_at', null),
    supabaseAdmin
      .from('units')
      .select('id', { count: 'exact', head: true })
      .in('status', ['reserved_paid', 'in_transit', 'at_event'])
      .is('retired_at', null),
    supabaseAdmin
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'damaged')
      .is('retired_at', null),
    supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reserved_unpaid'),
    supabaseAdmin
      .from('unit_events')
      .select('id, unit_id, event_type, from_status, to_status, actor_type, notes, created_at, units(navo_number)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const kpis = [
    { label: 'Available Units', value: availableCount ?? 0, color: 'text-green-400' },
    { label: 'Out on Rental', value: rentalCount ?? 0, color: 'text-marine-500' },
    { label: 'Unpaid Reservations', value: expiringCount ?? 0, color: 'text-yellow-400' },
    { label: 'Damaged Units', value: damagedCount ?? 0, color: 'text-red-400' },
  ]

  type ActivityRow = {
    id: string
    unit_id: string
    event_type: string
    from_status: string | null
    to_status: string | null
    actor_type: string
    notes: string | null
    created_at: string
    units: { navo_number: string } | null
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold text-white mb-8">Dashboard</h1>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-10">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-white/10 bg-white/5 p-6"
          >
            <p className="text-xs uppercase tracking-widest text-white/40">{kpi.label}</p>
            <p className={`mt-2 text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-white/40">
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status Change</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {((recentActivity ?? []) as ActivityRow[]).map((evt) => (
              <tr key={evt.id} className="border-b border-white/5">
                <td className="px-4 py-3 text-white/70">{evt.units?.navo_number ?? '—'}</td>
                <td className="px-4 py-3 text-white/70">{evt.event_type}</td>
                <td className="px-4 py-3 text-white/70">
                  {evt.from_status ?? '—'} → {evt.to_status ?? '—'}
                </td>
                <td className="px-4 py-3 text-white/70">{evt.actor_type}</td>
                <td className="px-4 py-3 text-white/40">
                  {new Date(evt.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin): add KPI dashboard with unit counts and activity feed"
```

---

## Task 1: Admin Events CRUD API

**Files:**
- Create: `app/api/admin/events/route.ts`
- Create: `app/api/admin/events/[id]/route.ts`
- Create: `__tests__/api/admin/events.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/admin/events.test.ts
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

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
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

const adminSession = { user: { id: 'admin-1', email: 'admin@navomarine.com' } }

beforeEach(() => jest.clearAllMocks())

describe('GET /api/admin/events', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns events list', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({
        data: [{ id: 'evt-1', name: 'Race Week' }],
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(1)
  })
})

describe('POST /api/admin/events', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Event',
        start_date: '2026-05-01',
        end_date: '2026-05-05',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates event and returns 201', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'evt-new', name: 'New Event' },
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Event',
        location: 'Miami',
        start_date: '2026-05-01',
        end_date: '2026-05-05',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/admin/events/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { PATCH } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/evt-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'evt-1' }) })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/admin/events/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { DELETE } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/evt-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'evt-1' }) })
    expect(res.status).toBe(401)
  })
})
```

```bash
npx jest --testPathPattern=admin/events --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// app/api/admin/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .select(`
      *,
      rental_event_products (
        product_id, rental_price_cents, late_fee_cents,
        reserve_cutoff_days, capacity, inventory_status,
        products ( name, slug )
      )
    `)
    .order('start_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    name: string
    location?: string
    event_url?: string
    start_date: string
    end_date: string
    active?: boolean
    products?: Array<{
      product_id: string
      rental_price_cents: number
      late_fee_cents?: number
      reserve_cutoff_days?: number
      capacity: number
    }>
  }

  if (!body.name || !body.start_date || !body.end_date) {
    return NextResponse.json(
      { error: 'name, start_date, and end_date are required' },
      { status: 400 },
    )
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('rental_events')
    .insert({
      name: body.name,
      location: body.location ?? null,
      event_url: body.event_url ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
      active: body.active ?? true,
    })
    .select('*')
    .single()

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

  const eventId = (event as { id: string }).id

  // Insert product allocations if provided
  if (body.products && body.products.length > 0) {
    const productRows = body.products.map((p) => ({
      event_id: eventId,
      product_id: p.product_id,
      rental_price_cents: p.rental_price_cents,
      late_fee_cents: p.late_fee_cents ?? 3500,
      reserve_cutoff_days: p.reserve_cutoff_days ?? 14,
      capacity: p.capacity,
    }))

    const { error: productsError } = await supabaseAdmin
      .from('rental_event_products')
      .insert(productRows)

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ event }, { status: 201 })
}
```

```typescript
// app/api/admin/events/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    location?: string
    event_url?: string
    start_date?: string
    end_date?: string
    active?: boolean
  }

  const updateFields: Record<string, unknown> = {}
  if (body.name !== undefined) updateFields.name = body.name
  if (body.location !== undefined) updateFields.location = body.location
  if (body.event_url !== undefined) updateFields.event_url = body.event_url
  if (body.start_date !== undefined) updateFields.start_date = body.start_date
  if (body.end_date !== undefined) updateFields.end_date = body.end_date
  if (body.active !== undefined) updateFields.active = body.active

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .update(updateFields)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check for active reservations referencing this event
  const { count } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .in('status', ['reserved_unpaid', 'reserved_paid'])

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete event with active reservations' },
      { status: 409 },
    )
  }

  const { error } = await supabaseAdmin
    .from('rental_events')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

```bash
npx jest --testPathPattern=admin/events --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/events/ __tests__/api/admin/events.test.ts
git commit -m "feat(api): add admin events CRUD — GET/POST/PATCH/DELETE"
```

---

## Task 2: Admin Events + Orders Pages

**Files:**
- Create: `app/admin/events/page.tsx`
- Create: `app/admin/events/[id]/page.tsx`
- Create: `app/admin/events/AddEventForm.tsx`
- Create: `app/admin/orders/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Create events list page**

`app/admin/events/page.tsx` — server component that fetches all rental events via `GET /api/admin/events` (or direct DB query). Renders a table with: Event Name, Location, Dates, Active toggle, Product allocations (capacity/reserved). Link to detail. Button to add new event.

- [ ] **Step 2: Create AddEventForm**

`app/admin/events/AddEventForm.tsx` — client component with fields: name, location, event_url, start_date, end_date. Product allocation section: select product, set rental_price_cents, capacity. Submits to `POST /api/admin/events`.

- [ ] **Step 3: Create event detail page**

`app/admin/events/[id]/page.tsx` — server component showing event details with editable product capacity. Shows current reservation count vs capacity for each product.

- [ ] **Step 4: Create admin orders page**

`app/admin/orders/page.tsx` — server component that queries all orders. Table with: Order Number, Customer Email, Status badge, Total, Stripe Payment Intent (linked to Stripe dashboard), Date.

```typescript
// app/admin/orders/page.tsx
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

export default async function AdminOrdersPage() {
  const session = await auth()
  if (!session?.user?.email?.endsWith('@navomarine.com')) {
    return <p className="text-white">Unauthorized</p>
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return <p className="text-red-400">Error: {error.message}</p>
  }

  type OrderRow = {
    id: string
    order_number: string
    customer_email: string
    status: string
    total_cents: number
    currency: string
    stripe_payment_intent_id: string | null
    created_at: string
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold text-white mb-8">Orders</h1>

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-white/40">
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Stripe</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {((orders ?? []) as OrderRow[]).map((order) => (
              <tr key={order.id} className="border-b border-white/5">
                <td className="px-4 py-3 font-mono text-white">{order.order_number}</td>
                <td className="px-4 py-3 text-white/70">{order.customer_email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                    order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-white/10 text-white/40'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-white">${(order.total_cents / 100).toFixed(2)}</td>
                <td className="px-4 py-3">
                  {order.stripe_payment_intent_id ? (
                    <a
                      href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-marine-500 hover:underline"
                    >
                      {order.stripe_payment_intent_id.slice(0, 20)}...
                    </a>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/40">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add Events + Orders links to admin sidebar**

In `app/admin/layout.tsx`, add after Returns:

```tsx
<Link
  href="/admin/events"
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
>
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
  Events
</Link>
<Link
  href="/admin/orders"
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
>
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </svg>
  Orders
</Link>
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/events/ app/admin/orders/ app/admin/layout.tsx
git commit -m "feat(admin): add events CRUD pages and orders financial view"
```

---

## Task 3: Purchase Checkout Flow

**Files:**
- Create: `app/checkout/page.tsx`
- Create: `app/checkout/CheckoutForm.tsx`
- Modify: `app/api/checkout/route.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Create: `__tests__/api/checkout-purchase.test.ts`

- [ ] **Step 1 (RED): Write test for purchase checkout**

```typescript
// __tests__/api/checkout-purchase.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: { sessions: { create: jest.fn() } },
  },
}))
jest.mock('@/lib/db/events', () => ({
  getEventProduct: jest.fn(),
  getDateWindowProduct: jest.fn(),
}))
jest.mock('@/lib/db/availability', () => ({
  checkEventAvailability: jest.fn(),
  checkWindowAvailability: jest.fn(),
}))
jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn(),
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { checkout: { sessions: { create: jest.Mock } } }
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

const userSession = { user: { id: 'user-1', email: 'buyer@test.com', name: 'Buyer' } }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/checkout — purchase flow', () => {
  it('creates purchase reservation without sail_number or event_id', async () => {
    auth.mockResolvedValueOnce(userSession)

    // Product lookup
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'prod-1', base_price_cents: 249900, name: 'Atlas 2' },
        error: null,
      }),
    })
    // Reservation insert
    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-1', status: 'reserved_unpaid' },
        error: null,
      }),
    })

    supabaseAdmin.from
      .mockReturnValueOnce(productChain) // product lookup
      .mockReturnValueOnce(insertChain)  // reservation insert

    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_purchase',
      url: 'https://checkout.stripe.com/session/cs_test_purchase',
    })

    const { POST } = await import('@/app/api/checkout/route')
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        reservation_type: 'purchase',
        product_id: 'prod-1',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toContain('checkout.stripe.com')
  })
})
```

```bash
npx jest --testPathPattern=checkout-purchase --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Update `POST /api/checkout`**

In `app/api/checkout/route.ts`, replace the `purchase` branch (currently returns 501) with:

```typescript
} else {
  // Purchase flow
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, base_price_cents, name')
    .eq('id', body.product_id)
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  totalCents = (product as { base_price_cents: number }).base_price_cents
}
```

Also update the Stripe session creation to handle purchases:

```typescript
const isPurchase = body.reservation_type === 'purchase'

stripeSession = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'],
  line_items: [
    {
      price_data: {
        currency: 'usd',
        unit_amount: totalCents + (lateFeeApplied ? lateFeeCents : 0),
        product_data: {
          name: isPurchase
            ? 'Vakaros Atlas 2'
            : `Atlas 2 Rental — ${body.reservation_type === 'rental_event' ? 'Event' : 'Custom Dates'}`,
          description: body.sail_number ? `Sail #${body.sail_number}` : undefined,
        },
      },
      quantity: 1,
    },
  ],
  // ... rest of session config
  shipping_address_collection: isPurchase ? { allowed_countries: ['US'] } : undefined,
  success_url: isPurchase
    ? `${process.env.NEXTAUTH_URL}/dashboard/orders?checkout=success`
    : `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
  cancel_url: isPurchase
    ? `${process.env.NEXTAUTH_URL}/products?checkout=cancelled`
    : `${process.env.NEXTAUTH_URL}/reserve?checkout=cancelled`,
})
```

And the reservation insert should omit sail_number, event_id, date_window_id for purchases.

```bash
npx jest --testPathPattern=checkout-purchase --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Update webhook for purchase completion**

In `app/api/stripe/webhook/route.ts`, in the `handleCheckoutCompleted` function, the existing logic that sets `reserved_paid` already handles purchases correctly — **no special case is needed here**. Both rental and purchase reservations move to `reserved_paid` on payment. The reservation moves to `completed` only after admin assigns a unit (see Task 3a below).

> Do NOT add a separate branch that sets purchases to `completed` at webhook time. The reservation status lifecycle is: `reserved_unpaid` → `reserved_paid` (on payment) → `completed` (on unit assignment by admin).

- [ ] **Step 4: Create checkout page**

```typescript
// app/checkout/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CheckoutForm } from './CheckoutForm'

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product_id?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/checkout')

  const params = await searchParams
  const productId = params.product_id

  if (!productId) redirect('/products')

  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
        <div className="w-full max-w-2xl">
          <h1 className="font-heading text-3xl font-semibold text-white mb-8">
            Checkout
          </h1>
          <CheckoutForm productId={productId} />
        </div>
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 5: Create CheckoutForm**

```typescript
// app/checkout/CheckoutForm.tsx
'use client'

import { useState } from 'react'

type Props = {
  productId: string
}

export function CheckoutForm({ productId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePurchase() {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_type: 'purchase',
          product_id: productId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      // Redirect to Stripe Checkout (Stripe collects shipping)
      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Order Summary</h2>
        <p className="text-sm text-white/60">
          Vakaros Atlas 2 — Shipping address will be collected on the payment page.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handlePurchase}
        disabled={loading}
        className="glass-btn glass-btn-primary w-full rounded-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
      >
        {loading ? 'Processing...' : 'Proceed to Payment'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/checkout/ app/api/checkout/route.ts app/api/stripe/webhook/route.ts \
  __tests__/api/checkout-purchase.test.ts
git commit -m "feat: add purchase checkout flow — Stripe session with shipping collection"
```

---

## Task 3a: Update Assign Endpoint to Handle Purchase vs Rental Unit Status

**Files:**
- Modify: `app/api/admin/reservations/[id]/assign/route.ts`

When a unit is assigned to a reservation, the unit's resulting status depends on whether it is a rental or a purchase.

- [ ] **Step 1: Update assign endpoint**

In `app/api/admin/reservations/[id]/assign/route.ts`, after fetching the paid reservation, replace the fixed `reserved_paid` unit status with a type-aware check:

```typescript
// After verifying reservation is 'reserved_paid', determine unit status based on type
const isPurchase = reservation.reservation_type === 'purchase'
const newUnitStatus = isPurchase ? 'sold' : 'reserved_paid'
const unitUpdateFields: Record<string, unknown> = { status: newUnitStatus }
if (isPurchase) {
  unitUpdateFields.retired_at = new Date().toISOString()
}

// Update unit
const { error: unitUpdateError } = await supabaseAdmin
  .from('units')
  .update(unitUpdateFields)
  .eq('id', body.unit_id)

// Audit log
await supabaseAdmin.from('unit_events').insert({
  unit_id: body.unit_id,
  event_type: 'assigned',
  from_status: 'available',
  to_status: newUnitStatus,
  actor_type: 'admin',
  actor_id: session.user?.id ?? null,
  notes: `Assigned to reservation ${id}`,
  metadata: { reservation_id: id },
})

// Set reservation to completed after unit assignment
await updateReservationStatus(reservation.id, 'completed')
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/reservations/[id]/assign/route.ts
git commit -m "feat(api): update assign endpoint — set unit sold+retired for purchases, reserved_paid for rentals"
```

---

## Task 4: Navbar Admin Link

**Files:**
- Modify: `components/layout/Navbar.tsx`

- [ ] **Step 1: Add Admin link**

In `components/layout/Navbar.tsx`, add an Admin link in the session user block, visible only when the user's email ends in `@navomarine.com`:

```tsx
{session?.user ? (
  <div className="flex items-center gap-3">
    <NotificationBell />
    {session.user.email?.endsWith('@navomarine.com') && (
      <Link
        href="/admin"
        className="text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Admin
      </Link>
    )}
    {session.user.image && ( ... )}
    ...
  </div>
) : ( ... )}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Navbar.tsx
git commit -m "feat(nav): show Admin link for @navomarine.com users"
```

---

## Task 5: Full E2E QA Walkthrough

This is the final gate — a comprehensive E2E test that exercises the complete system.

- [ ] **Step 1: Create comprehensive E2E test**

```typescript
// e2e/full-walkthrough.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Full System Walkthrough', () => {
  // Preconditions:
  // 1. Stripe test mode + webhook forwarding active
  // 2. At least one active rental event seeded
  // 3. At least one available unit seeded
  // 4. Admin + customer auth sessions configured

  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/NAVO Marine/)
  })

  test('products page loads with Atlas 2', async ({ page }) => {
    await page.goto('/products')
    await expect(page.getByText('Atlas')).toBeVisible()
  })

  test('reserve page requires auth', async ({ page }) => {
    await page.goto('/reserve')
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin dashboard shows KPIs', async ({ page }) => {
    // Requires admin auth session
    await page.goto('/admin')
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('Available Units')).toBeVisible()
  })

  test('admin can navigate to all sections', async ({ page }) => {
    await page.goto('/admin')

    // Products
    await page.click('a[href="/admin/products"]')
    await expect(page.locator('h1')).toContainText('Products')

    // Fleet
    await page.click('a[href="/admin/fleet"]')
    await expect(page.locator('h1')).toContainText('Fleet')

    // Reservations
    await page.click('a[href="/admin/reservations"]')
    await expect(page.locator('h1')).toContainText('Reservations')

    // Returns
    await page.click('a[href="/admin/returns"]')
    await expect(page.locator('h1')).toContainText('Returns')

    // Events
    await page.click('a[href="/admin/events"]')
    await expect(page.locator('h1')).toContainText('Events')

    // Orders
    await page.click('a[href="/admin/orders"]')
    await expect(page.locator('h1')).toContainText('Orders')
  })

  test('customer dashboard has sidebar navigation', async ({ page }) => {
    // Requires customer auth session
    await page.goto('/dashboard')
    await expect(page.getByText('Overview')).toBeVisible()
    await expect(page.getByText('Orders')).toBeVisible()
    await expect(page.getByText('Rentals')).toBeVisible()
    await expect(page.getByText('Warranty')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run full E2E**

```bash
npm run test:e2e
```

- [ ] **Step 3: Run unit tests with coverage**

```bash
npm test
# Expected: 80%+ coverage
```

- [ ] **Step 4: Run linter**

```bash
npm run lint
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add e2e/full-walkthrough.spec.ts
git commit -m "test(e2e): add full system walkthrough QA gate"
```

---

## Summary

After completing all tasks:
- `app/admin/page.tsx` — KPI dashboard with unit counts (available, renting, damaged, expiring) + activity feed
- `app/api/admin/events/*` — full CRUD for rental events with product capacity management
- `app/admin/events/*` — event management UI pages
- `app/admin/orders/page.tsx` — financial view with Stripe payment intent links
- `app/checkout/*` — purchase flow with Stripe Checkout (shipping collected by Stripe)
- `POST /api/checkout` extended for `reservation_type: 'purchase'`
- Webhook treats purchases identically to rentals: sets `reserved_paid` on payment (NOT `completed`)
- Assign endpoint updated: purchases set unit to `sold` + `retired_at`; rentals set unit to `reserved_paid`; both set reservation to `completed` after assignment
- Navbar shows Admin link for `@navomarine.com` users
- Full E2E walkthrough verifying all major flows
- Admin sidebar: Products, Fleet, Reservations, Returns, Events, Orders

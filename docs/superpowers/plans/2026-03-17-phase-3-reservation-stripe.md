# Phase 3: Reservation Flows + Stripe Checkout

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Calendly-based reservation page with a DB-driven booking flow — users select an event or custom date window, enter their sail number, and pay via Stripe Checkout. Reservations are stored with `reserved_unpaid` status and expire after 24 hours.

**Architecture:** Two new DB repositories (`lib/db/events.ts` for event/window queries, `lib/db/availability.ts` for live capacity checks) feed a server-component reservation page that loads active events + date windows. A `POST /api/checkout` route validates input, checks availability, creates a Stripe Checkout session first (fail-fast: if Stripe errors, nothing is written to DB), then inserts the reservation with `expires_at = now() + 24h`. The client redirects to Stripe's hosted checkout. Product is implicit (Atlas 2 for now).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `lib/db/events.ts` | Repository: rental events & date windows queries |
| Create | `lib/db/availability.ts` | Repository: live availability COUNT queries |
| Create | `lib/stripe/client.ts` | Stripe SDK singleton |
| Modify | `app/reserve/page.tsx` | Server component: load events + windows, pass to client |
| Create | `app/reserve/ReserveBookingUI.tsx` | Client component: tab UI (Event / Custom Dates) |
| Modify | `app/reserve/ReserveForm.tsx` | DELETE this file (Calendly embed replaced) |
| Create | `app/api/checkout/route.ts` | POST: validate, check availability, Stripe session, insert reservation |
| Create | `__tests__/api/checkout.test.ts` | Unit tests for checkout route |
| Create | `__tests__/lib/db/events.test.ts` | Unit tests for events repository |
| Create | `__tests__/lib/db/availability.test.ts` | Unit tests for availability repository |

---

## Task 0: Install Stripe SDK

- [ ] **Step 1: Install stripe**

```bash
npm install stripe
```

- [ ] **Step 2: Add env vars to `.env.local`**

Add these keys (values from Stripe dashboard):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ATLAS2_RENTAL_PRICE_ID=price_...
STRIPE_ATLAS2_PURCHASE_PRICE_ID=price_...
```

> **Note:** Create a Stripe product "Atlas 2 Rental" with a one-time price in the Stripe dashboard. Store the price ID in `STRIPE_ATLAS2_RENTAL_PRICE_ID`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install stripe SDK"
```

---

## Task 1: Stripe Client Singleton

**Files:**
- Create: `lib/stripe/client.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/stripe/client.test.ts
/**
 * @jest-environment node
 */

describe('stripe client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv, STRIPE_SECRET_KEY: 'sk_test_fake' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('exports a Stripe instance', async () => {
    const { stripe } = await import('@/lib/stripe/client')
    expect(stripe).toBeDefined()
    expect(typeof stripe.checkout).toBe('object')
  })
})
```

```bash
npx jest --testPathPattern=stripe/client --no-coverage
# Expected: FAIL (module does not exist)
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/stripe/client.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
  typescript: true,
})
```

```bash
npx jest --testPathPattern=stripe/client --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/client.ts __tests__/lib/stripe/client.test.ts
git commit -m "feat(stripe): add Stripe client singleton"
```

---

## Task 2: Events Repository (`lib/db/events.ts`)

**Files:**
- Create: `lib/db/events.ts`
- Create: `__tests__/lib/db/events.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/db/events.test.ts
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
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  // Make each chainable
  for (const key of Object.keys(chain)) {
    if (key !== 'single' && !overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('listActiveRentalEvents', () => {
  it('returns active events with product allocations', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        name: 'Miami Race Week',
        location: 'Miami, FL',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        rental_event_products: [
          { product_id: 'prod-1', rental_price_cents: 15000, late_fee_cents: 3500, reserve_cutoff_days: 14, capacity: 10, inventory_status: 'in_stock' },
        ],
      },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockEvents, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveRentalEvents } = await import('@/lib/db/events')
    const result = await listActiveRentalEvents()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Miami Race Week')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('rental_events')
  })

  it('throws on DB error', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB fail' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveRentalEvents } = await import('@/lib/db/events')
    await expect(listActiveRentalEvents()).rejects.toThrow('DB fail')
  })
})

describe('listActiveDateWindows', () => {
  it('returns active date windows with allocations', async () => {
    const mockWindows = [
      {
        id: 'win-1',
        label: 'Spring 2026',
        start_date: '2026-03-15',
        end_date: '2026-04-15',
        date_window_allocations: [
          { product_id: 'prod-1', capacity: 5, inventory_status: 'in_stock' },
        ],
      },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockWindows, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveDateWindows } = await import('@/lib/db/events')
    const result = await listActiveDateWindows()

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Spring 2026')
  })
})

describe('getEventProduct', () => {
  it('returns the event-product allocation', async () => {
    const mockRow = {
      event_id: 'evt-1',
      product_id: 'prod-1',
      rental_price_cents: 15000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
      inventory_status: 'in_stock',
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockRow, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getEventProduct } = await import('@/lib/db/events')
    const result = await getEventProduct('evt-1', 'prod-1')

    expect(result).not.toBeNull()
    expect(result!.rental_price_cents).toBe(15000)
  })

  it('returns null when not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getEventProduct } = await import('@/lib/db/events')
    const result = await getEventProduct('evt-1', 'prod-1')
    expect(result).toBeNull()
  })
})

describe('getDateWindowProduct', () => {
  it('returns the window-product allocation', async () => {
    const mockRow = {
      date_window_id: 'win-1',
      product_id: 'prod-1',
      capacity: 5,
      inventory_status: 'in_stock',
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockRow, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getDateWindowProduct } = await import('@/lib/db/events')
    const result = await getDateWindowProduct('win-1', 'prod-1')
    expect(result).not.toBeNull()
    expect(result!.capacity).toBe(5)
  })
})
```

```bash
npx jest --testPathPattern=db/events --no-coverage
# Expected: FAIL (module does not exist)
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/db/events.ts
import { supabaseAdmin } from '@/lib/db/client'

// ── Types ──────────────────────────────────────────────────────────────────

export type RentalEventProduct = {
  product_id: string
  rental_price_cents: number
  late_fee_cents: number
  reserve_cutoff_days: number
  capacity: number
  inventory_status: string
}

export type RentalEvent = {
  id: string
  name: string
  location: string | null
  event_url: string | null
  start_date: string
  end_date: string
  rental_event_products: RentalEventProduct[]
}

export type DateWindowAllocation = {
  product_id: string
  capacity: number
  inventory_status: string
}

export type DateWindow = {
  id: string
  label: string | null
  start_date: string
  end_date: string
  date_window_allocations: DateWindowAllocation[]
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function listActiveRentalEvents(): Promise<RentalEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .select(`
      id, name, location, event_url, start_date, end_date,
      rental_event_products (
        product_id, rental_price_cents, late_fee_cents,
        reserve_cutoff_days, capacity, inventory_status
      )
    `)
    .eq('active', true)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date')

  if (error) throw new Error(`listActiveRentalEvents: ${error.message}`)
  return data as unknown as RentalEvent[]
}

export async function listActiveDateWindows(): Promise<DateWindow[]> {
  const { data, error } = await supabaseAdmin
    .from('date_windows')
    .select(`
      id, label, start_date, end_date,
      date_window_allocations (
        product_id, capacity, inventory_status
      )
    `)
    .eq('active', true)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date')

  if (error) throw new Error(`listActiveDateWindows: ${error.message}`)
  return data as unknown as DateWindow[]
}

export async function getEventProduct(
  eventId: string,
  productId: string,
): Promise<RentalEventProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('rental_event_products')
    .select('*')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getEventProduct: ${error.message}`)
  }
  return data as unknown as RentalEventProduct
}

export async function getDateWindowProduct(
  windowId: string,
  productId: string,
): Promise<DateWindowAllocation | null> {
  const { data, error } = await supabaseAdmin
    .from('date_window_allocations')
    .select('*')
    .eq('date_window_id', windowId)
    .eq('product_id', productId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getDateWindowProduct: ${error.message}`)
  }
  return data as unknown as DateWindowAllocation
}
```

```bash
npx jest --testPathPattern=db/events --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/events.ts __tests__/lib/db/events.test.ts
git commit -m "feat(db): add events repository — rental events & date windows"
```

---

## Task 3: Availability Repository (`lib/db/availability.ts`)

**Files:**
- Create: `lib/db/availability.ts`
- Create: `__tests__/lib/db/availability.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/db/availability.test.ts
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

describe('checkEventAvailability', () => {
  it('returns available when count < capacity', async () => {
    const countChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { count: 3 }, error: null, count: 3 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkEventAvailability } = await import('@/lib/db/availability')
    const result = await checkEventAvailability('evt-1', 'prod-1', 10)

    expect(result).toEqual({ available: true, reserved: 3, capacity: 10, remaining: 7 })
  })

  it('returns unavailable when count >= capacity', async () => {
    const countChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { count: 10 }, error: null, count: 10 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkEventAvailability } = await import('@/lib/db/availability')
    const result = await checkEventAvailability('evt-1', 'prod-1', 10)

    expect(result).toEqual({ available: false, reserved: 10, capacity: 10, remaining: 0 })
  })
})

describe('checkWindowAvailability', () => {
  it('returns available when count < capacity', async () => {
    const countChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { count: 1 }, error: null, count: 1 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkWindowAvailability } = await import('@/lib/db/availability')
    const result = await checkWindowAvailability('win-1', 'prod-1', 5)

    expect(result).toEqual({ available: true, reserved: 1, capacity: 5, remaining: 4 })
  })
})
```

```bash
npx jest --testPathPattern=db/availability --no-coverage
# Expected: FAIL (module does not exist)
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/db/availability.ts
import { supabaseAdmin } from '@/lib/db/client'

export type AvailabilityResult = {
  available: boolean
  reserved: number
  capacity: number
  remaining: number
}

/**
 * Count reservations for a given event + product where status is
 * 'reserved_unpaid' or 'reserved_paid', then compare against capacity.
 */
export async function checkEventAvailability(
  eventId: string,
  productId: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_paid'])

  if (error) throw new Error(`checkEventAvailability: ${error.message}`)

  const reserved = count ?? 0
  const remaining = Math.max(0, capacity - reserved)
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining,
  }
}

/**
 * Count reservations for a given date window + product where status is
 * 'reserved_unpaid' or 'reserved_paid', then compare against capacity.
 */
export async function checkWindowAvailability(
  windowId: string,
  productId: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('date_window_id', windowId)
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_paid'])

  if (error) throw new Error(`checkWindowAvailability: ${error.message}`)

  const reserved = count ?? 0
  const remaining = Math.max(0, capacity - reserved)
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining,
  }
}
```

```bash
npx jest --testPathPattern=db/availability --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/availability.ts __tests__/lib/db/availability.test.ts
git commit -m "feat(db): add availability repository — live capacity checks"
```

---

## Task 4: POST /api/checkout Route

This is the most critical route in Phase 3. It:
1. Requires auth (any logged-in user)
2. Validates input (sail_number for rentals, event_id or date_window_id)
3. Looks up product pricing from event/window allocation
4. Checks live availability
5. Creates Stripe Checkout session FIRST (if Stripe fails → 503, nothing written to DB)
6. Inserts reservation row with `stripe_checkout_session_id` and `expires_at = now() + 24h`
7. Returns `{ url: stripeSessionUrl }`

**Files:**
- Create: `app/api/checkout/route.ts`
- Create: `__tests__/api/checkout.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/checkout.test.ts
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
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
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

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { checkout: { sessions: { create: jest.Mock } } }
}
const { getEventProduct, getDateWindowProduct } = require('@/lib/db/events') as {
  getEventProduct: jest.Mock
  getDateWindowProduct: jest.Mock
}
const { checkEventAvailability, checkWindowAvailability } = require('@/lib/db/availability') as {
  checkEventAvailability: jest.Mock
  checkWindowAvailability: jest.Mock
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

const userSession = { user: { id: 'user-1', email: 'sailor@test.com' } }

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/checkout', () => {
  it('returns 401 when not authenticated', async () => {
    auth.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ reservation_type: 'rental_event' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when reservation_type is missing', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rental_event has no event_id', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      sail_number: 'USA-123',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rental_event has no sail_number', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      event_id: 'evt-1',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when event product not found', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      event_id: 'evt-1',
      sail_number: 'USA-123',
    }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when event is sold out', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({
      rental_price_cents: 15000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
    })
    checkEventAvailability.mockResolvedValueOnce({
      available: false,
      reserved: 10,
      capacity: 10,
      remaining: 0,
    })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      event_id: 'evt-1',
      sail_number: 'USA-123',
    }))
    expect(res.status).toBe(409)
  })

  it('returns 503 when Stripe fails', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({
      rental_price_cents: 15000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
    })
    checkEventAvailability.mockResolvedValueOnce({
      available: true,
      reserved: 3,
      capacity: 10,
      remaining: 7,
    })
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe down'))

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      event_id: 'evt-1',
      sail_number: 'USA-123',
    }))
    expect(res.status).toBe(503)
    // Verify NO DB write happened
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })

  it('creates reservation and returns Stripe URL on success', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({
      rental_price_cents: 15000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
    })
    checkEventAvailability.mockResolvedValueOnce({
      available: true,
      reserved: 3,
      capacity: 10,
      remaining: 7,
    })
    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/session/cs_test_123',
    })

    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-1', status: 'reserved_unpaid' },
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(insertChain)

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      product_id: 'prod-1',
      event_id: 'evt-1',
      sail_number: 'USA-123',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe('https://checkout.stripe.com/session/cs_test_123')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('reservations')
  })

  it('handles rental_custom with date_window_id', async () => {
    auth.mockResolvedValueOnce(userSession)
    getDateWindowProduct.mockResolvedValueOnce({
      capacity: 5,
      inventory_status: 'in_stock',
    })
    checkWindowAvailability.mockResolvedValueOnce({
      available: true,
      reserved: 1,
      capacity: 5,
      remaining: 4,
    })
    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/session/cs_test_456',
    })

    // Product lookup for base_price_cents
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'prod-1', base_price_cents: 249900 },
        error: null,
      }),
    })
    // Reservation insert
    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-2', status: 'reserved_unpaid' },
        error: null,
      }),
    })
    supabaseAdmin.from
      .mockReturnValueOnce(productChain) // product lookup
      .mockReturnValueOnce(insertChain)  // reservation insert

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_custom',
      product_id: 'prod-1',
      date_window_id: 'win-1',
      sail_number: 'USA-456',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toContain('checkout.stripe.com')
  })
})
```

```bash
npx jest --testPathPattern=api/checkout --no-coverage
# Expected: FAIL (module does not exist)
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getEventProduct, getDateWindowProduct } from '@/lib/db/events'
import { checkEventAvailability, checkWindowAvailability } from '@/lib/db/availability'

type CheckoutBody = {
  reservation_type: 'rental_event' | 'rental_custom' | 'purchase'
  product_id: string
  event_id?: string
  date_window_id?: string
  sail_number?: string
  addons?: string[]
}

const VALID_TYPES = ['rental_event', 'rental_custom', 'purchase'] as const

export async function POST(req: NextRequest) {
  // 1. Auth check — any logged-in user
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Partial<CheckoutBody>

  // 2. Input validation
  if (!body.reservation_type || !VALID_TYPES.includes(body.reservation_type as typeof VALID_TYPES[number])) {
    return NextResponse.json(
      { error: 'reservation_type must be one of: rental_event, rental_custom, purchase' },
      { status: 400 },
    )
  }

  if (!body.product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  // Rental-specific validation
  if (body.reservation_type === 'rental_event') {
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id is required for rental_event' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
  }

  if (body.reservation_type === 'rental_custom') {
    if (!body.date_window_id) {
      return NextResponse.json({ error: 'date_window_id is required for rental_custom' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
  }

  // 3. Look up pricing + check availability
  let totalCents: number
  let lateFeeApplied = false
  let lateFeeCents = 0

  if (body.reservation_type === 'rental_event') {
    const eventProduct = await getEventProduct(body.event_id!, body.product_id)
    if (!eventProduct) {
      return NextResponse.json({ error: 'Event product not found' }, { status: 404 })
    }

    const availability = await checkEventAvailability(
      body.event_id!,
      body.product_id,
      eventProduct.capacity,
    )
    if (!availability.available) {
      return NextResponse.json(
        { error: 'Sold out — no capacity remaining', availability },
        { status: 409 },
      )
    }

    totalCents = eventProduct.rental_price_cents

    // Check if within late fee window
    const cutoffDays = eventProduct.reserve_cutoff_days
    if (cutoffDays > 0) {
      // We'd need the event start_date to calculate late fee.
      // For now, late fee logic is deferred to event lookup.
      lateFeeCents = eventProduct.late_fee_cents
    }
  } else if (body.reservation_type === 'rental_custom') {
    const windowProduct = await getDateWindowProduct(body.date_window_id!, body.product_id)
    if (!windowProduct) {
      return NextResponse.json({ error: 'Date window product not found' }, { status: 404 })
    }

    const availability = await checkWindowAvailability(
      body.date_window_id!,
      body.product_id,
      windowProduct.capacity,
    )
    if (!availability.available) {
      return NextResponse.json(
        { error: 'Sold out — no capacity remaining', availability },
        { status: 409 },
      )
    }

    // Custom window pricing: use base_price_cents from the product
    // (date_window_allocations has no price column — purchase price serves as rental price)
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('base_price_cents')
      .eq('id', body.product_id)
      .single()

    totalCents = (product as { base_price_cents: number })?.base_price_cents ?? 0
  } else {
    // Purchase flow — handled in Phase 7
    return NextResponse.json({ error: 'Purchase flow not yet implemented' }, { status: 501 })
  }

  // 4. Create Stripe Checkout session FIRST — if this fails, no DB write
  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents + (lateFeeApplied ? lateFeeCents : 0),
            product_data: {
              name: `Atlas 2 Rental — ${body.reservation_type === 'rental_event' ? 'Event' : 'Custom Dates'}`,
              description: body.sail_number ? `Sail #${body.sail_number}` : undefined,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: body.reservation_type,
        product_id: body.product_id,
        event_id: body.event_id ?? '',
        date_window_id: body.date_window_id ?? '',
        sail_number: body.sail_number ?? '',
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed:', err)
    return NextResponse.json(
      { error: 'Payment service unavailable. Please try again.' },
      { status: 503 },
    )
  }

  // 5. Insert reservation row — Stripe session succeeded, safe to write
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: body.reservation_type,
      product_id: body.product_id,
      event_id: body.event_id ?? null,
      date_window_id: body.date_window_id ?? null,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      sail_number: body.sail_number?.trim() ?? null,
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      late_fee_applied: lateFeeApplied,
      late_fee_cents: lateFeeApplied ? lateFeeCents : 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('Reservation insert failed:', insertError)
    return NextResponse.json(
      { error: 'Failed to create reservation' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    url: stripeSession.url,
    reservation_id: (reservation as { id: string }).id,
  })
}
```

```bash
npx jest --testPathPattern=api/checkout --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/route.ts __tests__/api/checkout.test.ts
git commit -m "feat(api): add POST /api/checkout — Stripe session + reservation creation"
```

---

## Task 5: Replace `/reserve` Page with Booking UI

**Files:**
- Modify: `app/reserve/page.tsx` — server component loading events + windows
- Delete: `app/reserve/ReserveForm.tsx` — remove Calendly embed
- Create: `app/reserve/ReserveBookingUI.tsx` — client component with tabs

- [ ] **Step 1: Delete Calendly-based ReserveForm**

```bash
rm app/reserve/ReserveForm.tsx
```

- [ ] **Step 2: Create `ReserveBookingUI.tsx`**

This is a client component with two tabs: "Rent for an Event" and "Custom Dates". Each tab shows a select for event/window, a sail number input, a price display, and a "Reserve & Pay" button that calls `POST /api/checkout` and redirects to Stripe.

```typescript
// app/reserve/ReserveBookingUI.tsx
'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import type { RentalEvent, DateWindow } from '@/lib/db/events'

type Tab = 'event' | 'custom'

type Props = {
  events: RentalEvent[]
  windows: DateWindow[]
  defaultProductId: string
}

export function ReserveBookingUI({ events, windows, defaultProductId }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('event')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedWindowId, setSelectedWindowId] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session?.user) {
    return (
      <div className="text-center">
        <p className="text-white/60 mb-4">You must be signed in to reserve.</p>
        <a href="/login" className="glass-btn glass-btn-primary px-6 py-3 text-sm font-medium">
          Sign In to Continue
        </a>
      </div>
    )
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const eventProduct = selectedEvent?.rental_event_products?.[0]
  const selectedWindow = windows.find((w) => w.id === selectedWindowId)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      const body =
        activeTab === 'event'
          ? {
              reservation_type: 'rental_event' as const,
              product_id: defaultProductId,
              event_id: selectedEventId,
              sail_number: sailNumber,
            }
          : {
              reservation_type: 'rental_custom' as const,
              product_id: defaultProductId,
              date_window_id: selectedWindowId,
              sail_number: sailNumber,
            }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    sailNumber.trim().length > 0 &&
    (activeTab === 'event' ? !!selectedEventId : !!selectedWindowId)

  return (
    <div className="w-full max-w-2xl">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl bg-white/5 p-1 mb-8">
        <button
          onClick={() => setActiveTab('event')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'event'
              ? 'bg-marine-500 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Rent for an Event
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'custom'
              ? 'bg-marine-500 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Custom Dates
        </button>
      </div>

      {/* Event Tab */}
      {activeTab === 'event' && (
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm text-white/60 mb-2 block">Select Event</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            >
              <option value="">Choose an event...</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} — {evt.location} ({evt.start_date} to {evt.end_date})
                </option>
              ))}
            </select>
          </label>

          {eventProduct && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-lg font-semibold text-white">
                ${(eventProduct.rental_price_cents / 100).toFixed(2)}
              </p>
              <p className="text-xs text-white/40 mt-1">
                Late fee: ${(eventProduct.late_fee_cents / 100).toFixed(2)} if reserved within {eventProduct.reserve_cutoff_days} days of event
              </p>
            </div>
          )}
        </div>
      )}

      {/* Custom Dates Tab */}
      {activeTab === 'custom' && (
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm text-white/60 mb-2 block">Select Date Window</span>
            <select
              value={selectedWindowId}
              onChange={(e) => setSelectedWindowId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            >
              <option value="">Choose a date window...</option>
              {windows.map((win) => (
                <option key={win.id} value={win.id}>
                  {win.label ?? 'Custom'} ({win.start_date} to {win.end_date})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Sail Number — shared between both tabs */}
      <label className="block mt-6">
        <span className="text-sm text-white/60 mb-2 block">Sail Number</span>
        <input
          type="text"
          value={sailNumber}
          onChange={(e) => setSailNumber(e.target.value)}
          placeholder="e.g., USA-12345"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className="glass-btn glass-btn-primary mt-8 w-full rounded-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
      >
        {loading ? 'Processing...' : 'Reserve & Pay'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Update `app/reserve/page.tsx`**

```typescript
// app/reserve/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listActiveRentalEvents, listActiveDateWindows } from '@/lib/db/events'
import { ReserveBookingUI } from './ReserveBookingUI'

export const metadata: Metadata = {
  title: 'Reserve Vakaros Atlas II | NAVO Marine Technologies',
  description: 'Book your Vakaros Atlas II rental for an upcoming event or custom dates.',
}

// The default product ID for Atlas 2 — will be fetched from DB in future
const ATLAS2_PRODUCT_ID = process.env.ATLAS2_PRODUCT_ID ?? '6f303d86-5763-4ece-aaad-b78d17852f8a'

export default async function ReservePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login?callbackUrl=/reserve')
  }

  const [events, windows] = await Promise.all([
    listActiveRentalEvents(),
    listActiveDateWindows(),
  ])

  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
        <div className="w-full max-w-3xl text-center mb-10">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Reserve Vakaros Atlas II
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Choose an upcoming event or select custom dates. Secure your unit with a one-time rental fee.
          </p>
        </div>

        <ReserveBookingUI
          events={events}
          windows={windows}
          defaultProductId={ATLAS2_PRODUCT_ID}
        />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 4: Delete old Calendly tests that reference ReserveForm**

Any tests in `__tests__/components/` that test the old Calendly embed should be removed since ReserveForm.tsx is deleted.

```bash
# Check if there are any tests referencing ReserveForm
grep -rl "ReserveForm" __tests__/ 2>/dev/null || echo "No matching tests"
# Delete if found
```

- [ ] **Step 5: Commit**

```bash
git add app/reserve/page.tsx app/reserve/ReserveBookingUI.tsx
git rm app/reserve/ReserveForm.tsx
git commit -m "feat(reserve): replace Calendly with DB-driven booking UI + Stripe checkout"
```

---

## Task 6: Update Navbar Reserve Link

The Navbar currently uses `ReserveCalendlyTrigger` for the reserve link. Replace it with a standard Next.js Link to `/reserve`.

**Files:**
- Modify: `components/layout/Navbar.tsx`

- [ ] **Step 1: Update Navbar**

In `components/layout/Navbar.tsx`, replace the `ReserveCalendlyTrigger` import and usage with a standard Link:

Replace:
```tsx
import { ReserveCalendlyTrigger } from '@/components/ui/ReserveCalendlyTrigger'
```

With nothing (remove the import).

Replace the `<li>` containing `ReserveCalendlyTrigger` with:
```tsx
<li>
  <Link
    href="/reserve"
    className="inline-flex items-center py-3 px-1 text-sm text-white/70 transition-colors hover:text-white"
    aria-current={pathname === '/reserve' ? 'page' : undefined}
  >
    Reserve
  </Link>
</li>
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Navbar.tsx
git commit -m "refactor(nav): replace Calendly trigger with direct /reserve link"
```

---

## Task 7: E2E Gate — Book a Rental

- [ ] **Step 1: Create E2E test**

```typescript
// e2e/reserve-booking.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Reserve Booking Flow', () => {
  // This test requires:
  // 1. A logged-in user session (use storageState or auth setup)
  // 2. At least one active rental_event with product allocation seeded in DB
  // 3. Stripe test mode configured

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/reserve')
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated user sees booking tabs', async ({ page }) => {
    // Assumes auth storageState is set up
    await page.goto('/reserve')
    await expect(page.getByText('Rent for an Event')).toBeVisible()
    await expect(page.getByText('Custom Dates')).toBeVisible()
  })

  test('reserve button is disabled without sail number', async ({ page }) => {
    await page.goto('/reserve')
    const reserveBtn = page.getByRole('button', { name: /Reserve & Pay/i })
    await expect(reserveBtn).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- --grep "Reserve Booking"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/reserve-booking.spec.ts
git commit -m "test(e2e): add reservation booking flow tests"
```

---

## Summary

After completing all tasks:
- `lib/db/events.ts` — queries rental_events and date_windows with product allocations
- `lib/db/availability.ts` — COUNT-based capacity checks against reservations
- `lib/stripe/client.ts` — Stripe SDK singleton
- `app/api/checkout/route.ts` — auth-gated, validates input, creates Stripe session FIRST, then inserts reservation
- `app/reserve/` — server-loaded booking page with tab UI, replacing Calendly
- All routes require auth. Stripe session is created before any DB write.
- Reservation rows have `expires_at = now() + 24h` and `status = 'reserved_unpaid'`

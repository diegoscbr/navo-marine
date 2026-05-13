/**
 * @jest-environment node
 *
 * NOTE on date math: lib/utils/dates.ts daysBetween() is INCLUSIVE.
 * daysBetween('2026-04-10','2026-04-12') === 3.
 * daysBetween('2026-05-01','2026-05-03') === 3.
 * Tests below use these real values, not the off-by-one number you'd get
 * from a casual reading.
 */
jest.mock('@/lib/db/packages', () => ({
  getPackageProductById: jest.fn(),
}))
jest.mock('@/lib/commerce/products', () => ({
  storefrontProducts: [],
}))
// Bypass the Next.js Runtime Cache wrapper so each test exercises the loader directly.
jest.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
// Mock the supabaseAdmin client used for rental_event / rental_custom inline queries.
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

import { getPackageProductById } from '@/lib/db/packages'
import * as commerce from '@/lib/commerce/products'
import { supabaseAdmin as supabaseAdminImpl } from '@/lib/db/client'

const getPackageProductByIdMock = getPackageProductById as unknown as jest.Mock
const supabaseAdmin = supabaseAdminImpl as unknown as { from: jest.Mock }

type Result = { data: unknown; error: unknown }

type MockBuilder = {
  select: jest.Mock
  eq: jest.Mock
  single: jest.Mock
  maybeSingle: jest.Mock
}

function mockSingleQuery(table: string, result: Result): () => MockBuilder {
  const builders: Record<string, MockBuilder> = {}
  supabaseAdmin.from.mockImplementation((t: string) => {
    if (t !== table) return mockBuilder({ data: null, error: null })
    if (!builders[t]) builders[t] = mockBuilder(result)
    return builders[t]
  })
  return () => builders[table]
}

function mockBuilder(result: Result): MockBuilder {
  const builder: MockBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
  }
  return builder
}

// Helper: replace mock storefront contents via in-place mutation so the
// shared array reference held by the impl's destructured `import { storefrontProducts }`
// stays observable. (SWC creates per-file namespace wrappers, so pure
// reassignment to `commerce.storefrontProducts` would not cross the module
// boundary.)
function setStorefront(items: unknown[]): void {
  const arr = commerce.storefrontProducts as unknown as unknown[]
  arr.length = 0
  for (const item of items) arr.push(item)
}

beforeEach(() => {
  jest.clearAllMocks()
  setStorefront([])
})

describe('loadOrderSummary — rental_event', () => {
  it('flat-rate uses rental_price_cents when no per-day rate', async () => {
    mockSingleQuery('rental_event_products', {
      data: {
        rental_price_cents: 12500,
        rental_price_per_day_cents: null,
        products: { name: 'Atlas 2 Rental' },
        rental_events: { name: 'Spring Regatta', start_date: '2026-04-10', end_date: '2026-04-12' },
      },
      error: null,
    })

    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'rental_event',
      product_id: 'p1',
      event_id: 'e1',
      sail_number: 'US-1',
    })

    expect(summary).not.toBeNull()
    expect(summary!.contextLabel).toBe('Reservation')
    expect(summary!.callbackUrlPathLabel).toBe('reservation form')
    expect(summary!.totalCents).toBe(12500)
    expect(summary!.lineItems.some((li) => li.label.includes('Atlas 2 Rental'))).toBe(true)
    expect(summary!.lineItems.some((li) => li.label.includes('Spring Regatta'))).toBe(true)
    expect(summary!.lineItems.some((li) => li.label.includes('US-1'))).toBe(true)
  })

  it('per-day rate × (inclusive eventDays + extra_days)', async () => {
    // daysBetween('2026-04-10','2026-04-12') === 3 (inclusive).
    // per-day = 5000, extra_days = 1 → total = 5000 × (3 + 1) = 20000.
    const getBuilder = mockSingleQuery('rental_event_products', {
      data: {
        rental_price_cents: 99999,
        rental_price_per_day_cents: 5000,
        products: { name: 'Atlas 2 Rental' },
        rental_events: { name: 'Spring Regatta', start_date: '2026-04-10', end_date: '2026-04-12' },
      },
      error: null,
    })
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'rental_event',
      product_id: 'p1',
      event_id: 'e1',
      sail_number: 'US-1',
      extra_days: 1,
    })
    expect(summary!.totalCents).toBe(20000)
    // Guard the query against column-name regressions (rental_event_products
    // uses event_id + product_id — see supabase/migrations/001_initial_schema.sql).
    const builder = getBuilder()
    expect(builder.eq).toHaveBeenCalledWith('event_id', 'e1')
    expect(builder.eq).toHaveBeenCalledWith('product_id', 'p1')
  })

  it('returns null when the joined row is missing', async () => {
    mockSingleQuery('rental_event_products', { data: null, error: null })
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    expect(
      await loadOrderSummary({
        reservation_type: 'rental_event',
        product_id: 'p1',
        event_id: 'missing',
        sail_number: 'US-1',
      }),
    ).toBeNull()
  })
})

describe('loadOrderSummary — rental_custom', () => {
  it('per-day rate × (inclusive windowDays + extra_days)', async () => {
    // daysBetween('2026-06-01','2026-06-04') === 4 (inclusive).
    // per-day = 4000, extra_days = 0 → total = 16000.
    const getBuilder = mockSingleQuery('date_window_allocations', {
      data: {
        rental_price_cents: 12000,
        rental_price_per_day_cents: 4000,
        products: { name: 'Atlas 2 Rental' },
        date_windows: { label: 'Summer Charter', start_date: '2026-06-01', end_date: '2026-06-04' },
      },
      error: null,
    })
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'rental_custom',
      product_id: 'p1',
      date_window_id: 'w1',
      sail_number: 'US-1',
    })
    expect(summary).not.toBeNull()
    expect(summary!.contextLabel).toBe('Reservation')
    expect(summary!.totalCents).toBe(16000)
    expect(summary!.lineItems.some((li) => li.label.includes('Summer Charter'))).toBe(true)
    // Guard the query against column-name regressions (date_window_allocations
    // uses date_window_id + product_id — see supabase/migrations/001_initial_schema.sql).
    const builder = getBuilder()
    expect(builder.eq).toHaveBeenCalledWith('date_window_id', 'w1')
    expect(builder.eq).toHaveBeenCalledWith('product_id', 'p1')
  })
})

describe('loadOrderSummary — regatta_package', () => {
  it('total = price_per_day_cents × inclusive days', async () => {
    // daysBetween('2026-05-01','2026-05-03') === 3 (inclusive); per-day = 20000 → total = 60000.
    getPackageProductByIdMock.mockResolvedValue({
      id: 'pkg1',
      name: 'Race Committee Package',
      price_per_day_cents: 20000,
    })
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'regatta_package',
      product_id: 'pkg1',
      start_date: '2026-05-01',
      end_date: '2026-05-03',
    })
    expect(summary).not.toBeNull()
    expect(summary!.contextLabel).toBe('Package booking')
    expect(summary!.totalCents).toBe(60000)
    expect(summary!.lineItems.some((li) => li.label.includes('Race Committee Package'))).toBe(true)
  })

  it('returns null when product is missing', async () => {
    getPackageProductByIdMock.mockResolvedValue(null)
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    expect(
      await loadOrderSummary({
        reservation_type: 'regatta_package',
        product_id: 'ghost',
        start_date: '2026-05-01',
        end_date: '2026-05-03',
      }),
    ).toBeNull()
  })
})

describe('loadOrderSummary — purchase', () => {
  it('uses storefrontProducts (not Supabase) and respects qty + warranty', async () => {
    setStorefront([
      {
        slug: 'atlas-2',
        name: 'Vakaros Atlas 2',
        pricing: { amountCents: 99500 },
        addOns: [{ slug: 'vakaros-care-warranty', name: 'Vakaros Care', priceCents: 9900 }],
      },
    ])
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'purchase',
      product_id: 'atlas-2',
      quantity: 2,
      warranty_selected: true,
    })
    expect(summary!.contextLabel).toBe('Purchase')
    expect(summary!.totalCents).toBe((99500 + 9900) * 2)
    expect(summary!.lineItems.some((li) => li.label.includes('Qty 2'))).toBe(true)
    expect(summary!.lineItems.some((li) => li.label.includes('Vakaros Care'))).toBe(true)
  })

  it('omits warranty line when not selected', async () => {
    setStorefront([
      {
        slug: 'atlas-2',
        name: 'Vakaros Atlas 2',
        pricing: { amountCents: 99500 },
        addOns: [{ slug: 'vakaros-care-warranty', name: 'Vakaros Care', priceCents: 9900 }],
      },
    ])
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    const summary = await loadOrderSummary({
      reservation_type: 'purchase',
      product_id: 'atlas-2',
      quantity: 1,
      warranty_selected: false,
    })
    expect(summary!.totalCents).toBe(99500)
    expect(summary!.lineItems.every((li) => !li.label.includes('Vakaros Care'))).toBe(true)
  })

  it('returns null when slug is not in storefrontProducts', async () => {
    setStorefront([])
    const { loadOrderSummary } = await import('@/lib/checkout/summary')
    expect(
      await loadOrderSummary({
        reservation_type: 'purchase',
        product_id: 'ghost',
        quantity: 1,
        warranty_selected: false,
      }),
    ).toBeNull()
  })
})

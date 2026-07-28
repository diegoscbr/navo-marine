/**
 * @jest-environment node
 *
 * Capacity must come from the physical fleet, never from the hand-typed
 * `rental_event_products.capacity` / `date_window_allocations.capacity` column.
 * These tests deliberately set that column absurdly high so a regression that
 * reads it again shows up as a passing checkout that should have been blocked.
 *
 * Note the gate is `assigned` units, not hold count — an unassigned hold blocks
 * nobody. See __tests__/lib/fleet.test.ts for that rule directly.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn(), rpc: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/db/events', () => ({
  getEventProduct: jest.fn(),
  getDateWindowProduct: jest.fn(),
  getEventPricing: jest.fn(),
}))
jest.mock('@/lib/db/fleet', () => ({
  getFleetAvailability: jest.fn(),
  getFleetSize: jest.fn(),
}))
jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock; rpc: jest.Mock }
}
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { checkout: { sessions: { create: jest.Mock } } }
}
const { getEventProduct, getDateWindowProduct, getEventPricing } = require('@/lib/db/events') as {
  getEventProduct: jest.Mock
  getDateWindowProduct: jest.Mock
  getEventPricing: jest.Mock
}
const { getFleetAvailability } = require('@/lib/db/fleet') as {
  getFleetAvailability: jest.Mock
}

const EVENT = 'f3dd44af-431e-4903-828e-eda1ccd7ed8c'
const PRODUCT = '6f303d86-5763-4ece-aaad-b78d17852f8a'
const WINDOW = 'a1111111-1111-1111-1111-111111111111'

const userSession = { user: { id: 'user-1', email: 'sailor@test.com' } }

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Chain stub covering the product/window lookups and the reservation insert. */
function stubDb() {
  supabaseAdmin.from.mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    const ret = () => chain
    for (const m of ['select', 'insert', 'eq', 'update']) {
      chain[m] = jest.fn(ret)
    }
    chain.single = jest.fn().mockResolvedValue(
      table === 'products'
        ? { data: { base_price_cents: 124900, price_per_day_cents: 2500 }, error: null }
        : table === 'date_windows'
          ? { data: { start_date: '2026-09-19', end_date: '2026-09-26' }, error: null }
          : { data: { id: 'res-1', status: 'reserved_unpaid' }, error: null },
    )
    return chain
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  stubDb()
  stripe.checkout.sessions.create.mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.test/cs_test_1',
  })
})

describe('rental_event capacity is fleet-derived', () => {
  beforeEach(() => {
    getEventPricing.mockResolvedValue({ start_date: '2026-09-19', end_date: '2026-09-26' })
  })

  it('blocks checkout when the fleet is exhausted, even though capacity says 100', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({
      product_id: PRODUCT,
      capacity: 100, // stale column — must be ignored
      rental_price_per_day_cents: 2500,
    })
    getFleetAvailability.mockResolvedValueOnce({
      available: false,
      capacity: 62,
      assigned: 62,
      booked: 62,
      remaining: 0,
      subscriptionPct: 100,
      nearCapacity: true,
      oversubscribed: false,
    })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      event_id: EVENT,
      product_id: PRODUCT,
      sail_number: 'USA-123',
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.availability.capacity).toBe(62)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('scopes the fleet check to the event date range', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({
      product_id: PRODUCT,
      capacity: 0, // stale column — must be ignored in the permissive direction too
      rental_price_per_day_cents: 2500,
    })
    getFleetAvailability.mockResolvedValueOnce({
      available: true,
      capacity: 62,
      assigned: 30,
      booked: 31,
      remaining: 32,
      subscriptionPct: 50,
      nearCapacity: false,
      oversubscribed: false,
    })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      event_id: EVENT,
      product_id: PRODUCT,
      sail_number: 'USA-123',
    }))

    expect(getFleetAvailability).toHaveBeenCalledWith(PRODUCT, '2026-09-19', '2026-09-26')
    expect(res.status).toBe(200)
  })

  it('404s when the event has no date range to scope the fleet check to', async () => {
    auth.mockResolvedValueOnce(userSession)
    getEventProduct.mockResolvedValueOnce({ product_id: PRODUCT, capacity: 40 })
    getEventPricing.mockResolvedValue(null)

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_event',
      event_id: EVENT,
      product_id: PRODUCT,
      sail_number: 'USA-123',
    }))

    expect(res.status).toBe(404)
    expect(getFleetAvailability).not.toHaveBeenCalled()
  })
})

describe('rental_custom capacity is fleet-derived', () => {
  it('blocks checkout when the fleet is exhausted for the window', async () => {
    auth.mockResolvedValueOnce(userSession)
    getDateWindowProduct.mockResolvedValueOnce({ product_id: PRODUCT, capacity: 100 })
    getFleetAvailability.mockResolvedValueOnce({
      available: false,
      capacity: 62,
      assigned: 62,
      booked: 62,
      remaining: 0,
      subscriptionPct: 100,
      nearCapacity: true,
      oversubscribed: false,
    })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'rental_custom',
      date_window_id: WINDOW,
      product_id: PRODUCT,
      sail_number: 'USA-123',
    }))

    expect(res.status).toBe(409)
    expect(getFleetAvailability).toHaveBeenCalledWith(PRODUCT, '2026-09-19', '2026-09-26')
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

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
  getEventPricing: jest.fn(),
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
const { getEventProduct, getDateWindowProduct, getEventPricing } = require('@/lib/db/events') as {
  getEventProduct: jest.Mock
  getDateWindowProduct: jest.Mock
  getEventPricing: jest.Mock
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

    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'prod-1', base_price_cents: 24500 },
        error: null,
      }),
    })
    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-2', status: 'reserved_unpaid' },
        error: null,
      }),
    })
    supabaseAdmin.from
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce(insertChain)

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

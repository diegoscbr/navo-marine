/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { checkout: { sessions: { create: jest.Mock } } }
}
const { sendEmail } = require('@/lib/email/gmail') as { sendEmail: jest.Mock }

const ADMIN_SESSION = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const NON_ADMIN = { user: { email: 'user@gmail.com', id: 'u2' } }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const k of ['select', 'update', 'eq']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/admin/reservations/[id]/send-invoice', () => {
  const makeReq = () =>
    new NextRequest('http://localhost/api/admin/reservations/r1/send-invoice', {
      method: 'POST',
    })

  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN)
    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when reservation not found', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 409 when reservation is not reserved_unpaid', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_paid',
      customer_email: 'c@test.com',
      reservation_type: 'rental_event',
      product_id: 'p1',
      user_id: 'u1',
      total_cents: 17500,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(409)
  })

  it('creates Stripe session, updates reservation, sends email, and returns 200', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)

    const reservation = {
      id: 'r1',
      status: 'reserved_unpaid',
      customer_email: 'c@test.com',
      reservation_type: 'rental_event',
      product_id: 'p1',
      user_id: 'u1',
      total_cents: 17500,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    }
    const product = { name: 'Atlas 2 Rental' }

    const fromCalls: string[] = []

    // Reservation lookup
    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    // Product lookup
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: product, error: null }),
    })
    // Reservation update
    const updateChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'reservations') {
        reservationCallCount++
        return reservationCallCount === 1 ? resChain : updateChain
      }
      if (table === 'products') return productChain
      return makeChain()
    })

    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay_test',
    })

    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.checkout_url).toBe('https://checkout.stripe.com/c/pay_test')

    // Verify Stripe session was created with shipping for rental_event
    const stripeCall = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(stripeCall.shipping_address_collection).toEqual({ allowed_countries: ['US'] })
    expect(stripeCall.customer_email).toBe('c@test.com')

    // Verify reservation was updated
    expect(fromCalls.filter((t) => t === 'reservations')).toHaveLength(2)

    // Verify email was sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does NOT include shipping for regatta_package', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)

    const reservation = {
      id: 'r1',
      status: 'reserved_unpaid',
      customer_email: 'c@test.com',
      reservation_type: 'regatta_package',
      product_id: 'p1',
      user_id: 'u1',
      total_cents: 50000,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { name: 'RaceSense Package' }, error: null }),
    })
    const updateChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'reservations') {
        reservationCallCount++
        return reservationCallCount === 1 ? resChain : updateChain
      }
      if (table === 'products') return productChain
      return makeChain()
    })

    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/c/pay_pkg',
    })

    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })

    expect(res.status).toBe(200)
    const stripeCall = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(stripeCall.shipping_address_collection).toBeUndefined()
  })

  it('returns 500 when Stripe session creation fails', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)

    const reservation = {
      id: 'r1',
      status: 'reserved_unpaid',
      customer_email: 'c@test.com',
      reservation_type: 'rental_event',
      product_id: 'p1',
      user_id: 'u1',
      total_cents: 17500,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { name: 'Atlas 2' }, error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'reservations') {
        reservationCallCount++
        return resChain
      }
      if (table === 'products') return productChain
      return makeChain()
    })

    stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe down'))

    const { POST } = await import(
      '@/app/api/admin/reservations/[id]/send-invoice/route'
    )
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Payment service')
  })
})

/**
 * @jest-environment node
 *
 * Tests for CSO Finding #2: confirmation_email override must be ignored.
 * The session email must always be used — client-provided emails are rejected.
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
const { getEventProduct } = require('@/lib/db/events') as {
  getEventProduct: jest.Mock
}
const { checkEventAvailability } = require('@/lib/db/availability') as {
  checkEventAvailability: jest.Mock
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

const SESSION_EMAIL = 'sailor@navomarine.com'
const userSession = { user: { id: 'user-1', email: SESSION_EMAIL } }

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function setupSuccessfulRentalEventMocks() {
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
    id: 'cs_test_email_override',
    url: 'https://checkout.stripe.com/session/cs_test_email_override',
  })
  const insertChain = makeChain({
    single: jest.fn().mockResolvedValue({
      data: { id: 'res-override', status: 'reserved_unpaid' },
      error: null,
    }),
  })
  supabaseAdmin.from.mockReturnValue(insertChain)
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/checkout — email override security (CSO Finding #2)', () => {
  it('uses session email, not confirmation_email, when override is provided', async () => {
    setupSuccessfulRentalEventMocks()

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        reservation_type: 'rental_event',
        product_id: 'prod-1',
        event_id: 'evt-1',
        sail_number: 'USA-123',
        confirmation_email: 'attacker@evil.com',
      }),
    )

    expect(res.status).toBe(200)

    // The Stripe session must have been created with the authenticated session
    // email, NOT the attacker-controlled override value.
    const stripeCall = stripe.checkout.sessions.create.mock.calls[0][0] as Record<string, unknown>
    const customerEmail = stripeCall.customer_email as string | undefined
    expect(customerEmail).toBe(SESSION_EMAIL)
    expect(customerEmail).not.toBe('attacker@evil.com')
  })

  it('does not return 400 when confirmation_email is an invalid address — field is silently ignored', async () => {
    setupSuccessfulRentalEventMocks()

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        reservation_type: 'rental_event',
        product_id: 'prod-1',
        event_id: 'evt-1',
        sail_number: 'USA-123',
        confirmation_email: 'not-a-valid-email',
      }),
    )

    // The field must be silently ignored — not rejected with 400.
    expect(res.status).toBe(200)
  })

  it('uses session email when no confirmation_email is provided at all', async () => {
    setupSuccessfulRentalEventMocks()

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        reservation_type: 'rental_event',
        product_id: 'prod-1',
        event_id: 'evt-1',
        sail_number: 'USA-123',
      }),
    )

    expect(res.status).toBe(200)

    const stripeCall = stripe.checkout.sessions.create.mock.calls[0][0] as Record<string, unknown>
    const customerEmail = stripeCall.customer_email as string | undefined
    expect(customerEmail).toBe(SESSION_EMAIL)
  })
})

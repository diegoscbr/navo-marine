/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/email/templates', () => ({
  bookingConfirmed: jest.fn().mockReturnValue({ to: 'sailor@test.com', subject: 'Confirmed', html: '<p/>' }),
}))

import { fulfillCheckoutSession, generateOrderNumber } from '@/lib/stripe/webhook'
import { supabaseAdmin } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/gmail'
import { bookingConfirmed } from '@/lib/email/templates'
import type Stripe from 'stripe'

const mockSupabase = supabaseAdmin as unknown as { from: jest.Mock }
const mockSendEmail = sendEmail as jest.Mock
const mockBookingConfirmed = bookingConfirmed as jest.Mock

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    ...overrides,
  }
  for (const k of ['select', 'insert', 'update', 'eq']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

const mockReservation = {
  id: 'res-001',
  user_id: 'user-001',
  unit_id: null,
  total_cents: 24500,
  customer_email: 'sailor@test.com',
  product_id: 'prod-001',
  start_date: '2026-04-10',
  end_date: '2026-04-14',
}

const mockOrder = { id: 'ord-001' }
const mockProduct = { name: 'Atlas 2 Rental' }

function makeSession(overrides = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_001',
    payment_intent: 'pi_test_001',
    customer_email: 'sailor@test.com',
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('generateOrderNumber', () => {
  it('matches NAVO-YEAR-XXXXXXXX format', () => {
    const num = generateOrderNumber()
    expect(num).toMatch(/^NAVO-\d{4}-[A-F0-9]{8}$/)
  })
})

describe('fulfillCheckoutSession', () => {
  it('returns error when reservation not found', async () => {
    const chain = makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
    mockSupabase.from.mockReturnValue(chain)
    const result = await fulfillCheckoutSession(makeSession())
    expect(result.ok).toBe(false)
  })

  it('fulfills session and sends confirmed email', async () => {
    let callIndex = 0
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'reservations' && callIndex === 0) {
        callIndex++
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockReservation, error: null }) })
      }
      if (table === 'reservations' && callIndex === 1) {
        callIndex++
        return makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: null }) })
      }
      if (table === 'orders') {
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }) })
      }
      if (table === 'products') {
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }) })
      }
      return makeChain()
    })

    const result = await fulfillCheckoutSession(makeSession())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.orderId).toBe('ord-001')

    // Email assertions
    expect(mockBookingConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'sailor@test.com',
        reservationId: 'res-001',
        orderId: 'ord-001',
        totalCents: 24500,
      }),
    )
    // Fire-and-forget is async — flush microtasks
    await Promise.resolve()
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('returns error when order insert fails', async () => {
    let callIndex = 0
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'reservations' && callIndex === 0) {
        callIndex++
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockReservation, error: null }) })
      }
      if (table === 'reservations') {
        return makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: null }) })
      }
      if (table === 'orders') {
        return makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }) })
      }
      return makeChain()
    })

    const result = await fulfillCheckoutSession(makeSession())
    expect(result.ok).toBe(false)
  })

  it('stores shipping address on the created order when Stripe provides it', async () => {
    let callIndex = 0
    const orderInsert = jest.fn().mockReturnThis()

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'reservations' && callIndex === 0) {
        callIndex++
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockReservation, error: null }) })
      }
      if (table === 'reservations' && callIndex === 1) {
        callIndex++
        return makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: null }) })
      }
      if (table === 'orders') {
        return makeChain({
          insert: orderInsert,
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        })
      }
      if (table === 'products') {
        return makeChain({ single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }) })
      }
      return makeChain()
    })

    await fulfillCheckoutSession(makeSession({
      collected_information: {
        business_name: null,
        individual_name: null,
        shipping_details: {
          name: 'Sailor Test',
          address: {
            line1: '123 Harbor St',
            line2: 'Suite 4',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60601',
            country: 'US',
          },
        },
      },
    }))

    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        shipping_address: {
          name: 'Sailor Test',
          line1: '123 Harbor St',
          line2: 'Suite 4',
          city: 'Chicago',
          state: 'IL',
          zip: '60601',
          country: 'US',
        },
      }),
    )
  })
})

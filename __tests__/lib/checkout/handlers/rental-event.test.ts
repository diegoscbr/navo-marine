// __tests__/lib/checkout/handlers/rental-event.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/email/templates', () => ({
  bookingPending: jest.fn().mockReturnValue({ to: 'test@test.com', subject: 'sub', html: '<p/>' }),
}))
jest.mock('@/lib/db/events', () => ({
  getEventProduct: jest.fn(),
  getEventPricing: jest.fn(),
}))
jest.mock('@/lib/db/availability', () => ({
  checkEventAvailability: jest.fn(),
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/utils/dates', () => ({
  daysBetween: jest.fn(),
  isValidDate: jest.fn(),
}))

import { getEventProduct, getEventPricing } from '@/lib/db/events'
import { checkEventAvailability } from '@/lib/db/availability'
import { stripe } from '@/lib/stripe/client'

const mockGetEventProduct = getEventProduct as jest.Mock
const mockGetEventPricing = getEventPricing as jest.Mock
const mockCheckAvailability = checkEventAvailability as jest.Mock
const mockStripeCreate = stripe.checkout.sessions.create as jest.Mock

const mockEventPricing = { start_date: '2026-04-01', end_date: '2026-04-03' }

describe('handleRentalEvent', () => {
  const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetEventPricing.mockResolvedValue(mockEventPricing)
  })

  it('returns 404 when event product not found', async () => {
    mockGetEventProduct.mockResolvedValue(null)
    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')

    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 0 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(404)
  })

  it('returns 409 when event is sold out', async () => {
    mockGetEventProduct.mockResolvedValue({ rental_price_cents: 24500, capacity: 5 })
    mockCheckAvailability.mockResolvedValue({ available: false, reserved: 5, capacity: 5, remaining: 0 })

    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')
    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 0 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(409)
  })

  it('creates Stripe session and returns url on success', async () => {
    mockGetEventProduct.mockResolvedValue({ rental_price_cents: 24500, rental_price_per_day_cents: 3500, capacity: 5 })
    mockCheckAvailability.mockResolvedValue({ available: true, reserved: 0, capacity: 5, remaining: 5 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid', status: 'reserved_unpaid', expires_at: '' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const { daysBetween } = require('@/lib/utils/dates')
    ;(daysBetween as jest.Mock).mockReturnValue(3)

    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')
    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 2 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ url: 'https://checkout.stripe.com/test' })
    // extra_days=2, event_days=3 → 5 days × $35 = $175
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 17500 }) })],
      }),
    )
  })
})

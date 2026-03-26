/**
 * @jest-environment node
 */

jest.mock('@/lib/email/gmail', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/email/templates', () => ({
  bookingPending: jest.fn().mockReturnValue({ to: 'test@test.com', subject: 'sub', html: '<p/>' }),
}))
jest.mock('@/lib/db/events', () => ({
  getDateWindowProduct: jest.fn(),
}))
jest.mock('@/lib/db/availability', () => ({
  checkWindowAvailability: jest.fn(),
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

import { getDateWindowProduct } from '@/lib/db/events'
import { checkWindowAvailability } from '@/lib/db/availability'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { daysBetween } from '@/lib/utils/dates'

const mockGetDateWindowProduct = getDateWindowProduct as jest.Mock
const mockCheckAvailability = checkWindowAvailability as jest.Mock
const mockStripeCreate = stripe.checkout.sessions.create as jest.Mock

describe('handleRentalCustom', () => {
  const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('includes shipping_address_collection in Stripe session', async () => {
    mockGetDateWindowProduct.mockResolvedValue({ rental_price_cents: 24500, capacity: 5 })
    mockCheckAvailability.mockResolvedValue({ available: true, reserved: 0, capacity: 5, remaining: 5 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_test_ship', url: 'https://checkout.stripe.com/test' })

    const productChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { base_price_cents: 10000, price_per_day_cents: 3500 },
        error: null,
      }),
    }
    const windowChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { start_date: '2026-07-01', end_date: '2026-07-10' },
        error: null,
      }),
    }
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'res-uuid', status: 'reserved_unpaid', expires_at: '' },
        error: null,
      }),
    }

    ;(supabaseAdmin.from as jest.Mock)
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce(windowChain)
      .mockReturnValueOnce(insertChain)

    ;(daysBetween as jest.Mock).mockReturnValue(10)

    const { handleRentalCustom } = await import('@/lib/checkout/handlers/rental-custom')
    const result = await handleRentalCustom(
      { date_window_id: 'win-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 0 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shipping_address_collection: { allowed_countries: ['US'] },
      }),
    )
  })
})

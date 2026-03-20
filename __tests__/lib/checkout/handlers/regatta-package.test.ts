// __tests__/lib/checkout/handlers/regatta-package.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/packages', () => ({
  getPackageProductById: jest.fn(),
  checkPackageAvailability: jest.fn(),
  checkMultiUnitAvailability: jest.fn(),
  insertReservationUnits: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/utils/dates', () => ({
  daysBetween: jest.fn().mockReturnValue(5),
  isValidDate: jest.fn().mockReturnValue(true),
}))

import { getPackageProductById, checkPackageAvailability, checkMultiUnitAvailability, insertReservationUnits } from '@/lib/db/packages'
import { stripe } from '@/lib/stripe/client'

const mockGetProduct = getPackageProductById as jest.Mock
const mockCheckAvail = checkPackageAvailability as jest.Mock
const mockCheckMulti = checkMultiUnitAvailability as jest.Mock
const mockInsertUnits = insertReservationUnits as jest.Mock
const mockStripeCreate = stripe.checkout.sessions.create as jest.Mock

const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }

const baseProduct = {
  id: 'prod-uuid',
  name: 'Race Committee Package',
  slug: 'race-committee-package',
  category: 'regatta_management',
  price_per_day_cents: 10500,
  payment_mode: 'capture' as const,
  min_advance_booking_days: null,
  atlas2_units_required: 0,
  tablet_required: true,
  capacity: 1,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCheckMulti.mockResolvedValue({ available: true })
})

describe('handleRegattaPackage', () => {
  it('returns 400 for invalid start_date', async () => {
    const { isValidDate } = require('@/lib/utils/dates')
    ;(isValidDate as jest.Mock).mockReturnValueOnce(false)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: 'bad-date', end_date: '2026-04-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/invalid/i)
  })

  it('returns 400 when end_date is before start_date', async () => {
    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2026-04-10', end_date: '2026-04-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/end date must be on or after/i)
  })

  it('returns 400 when Management Services < 90 days advance', async () => {
    mockGetProduct.mockResolvedValue({ ...baseProduct, min_advance_booking_days: 90 })

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: tomorrow, end_date: tomorrow },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/90 days/i)
  })

  it('returns 409 when product is unavailable', async () => {
    mockGetProduct.mockResolvedValue(baseProduct)
    mockCheckAvail.mockResolvedValue({ available: false, reserved: 1, capacity: 1, remaining: 0 })

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(409)
  })

  it('creates capture Stripe session for Race Committee Package', async () => {
    mockGetProduct.mockResolvedValue(baseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_test_rc', url: 'https://stripe.com/rc' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    // 5 days (mocked) × $105 = $525 = 52500 cents
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 52500 }) })],
      }),
    )
    // capture mode: payment_intent_data must NOT be present
    expect(mockStripeCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent_data: expect.anything() }),
    )
  })

  it('creates hold Stripe session for RaceSense Management Services', async () => {
    const raceSenseProduct = {
      ...baseProduct,
      name: 'RaceSense Management Services',
      slug: 'racesense-management-services',
      price_per_day_cents: 40000,
      payment_mode: 'hold' as const,
      min_advance_booking_days: 90,
    }
    mockGetProduct.mockResolvedValue(raceSenseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_hold_001', url: 'https://stripe.com/hold' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-hold-uuid' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const futureDate = new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0]
    const futureEndDate = new Date(Date.now() + 104 * 86400000).toISOString().split('T')[0]

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: futureDate, end_date: futureEndDate },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: { capture_method: 'manual' },
      }),
    )
  })

  it('sets expires_at = null for hold-mode bookings (prevents cron cancellation race)', async () => {
    const raceSenseProduct = {
      ...baseProduct,
      payment_mode: 'hold' as const,
      min_advance_booking_days: 90,
    }
    mockGetProduct.mockResolvedValue(raceSenseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_hold_001', url: 'https://stripe.com/hold' })

    const insertFn = jest.fn().mockReturnThis()
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      insert: insertFn,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid' }, error: null }),
    })

    const futureDate = new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0]
    const futureEndDate = new Date(Date.now() + 104 * 86400000).toISOString().split('T')[0]

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: futureDate, end_date: futureEndDate },
      mockSession,
      'http://localhost',
    )

    // expires_at must be null for hold bookings
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: null }),
    )
  })

  it('returns 404 when product_id belongs to a non-regatta_management product (category guard)', async () => {
    mockGetProduct.mockResolvedValue(null)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'atlas-2-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(404)
  })
})

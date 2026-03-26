/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

import { supabaseAdmin } from '@/lib/db/client'

const mockSupabase = supabaseAdmin as unknown as { from: jest.Mock }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  // Wire chainable methods to return chain unless overridden
  for (const k of ['select', 'eq', 'in', 'lte', 'order', 'insert']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  if (!overrides['gte']) chain.gte = jest.fn().mockResolvedValue({ count: 0, error: null })
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('checkPackageAvailability', () => {
  it('returns available when no overlapping reservations', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { checkPackageAvailability } = await import('@/lib/db/packages')
    const result = await checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1)
    expect(result.available).toBe(true)
  })

  it('returns unavailable when capacity is full', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: 1, error: null }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { checkPackageAvailability } = await import('@/lib/db/packages')
    const result = await checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1)
    expect(result.available).toBe(false)
  })

  it('throws if DB returns an error', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { checkPackageAvailability } = await import('@/lib/db/packages')
    await expect(
      checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1),
    ).rejects.toThrow('checkPackageAvailability')
  })
})

describe('getPackageProductById', () => {
  it('returns product when found and category is regatta_management', async () => {
    const mockProduct = {
      id: 'uuid',
      name: 'Race Committee Package',
      slug: 'race-committee-package',
      category: 'regatta_management',
      price_per_day_cents: 10500,
      payment_mode: 'capture',
      min_advance_booking_days: null,
      atlas2_units_required: 0,
      tablet_required: true,
      capacity: 3,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { getPackageProductById } = await import('@/lib/db/packages')
    const result = await getPackageProductById('uuid')
    expect(result).toEqual(mockProduct)
  })

  it('returns null for non-regatta product (category guard)', async () => {
    const mockProduct = {
      id: 'uuid',
      name: 'Atlas 2',
      slug: 'atlas-2',
      category: 'individual_rental',
      price_per_day_cents: 3500,
      payment_mode: 'capture',
      min_advance_booking_days: null,
      atlas2_units_required: 1,
      tablet_required: false,
      capacity: 10,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { getPackageProductById } = await import('@/lib/db/packages')
    const result = await getPackageProductById('uuid')
    expect(result).toBeNull()
  })

  it('returns null when not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)
    const { getPackageProductById } = await import('@/lib/db/packages')
    const result = await getPackageProductById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('checkMultiUnitAvailability', () => {
  it('returns available when enough atlas2 and tablet units exist', async () => {
    const calls = [
      { count: 10, error: null }, // atlas2 total
      { count: 2, error: null },  // tablet total
      { data: [], error: null },  // atlas2 allocated
      { data: [], error: null },  // tablet allocated
    ]
    let i = 0
    ;(mockSupabase.from as jest.Mock).mockImplementation(() => {
      const result = calls[i++]
      return makeChain({ gte: jest.fn().mockResolvedValue(result) })
    })

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)
    expect(result.available).toBe(true)
  })

  it('returns unavailable when not enough atlas2 units', async () => {
    const calls = [
      { count: 3, error: null },  // only 3 atlas2 (need 5)
      { count: 2, error: null },
      { data: [], error: null },
    ]
    let i = 0
    ;(mockSupabase.from as jest.Mock).mockImplementation(() => {
      const result = calls[i++]
      return makeChain({ gte: jest.fn().mockResolvedValue(result) })
    })

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(/atlas 2/i)
  })

  it('throws if DB returns error on unit count', async () => {
    ;(mockSupabase.from as jest.Mock).mockImplementation(() =>
      makeChain({ gte: jest.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }) }),
    )

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    await expect(
      checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true),
    ).rejects.toThrow('checkMultiUnitAvailability')
  })
})

describe('insertReservationUnits', () => {
  it('inserts one reservation_units row per physical slot', async () => {
    const productChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { atlas2_units_required: 2, tablet_required: true },
        error: null,
      }),
    })
    const insert = jest.fn().mockResolvedValue({ error: null })

    ;(mockSupabase.from as jest.Mock)
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce({ insert })

    const { insertReservationUnits } = await import('@/lib/db/packages')
    await insertReservationUnits('res-1', 'prod-1', '2027-06-01', '2027-06-05')

    expect(insert).toHaveBeenCalledWith([
      {
        reservation_id: 'res-1',
        unit_type: 'atlas2',
        quantity: 1,
        start_date: '2027-06-01',
        end_date: '2027-06-05',
      },
      {
        reservation_id: 'res-1',
        unit_type: 'atlas2',
        quantity: 1,
        start_date: '2027-06-01',
        end_date: '2027-06-05',
      },
      {
        reservation_id: 'res-1',
        unit_type: 'tablet',
        quantity: 1,
        start_date: '2027-06-01',
        end_date: '2027-06-05',
      },
    ])
  })
})

describe('getPackageProduct', () => {
  it('returns product data when found', async () => {
    const mockProduct = {
      id: 'uuid',
      name: 'Race Committee Package',
      slug: 'race-committee-package',
      category: 'regatta_management',
      price_per_day_cents: 10500,
      payment_mode: 'capture',
      min_advance_booking_days: null,
      atlas2_units_required: 0,
      tablet_required: true,
      capacity: 1,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)

    const { getPackageProduct } = await import('@/lib/db/packages')
    const product = await getPackageProduct('race-committee-package')

    expect(product).toEqual(mockProduct)
  })

  it('returns null when product not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(mockSupabase.from as jest.Mock).mockReturnValue(chain)

    const { getPackageProduct } = await import('@/lib/db/packages')
    const product = await getPackageProduct('nonexistent-slug')

    expect(product).toBeNull()
  })
})

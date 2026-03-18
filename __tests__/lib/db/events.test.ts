/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
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

beforeEach(() => jest.clearAllMocks())

describe('listActiveRentalEvents', () => {
  it('returns active events with product allocations', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        name: 'Miami Race Week',
        location: 'Miami, FL',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        rental_event_products: [
          { product_id: 'prod-1', rental_price_cents: 15000, late_fee_cents: 3500, reserve_cutoff_days: 14, capacity: 10, inventory_status: 'in_stock' },
        ],
      },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockEvents, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveRentalEvents } = await import('@/lib/db/events')
    const result = await listActiveRentalEvents()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Miami Race Week')
    expect(supabaseAdmin.from).toHaveBeenCalledWith('rental_events')
  })

  it('throws on DB error', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB fail' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveRentalEvents } = await import('@/lib/db/events')
    await expect(listActiveRentalEvents()).rejects.toThrow('DB fail')
  })
})

describe('listActiveDateWindows', () => {
  it('returns active date windows with allocations', async () => {
    const mockWindows = [
      {
        id: 'win-1',
        label: 'Spring 2026',
        start_date: '2026-03-15',
        end_date: '2026-04-15',
        date_window_allocations: [
          { product_id: 'prod-1', capacity: 5, inventory_status: 'in_stock' },
        ],
      },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: mockWindows, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { listActiveDateWindows } = await import('@/lib/db/events')
    const result = await listActiveDateWindows()

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Spring 2026')
  })
})

describe('getEventProduct', () => {
  it('returns the event-product allocation', async () => {
    const mockRow = {
      event_id: 'evt-1',
      product_id: 'prod-1',
      rental_price_cents: 15000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
      inventory_status: 'in_stock',
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockRow, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getEventProduct } = await import('@/lib/db/events')
    const result = await getEventProduct('evt-1', 'prod-1')

    expect(result).not.toBeNull()
    expect(result!.rental_price_cents).toBe(15000)
  })

  it('returns null when not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getEventProduct } = await import('@/lib/db/events')
    const result = await getEventProduct('evt-1', 'prod-1')
    expect(result).toBeNull()
  })
})

describe('getDateWindowProduct', () => {
  it('returns the window-product allocation', async () => {
    const mockRow = {
      date_window_id: 'win-1',
      product_id: 'prod-1',
      capacity: 5,
      inventory_status: 'in_stock',
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockRow, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { getDateWindowProduct } = await import('@/lib/db/events')
    const result = await getDateWindowProduct('win-1', 'prod-1')
    expect(result).not.toBeNull()
    expect(result!.capacity).toBe(5)
  })
})

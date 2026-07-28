/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { rpc: jest.fn(), from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { rpc: jest.Mock; from: jest.Mock }
}

import { getFleetAvailability, getFleetSize, getEventSubscriptions } from '@/lib/db/fleet'

const PRODUCT = '6f303d86-5763-4ece-aaad-b78d17852f8a'

beforeEach(() => jest.clearAllMocks())

describe('getFleetAvailability — only assigned units gate', () => {
  it('is available when holds exceed the fleet but nothing is assigned', async () => {
    // The core rule: 90 bookings against 62 units, zero allocated hardware.
    // Nobody is turned away.
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, assigned: 0, booked: 90, remaining: 62 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.available).toBe(true)
    expect(result.oversubscribed).toBe(true)
    expect(result).toMatchObject({ capacity: 62, assigned: 0, booked: 90, remaining: 62 })
  })

  it('passes the product and window straight through to the RPC', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, assigned: 30, booked: 31, remaining: 32 }],
      error: null,
    })

    await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('fleet_availability', {
      p_product_id: PRODUCT,
      p_start: '2026-09-19',
      p_end: '2026-09-26',
    })
  })

  it('is unavailable only when every serviceable unit is assigned', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, assigned: 62, booked: 62, remaining: 0 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.available).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('is unavailable when the fleet is empty', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 0, assigned: 0, booked: 0, remaining: 0 }],
      error: null,
    })

    await expect(
      getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26'),
    ).resolves.toMatchObject({ available: false })
  })

  it('reports subscription percentage from booked, not assigned', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 50, assigned: 2, booked: 45, remaining: 48 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.subscriptionPct).toBe(90)
    expect(result.nearCapacity).toBe(true)
    expect(result.oversubscribed).toBe(false)
  })

  it('treats an empty fleet as 0% rather than dividing by zero', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 0, assigned: 0, booked: 5, remaining: 0 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(Number.isFinite(result.subscriptionPct)).toBe(true)
    expect(result.subscriptionPct).toBe(0)
  })

  it('accepts a single object as well as a row array', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: { capacity: 10, assigned: 1, booked: 2, remaining: 9 },
      error: null,
    })

    await expect(
      getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26'),
    ).resolves.toMatchObject({ capacity: 10, available: true })
  })

  it('throws when the RPC errors', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'function does not exist' },
    })

    await expect(
      getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26'),
    ).rejects.toThrow(/function does not exist/)
  })

  it('throws when the RPC returns no rows', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({ data: [], error: null })

    await expect(
      getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26'),
    ).rejects.toThrow(/no rows/i)
  })
})

describe('getFleetSize', () => {
  function makeCountChain(result: { count: number | null; error: unknown }) {
    const chain: Record<string, jest.Mock> = {
      select: jest.fn(),
      eq: jest.fn(),
      is: jest.fn(),
      not: jest.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.is.mockReturnValue(chain)
    // Terminal call resolves — `not` is last in the builder chain.
    chain.not.mockResolvedValue(result)
    return chain
  }

  it('counts only serviceable, non-retired units', async () => {
    const chain = makeCountChain({ count: 62, error: null })
    supabaseAdmin.from.mockReturnValueOnce(chain)

    const size = await getFleetSize(PRODUCT)

    expect(supabaseAdmin.from).toHaveBeenCalledWith('units')
    expect(chain.eq).toHaveBeenCalledWith('product_id', PRODUCT)
    expect(chain.is).toHaveBeenCalledWith('retired_at', null)
    expect(size).toBe(62)
  })

  it('returns 0 rather than null when the fleet is empty', async () => {
    supabaseAdmin.from.mockReturnValueOnce(makeCountChain({ count: null, error: null }))

    await expect(getFleetSize(PRODUCT)).resolves.toBe(0)
  })

  it('throws when the count query errors', async () => {
    supabaseAdmin.from.mockReturnValueOnce(
      makeCountChain({ count: null, error: { message: 'permission denied' } }),
    )

    await expect(getFleetSize(PRODUCT)).rejects.toThrow(/permission denied/)
  })
})

describe('getEventSubscriptions', () => {
  function stubAllocations(rows: unknown[] | null, error: unknown = null) {
    const chain: Record<string, jest.Mock> = {}
    chain.select = jest.fn(() => chain)
    // `gte` terminates the builder.
    chain.gte = jest.fn(() => Promise.resolve({ data: rows, error }))
    supabaseAdmin.from.mockReturnValueOnce(chain)
    return chain
  }

  const allocation = (over: Record<string, unknown> = {}) => ({
    event_id: 'evt-1',
    product_id: PRODUCT,
    rental_events: { name: 'Snipe Worlds', start_date: '2026-09-19', end_date: '2026-09-26' },
    products: { name: 'Vakaros Atlas 2' },
    ...over,
  })

  it('joins availability onto each active event allocation', async () => {
    stubAllocations([allocation()])
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, assigned: 0, booked: 90, remaining: 62 }],
      error: null,
    })

    const [row] = await getEventSubscriptions()

    expect(row).toMatchObject({
      eventName: 'Snipe Worlds',
      productName: 'Vakaros Atlas 2',
      capacity: 62,
      booked: 90,
      oversubscribed: true,
    })
  })

  it('drops products with no fleet, which carry no signal', async () => {
    stubAllocations([allocation(), allocation({ event_id: 'evt-2', product_id: 'empty-prod' })])
    supabaseAdmin.rpc
      .mockResolvedValueOnce({ data: [{ capacity: 62, assigned: 0, booked: 10, remaining: 62 }], error: null })
      .mockResolvedValueOnce({ data: [{ capacity: 0, assigned: 0, booked: 4, remaining: 0 }], error: null })

    const result = await getEventSubscriptions()

    expect(result).toHaveLength(1)
    expect(result[0].capacity).toBe(62)
  })

  it('sorts the most subscribed window first', async () => {
    stubAllocations([
      allocation({ event_id: 'low' }),
      allocation({ event_id: 'high' }),
    ])
    supabaseAdmin.rpc
      .mockResolvedValueOnce({ data: [{ capacity: 100, assigned: 0, booked: 10, remaining: 100 }], error: null })
      .mockResolvedValueOnce({ data: [{ capacity: 100, assigned: 0, booked: 95, remaining: 100 }], error: null })

    const result = await getEventSubscriptions()

    expect(result.map(r => r.subscriptionPct)).toEqual([95, 10])
  })

  it('skips allocations whose event row is missing', async () => {
    stubAllocations([allocation({ rental_events: null })])

    await expect(getEventSubscriptions()).resolves.toEqual([])
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })

  it('returns an empty list when there are no active events', async () => {
    stubAllocations([])
    await expect(getEventSubscriptions()).resolves.toEqual([])
  })

  it('throws when the allocation query errors', async () => {
    stubAllocations(null, { message: 'permission denied' })
    await expect(getEventSubscriptions()).rejects.toThrow(/permission denied/)
  })
})

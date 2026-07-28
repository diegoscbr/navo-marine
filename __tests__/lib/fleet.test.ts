/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { rpc: jest.fn(), from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { rpc: jest.Mock; from: jest.Mock }
}

import { getFleetAvailability, getFleetSize } from '@/lib/db/fleet'

const PRODUCT = '6f303d86-5763-4ece-aaad-b78d17852f8a'

beforeEach(() => jest.clearAllMocks())

describe('getFleetAvailability', () => {
  it('derives capacity from the fleet and reports remaining', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, reserved: 30, remaining: 32 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('fleet_availability', {
      p_product_id: PRODUCT,
      p_start: '2026-09-19',
      p_end: '2026-09-26',
    })
    expect(result).toEqual({
      available: true,
      capacity: 62,
      reserved: 30,
      remaining: 32,
    })
  })

  it('is unavailable when holds equal the fleet size', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 62, reserved: 62, remaining: 0 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.available).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('is unavailable when the fleet is empty', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ capacity: 0, reserved: 0, remaining: 0 }],
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.available).toBe(false)
  })

  it('accepts a single object as well as a row array', async () => {
    supabaseAdmin.rpc.mockResolvedValueOnce({
      data: { capacity: 10, reserved: 2, remaining: 8 },
      error: null,
    })

    const result = await getFleetAvailability(PRODUCT, '2026-09-19', '2026-09-26')

    expect(result.capacity).toBe(10)
    expect(result.available).toBe(true)
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

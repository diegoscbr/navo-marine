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
    in: jest.fn().mockReturnThis(),
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

describe('checkEventAvailability', () => {
  it('returns available when count < capacity', async () => {
    const countChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: null, error: null, count: 3 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkEventAvailability } = await import('@/lib/db/availability')
    const result = await checkEventAvailability('evt-1', 'prod-1', 10)

    expect(result).toEqual({ available: true, reserved: 3, capacity: 10, remaining: 7 })
  })

  it('returns unavailable when count >= capacity', async () => {
    const countChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: null, error: null, count: 10 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkEventAvailability } = await import('@/lib/db/availability')
    const result = await checkEventAvailability('evt-1', 'prod-1', 10)

    expect(result).toEqual({ available: false, reserved: 10, capacity: 10, remaining: 0 })
  })
})

describe('checkWindowAvailability', () => {
  it('returns available when count < capacity', async () => {
    const countChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
    })
    supabaseAdmin.from.mockReturnValue(countChain)

    const { checkWindowAvailability } = await import('@/lib/db/availability')
    const result = await checkWindowAvailability('win-1', 'prod-1', 5)

    expect(result).toEqual({ available: true, reserved: 1, capacity: 5, remaining: 4 })
  })
})

/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

const ADMIN_SESSION = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const NON_ADMIN = { user: { email: 'user@gmail.com', id: 'u2' } }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('DELETE /api/admin/reservations/[id]', () => {
  const makeReq = () =>
    new NextRequest('http://localhost/api/admin/reservations/r1', {
      method: 'DELETE',
    })

  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when reservation not found', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const chain = makeChain({
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 for reserved_paid reservation with future end_date', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_paid',
      end_date: '2099-12-31',
      event_id: null,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)
    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows delete of reserved_unpaid reservation', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_unpaid',
      end_date: '2099-12-31',
      event_id: null,
    }

    const fromCalls: string[] = []

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'reservations') {
        reservationCallCount++
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
    expect(fromCalls).toContain('orders')
    expect(fromCalls.filter((t) => t === 'reservations')).toHaveLength(2)
  })

  it('allows delete of reserved_paid reservation with past end_date', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'reserved_paid',
      end_date: '2020-01-01',
      event_id: null,
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      reservationCallCount =
        table === 'reservations' ? reservationCallCount + 1 : reservationCallCount
      if (table === 'reservations') {
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
  })

  it('allows delete of cancelled reservation', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const reservation = {
      id: 'r1',
      status: 'cancelled',
      end_date: '2099-12-31',
      event_id: null,
    }

    const resChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: reservation, error: null }),
    })
    const ordersChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    const deleteChain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })

    let reservationCallCount = 0
    supabaseAdmin.from.mockImplementation((table: string) => {
      reservationCallCount =
        table === 'reservations' ? reservationCallCount + 1 : reservationCallCount
      if (table === 'reservations') {
        return reservationCallCount === 1 ? resChain : deleteChain
      }
      if (table === 'orders') return ordersChain
      return makeChain()
    })

    const { DELETE } = await import(
      '@/app/api/admin/reservations/[id]/route'
    )
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(204)
  })
})

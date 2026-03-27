/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  chain.select = jest.fn().mockReturnValue(chain)
  chain.insert = jest.fn().mockReturnValue(chain)
  chain.update = jest.fn().mockReturnValue(chain)
  chain.eq = jest.fn().mockReturnValue(chain)
  chain.in = jest.fn().mockReturnValue(chain)
  chain.is = jest.fn().mockReturnValue(chain)
  chain.order = jest.fn().mockReturnValue(chain)
  return chain
}

const adminSession = { user: { id: 'admin-1', email: 'test@navomarine.com' } }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/admin/units', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ navo_number: 'NAVO-041', product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates a unit and returns 201', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', navo_number: 'NAVO-041', status: 'available' },
        error: null,
      }),
    })
    const auditChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(insertChain)  // units insert
      .mockReturnValueOnce(auditChain)   // unit_events insert
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ navo_number: 'NAVO-041', product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('returns 400 when navo_number is missing', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/units/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'override' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 409 when unit has an active paid reservation', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const reservationChain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'res-1' }, error: null }),
    })
    supabaseAdmin.from.mockReturnValueOnce(reservationChain)
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'override' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(409)
  })

  it('updates status and returns 200', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const noReservation = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const currentUnitChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { status: 'in_transit' }, error: null }),
    })
    const updateChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', navo_number: 'NAVO-001', status: 'available', notes: null },
        error: null,
      }),
    })
    const auditChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(noReservation)   // reservation check
      .mockReturnValueOnce(currentUnitChain) // get current status
      .mockReturnValueOnce(updateChain)      // update
      .mockReturnValueOnce(auditChain)       // unit_events insert
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'Checked in' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(200)
  })
})

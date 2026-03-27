/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

import { NextRequest } from 'next/server'
const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }
const { auth } = require('@/lib/auth') as { auth: jest.Mock }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  Object.assign(chain, overrides)
  for (const key of ['select', 'update', 'eq']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { email: 'admin@navomarine.com' } })
})

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

it('returns 401 for non-admin', async () => {
  auth.mockResolvedValue({ user: { email: 'hacker@gmail.com' } })
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({ unit_id: 'unit-1' }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(401)
})

it('assigns a unit to a reservation', async () => {
  const updated = { id: 'res-1', unit_id: 'unit-1' }
  supabaseAdmin.from.mockReturnValueOnce(
    makeChain({ single: jest.fn().mockResolvedValue({ data: updated, error: null }) })
  )
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({ unit_id: 'unit-1' }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.reservation.unit_id).toBe('unit-1')
})

it('returns 400 when unit_id is missing', async () => {
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({}), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(400)
})

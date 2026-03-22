/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }

const ADMIN_SESSION = { user: { email: 'admin@navomarine.com', id: 'u1' } }
const NON_ADMIN_SESSION = { user: { email: 'user@gmail.com', id: 'u2' } }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    if (!overrides[k]) chain[k] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/admin/events', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN_SESSION)
    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns events list for admin', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const mockEvents = [{ id: 'e1', name: 'Test Event', location: 'Boston', start_date: '2026-06-01', end_date: '2026-06-05', active: true }]
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: mockEvents, error: null }) })
    supabaseAdmin.from.mockReturnValue(chain)
    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toHaveLength(1)
  })
})

describe('POST /api/admin/events', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN_SESSION)
    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', location: 'y', start_date: '2026-06-01', end_date: '2026-06-05' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'only name' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates event and returns 201 for admin', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const newEvent = { id: 'e2', name: 'New Event', location: 'Boston', start_date: '2026-07-01', end_date: '2026-07-05', active: true }
    const chain = makeChain({ single: jest.fn().mockResolvedValue({ data: newEvent, error: null }) })
    supabaseAdmin.from.mockReturnValue(chain)
    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Event', location: 'Boston', start_date: '2026-07-01', end_date: '2026-07-05' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.event.name).toBe('New Event')
  })
})

describe('PATCH /api/admin/events/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN_SESSION)
    const { PATCH } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/e1', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(401)
  })

  it('updates event for admin', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const updated = { id: 'e1', name: 'Updated', location: 'Boston', start_date: '2026-06-01', end_date: '2026-06-05', active: false }
    const chain = makeChain({ single: jest.fn().mockResolvedValue({ data: updated, error: null }) })
    supabaseAdmin.from.mockReturnValue(chain)
    const { PATCH } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/e1', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.active).toBe(false)
  })
})

describe('DELETE /api/admin/events/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue(NON_ADMIN_SESSION)
    const { DELETE } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/e1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 204 on successful delete', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ error: null }) })
    supabaseAdmin.from.mockReturnValue(chain)
    const { DELETE } = await import('@/app/api/admin/events/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/events/e1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(204)
  })
})

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
    const eventChain = makeChain({ single: jest.fn().mockResolvedValue({ data: newEvent, error: null }) })
    const productsChain = makeChain({ eq: jest.fn().mockResolvedValue({ data: [], error: null }) })
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'rental_events') return eventChain
      if (table === 'products') return productsChain
      return makeChain()
    })
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

  it('auto-links all individual_rental products after creating event', async () => {
    auth.mockResolvedValue(ADMIN_SESSION)

    const newEvent = {
      id: 'e3',
      name: 'Auto-Link Event',
      location: 'Miami',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      active: true,
    }

    const products = [
      { id: 'p1', name: 'Vakaros Atlas 2', price_per_day_cents: 3500 },
      { id: 'p2', name: 'Tablet (Internal)', price_per_day_cents: null },
    ]

    const fromCalls: string[] = []

    const eventChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: newEvent, error: null }),
    })

    const productsChain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: products, error: null }),
    })

    const linkChain = makeChain({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    supabaseAdmin.from.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'rental_events') return eventChain
      if (table === 'products') return productsChain
      if (table === 'rental_event_products') return linkChain
      return makeChain()
    })

    const { POST } = await import('@/app/api/admin/events/route')
    const req = new NextRequest('http://localhost/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Auto-Link Event',
        location: 'Miami',
        start_date: '2026-08-01',
        end_date: '2026-08-05',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)

    expect(fromCalls).toContain('products')
    expect(fromCalls).toContain('rental_event_products')

    const insertCall = linkChain.insert.mock.calls[0][0]
    expect(insertCall).toHaveLength(2)

    expect(insertCall[0]).toEqual({
      event_id: 'e3',
      product_id: 'p1',
      rental_price_cents: 17500,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 40,
      inventory_status: 'in_stock',
      rental_price_per_day_cents: 3500,
    })

    expect(insertCall[1]).toEqual({
      event_id: 'e3',
      product_id: 'p2',
      rental_price_cents: 0,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 40,
      inventory_status: 'in_stock',
      rental_price_per_day_cents: null,
    })
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

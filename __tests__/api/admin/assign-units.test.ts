/**
 * @jest-environment node
 */
import { POST } from '@/app/api/admin/reservations/[id]/assign-units/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth-guard', () => ({
  requireAdmin: jest.fn(),
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
  },
}))

import { requireAdmin } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/reservations/res-1/assign-units', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

it('returns 403 when not admin', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: false })
  const res = await POST(makeRequest({ assignments: [] }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(403)
})

it('returns 400 when assignments is not an array', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })
  const res = await POST(makeRequest({ assignments: 'bad' }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(400)
})

it('calls rpc and returns 200 on success', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })
  ;(supabaseAdmin.rpc as jest.Mock).mockResolvedValue({ error: null })

  const res = await POST(
    makeRequest({ assignments: [{ unit_type: 'tablet', unit_id: 'u-1' }] }),
    { params: Promise.resolve({ id: 'res-1' }) },
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(supabaseAdmin.rpc).toHaveBeenCalledWith('assign_reservation_units', {
    p_reservation_id: 'res-1',
    p_assignments: expect.any(String),
  })
})

it('returns 200 and calls rpc with empty array when all assignments have null unit_id', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })
  ;(supabaseAdmin.rpc as jest.Mock).mockResolvedValue({ error: null })

  const res = await POST(
    makeRequest({ assignments: [{ unit_type: 'tablet', unit_id: null }] }),
    { params: Promise.resolve({ id: 'res-1' }) },
  )
  expect(res.status).toBe(200)
})

it('returns 500 when rpc returns an error', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })
  ;(supabaseAdmin.rpc as jest.Mock).mockResolvedValue({ error: { message: 'db error' } })

  const res = await POST(
    makeRequest({ assignments: [{ unit_type: 'tablet', unit_id: 'u-1' }] }),
    { params: Promise.resolve({ id: 'res-1' }) },
  )
  expect(res.status).toBe(500)
})

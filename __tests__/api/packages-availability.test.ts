/**
 * @jest-environment node
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/packages', () => ({ checkPackageAvailability: jest.fn() }))
jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { auth } from '@/lib/auth'
import { checkPackageAvailability } from '@/lib/db/packages'
import { GET } from '@/app/api/packages/availability/route'
import { NextRequest } from 'next/server'

const mockAuth = auth as jest.Mock
const mockCheck = checkPackageAvailability as jest.Mock

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/packages/availability')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/packages/availability', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeRequest({ product_id: 'uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when params missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const res = await GET(makeRequest({ product_id: 'uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns availability result when product found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { capacity: 1 }, error: null }),
    })
    mockCheck.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })

    const res = await GET(makeRequest({ product_id: 'prod-uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(true)
  })
})

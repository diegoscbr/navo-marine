/**
 * @jest-environment node
 */

jest.mock('@/lib/db/packages', () => ({ checkPackageAvailability: jest.fn() }))
jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { checkPackageAvailability } from '@/lib/db/packages'
import { GET } from '@/app/api/packages/availability/route'
import { NextRequest } from 'next/server'

const mockCheck = checkPackageAvailability as jest.Mock

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/packages/availability')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/packages/availability', () => {
  it('returns 400 when params missing', async () => {
    const res = await GET(makeRequest({ product_id: 'uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns availability result when product found', async () => {
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

  it('returns 200 for anonymous request with valid params (no auth required)', async () => {
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { capacity: 2 }, error: null }),
    })
    mockCheck.mockResolvedValue({ available: true, reserved: 0, capacity: 2, remaining: 2 })

    const res = await GET(makeRequest({ product_id: 'prod-uuid', start_date: '2027-02-01', end_date: '2027-02-03' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ available: true, remaining: 2 })
  })

  it('does NOT leak reserved or capacity to anonymous callers', async () => {
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { capacity: 10 }, error: null }),
    })
    mockCheck.mockResolvedValue({ available: true, reserved: 7, capacity: 10, remaining: 3 })

    const res = await GET(makeRequest({ product_id: 'prod-uuid', start_date: '2027-03-01', end_date: '2027-03-05' }))
    const body = await res.json()
    expect(body).not.toHaveProperty('reserved')
    expect(body).not.toHaveProperty('capacity')
    expect(body).toEqual({ available: true, remaining: 3 })
  })
})

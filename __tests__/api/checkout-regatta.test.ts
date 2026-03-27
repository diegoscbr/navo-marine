/**
 * @jest-environment node
 */
// __tests__/api/checkout-regatta.test.ts

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/checkout/handlers/rental-event', () => ({ handleRentalEvent: jest.fn() }))
jest.mock('@/lib/checkout/handlers/rental-custom', () => ({ handleRentalCustom: jest.fn() }))
jest.mock('@/lib/checkout/handlers/regatta-package', () => ({ handleRegattaPackage: jest.fn() }))
// Prevent transitive next/server side-effect issues in jsdom test environment
jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))
jest.mock('@/lib/stripe/client', () => ({ stripe: { checkout: { sessions: { create: jest.fn() } } } }))
jest.mock('@/lib/db/events', () => ({ getEventProduct: jest.fn(), getDateWindowProduct: jest.fn() }))
jest.mock('@/lib/db/availability', () => ({ checkEventAvailability: jest.fn(), checkWindowAvailability: jest.fn() }))

import { NextRequest } from 'next/server'

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { handleRegattaPackage } = require('@/lib/checkout/handlers/regatta-package') as {
  handleRegattaPackage: jest.Mock
}

const mockAuth = auth as jest.Mock
const mockHandlePackage = handleRegattaPackage as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/checkout — regatta_package', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', product_id: 'uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing product_id', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing start_date', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', product_id: 'uuid', end_date: '2027-01-05' }))
    expect(res.status).toBe(400)
  })

  it('delegates to handleRegattaPackage and returns its result', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    mockHandlePackage.mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/pay', reservation_id: 'res-1' } })

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({
      reservation_type: 'regatta_package',
      product_id: 'prod-uuid',
      start_date: '2027-06-01',
      end_date: '2027-06-05',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://stripe.com/pay')
    expect(mockHandlePackage).toHaveBeenCalledWith(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      { user: { id: 'u1', email: 'test@test.com' } },
      'http://localhost',
    )
  })
})

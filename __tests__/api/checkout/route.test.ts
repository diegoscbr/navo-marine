/**
 * @jest-environment node
 *
 * Route-level tests for /api/checkout — validates auth, type dispatch,
 * and purchase-specific quantity validation. Handlers are mocked.
 */
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
  supabase: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/checkout/handlers/rental-event', () => ({
  handleRentalEvent: jest.fn().mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/rental' } }),
}))
jest.mock('@/lib/checkout/handlers/rental-custom', () => ({
  handleRentalCustom: jest.fn().mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/rental-custom' } }),
}))
jest.mock('@/lib/checkout/handlers/regatta-package', () => ({
  handleRegattaPackage: jest.fn().mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/package' } }),
}))
jest.mock('@/lib/checkout/handlers/purchase', () => ({
  handlePurchase: jest.fn().mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/purchase', reservation_id: 'res-1' } }),
}))

import { NextRequest } from 'next/server'
const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { handlePurchase } = require('@/lib/checkout/handlers/purchase') as { handlePurchase: jest.Mock }

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'user-1', email: 'test@example.com' } })
})

it('returns 401 when not authenticated', async () => {
  auth.mockResolvedValue(null)
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', product_id: 'atlas-2', quantity: 1 }))
  expect(res.status).toBe(401)
})

it('returns 400 for invalid reservation_type', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'unknown', product_id: 'atlas-2' }))
  expect(res.status).toBe(400)
})

it('returns 400 for missing product_id', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', quantity: 1 }))
  expect(res.status).toBe(400)
})

it('returns 400 for purchase quantity out of range', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', product_id: 'atlas-2', quantity: 9 }))
  expect(res.status).toBe(400)
})

it('returns 400 for purchase quantity = 0', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', product_id: 'atlas-2', quantity: 0 }))
  expect(res.status).toBe(400)
})

it('dispatches purchase to handlePurchase and returns url', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', product_id: 'atlas-2', quantity: 1, warranty_selected: false }))
  expect(res.status).toBe(200)
  expect(handlePurchase).toHaveBeenCalledWith(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    expect.objectContaining({ user: expect.objectContaining({ email: 'test@example.com' }) }),
    'http://localhost',
  )
  const body = await res.json()
  expect(body.url).toBe('https://stripe.com/purchase')
})

it('returns 400 for invalid confirmation_email', async () => {
  const { POST } = await import('@/app/api/checkout/route')
  const res = await POST(makeReq({ reservation_type: 'purchase', product_id: 'atlas-2', quantity: 1, confirmation_email: 'not-an-email' }))
  expect(res.status).toBe(400)
})

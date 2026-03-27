/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/email/templates', () => ({
  bookingPending: jest.fn().mockReturnValue({ to: 'test@example.com', subject: 'sub', html: '<p/>' }),
}))

import { handlePurchase } from '@/lib/checkout/handlers/purchase'
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'

const session = { user: { id: 'user-1', email: 'test@example.com' } }

function setupMocks(stripeUrl = 'https://checkout.stripe.com/test') {
  ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
    id: 'cs_test',
    url: stripeUrl,
  })
  ;(supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'products') {
      return { select: () => ({ eq: () => ({ single: () => ({ data: { id: 'db-product-uuid' }, error: null }) }) }) }
    }
    if (table === 'reservations') {
      return { insert: () => ({ select: () => ({ single: () => ({ data: { id: 'res-id' }, error: null }) }) }) }
    }
    return {}
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  setupMocks()
})

it('returns 404 for unknown product slug', async () => {
  const result = await handlePurchase(
    { product_id: 'not-real', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(404)
})

it('returns 400 for quantity = 0', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 0, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(400)
})

it('returns 400 for quantity > 8', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 9, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(400)
})

it('creates Stripe session with product price × quantity', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 2, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(200)
  expect(result.body.url).toBe('https://checkout.stripe.com/test')
  const call = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0]
  const productItem = call.line_items.find((li: { price_data: { product_data: { name: string } } }) =>
    li.price_data.product_data.name.includes('Atlas'),
  )
  expect(productItem.quantity).toBe(2)
})

it('includes shipping_address_collection for purchase type', async () => {
  await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  const call = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0]
  expect(call.shipping_address_collection).toEqual({ allowed_countries: ['US'] })
})

it('adds warranty line item when warranty_selected is true', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: true },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(200)
  const call = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0]
  expect(call.line_items).toHaveLength(2)
})

it('returns Stripe URL and reservation_id on success', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.body.url).toBe('https://checkout.stripe.com/test')
  expect(result.body.reservation_id).toBe('res-id')
})

it('returns 503 when Stripe create rejects', async () => {
  ;(stripe.checkout.sessions.create as jest.Mock).mockRejectedValue(new Error('Stripe down'))
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(503)
})

it('returns 500 when reservations insert fails', async () => {
  ;(supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'products') {
      return { select: () => ({ eq: () => ({ single: () => ({ data: { id: 'db-uuid' }, error: null }) }) }) }
    }
    if (table === 'reservations') {
      return { insert: () => ({ select: () => ({ single: () => ({ data: null, error: { message: 'insert failed' } }) }) }) }
    }
    return {}
  })
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(500)
})

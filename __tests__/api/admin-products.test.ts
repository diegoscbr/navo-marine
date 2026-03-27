/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/products', () => ({
  listProducts: jest.fn(),
  createProduct: jest.fn(),
  getProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { listProducts, createProduct, getProduct, updateProduct, deleteProduct } =
  require('@/lib/db/products') as {
    listProducts: jest.Mock
    createProduct: jest.Mock
    getProduct: jest.Mock
    updateProduct: jest.Mock
    deleteProduct: jest.Mock
  }

const adminSession = { user: { id: 'u1', email: 'admin@navomarine.com' } }
const userSession = { user: { id: 'u2', email: 'user@gmail.com' } }

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/products', {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/admin/products', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { GET } = await import('@/app/api/admin/products/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns products for admin', async () => {
    auth.mockResolvedValueOnce(adminSession)
    listProducts.mockResolvedValueOnce([{ id: 'p1', name: 'Atlas 2' }])
    const { GET } = await import('@/app/api/admin/products/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products).toHaveLength(1)
  })
})

describe('POST /api/admin/products', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { POST } = await import('@/app/api/admin/products/route')
    const res = await POST(makeRequest({ name: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('creates product for admin', async () => {
    auth.mockResolvedValueOnce(adminSession)
    createProduct.mockResolvedValueOnce({ id: 'p2', name: 'New Product' })
    const { POST } = await import('@/app/api/admin/products/route')
    const res = await POST(makeRequest({ name: 'New Product' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.product.name).toBe('New Product')
  })
})

describe('GET /api/admin/products/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { GET } = await import('@/app/api/admin/products/[id]/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when product not found', async () => {
    auth.mockResolvedValueOnce(adminSession)
    getProduct.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/admin/products/[id]/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(404)
  })

  it('returns product for admin', async () => {
    auth.mockResolvedValueOnce(adminSession)
    getProduct.mockResolvedValueOnce({ id: 'p1', name: 'Atlas 2' })
    const { GET } = await import('@/app/api/admin/products/[id]/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.product.id).toBe('p1')
  })
})

describe('PUT /api/admin/products/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { PUT } = await import('@/app/api/admin/products/[id]/route')
    const res = await PUT(makeRequest({ name: 'Updated' }), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(401)
  })

  it('updates product for admin', async () => {
    auth.mockResolvedValueOnce(adminSession)
    updateProduct.mockResolvedValueOnce({ id: 'p1', name: 'Updated' })
    const { PUT } = await import('@/app/api/admin/products/[id]/route')
    const res = await PUT(makeRequest({ name: 'Updated' }), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/products/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce(userSession)
    const { DELETE } = await import('@/app/api/admin/products/[id]/route')
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(401)
  })

  it('deletes product for admin', async () => {
    auth.mockResolvedValueOnce(adminSession)
    deleteProduct.mockResolvedValueOnce(undefined)
    const { DELETE } = await import('@/app/api/admin/products/[id]/route')
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})

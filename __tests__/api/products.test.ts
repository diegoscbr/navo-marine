/**
 * @jest-environment node
 */
jest.mock('@/lib/db/products', () => ({
  getActiveProducts: jest.fn(),
}))

const { getActiveProducts } = require('@/lib/db/products') as { getActiveProducts: jest.Mock }

const mockProduct = {
  id: 'prod-1',
  slug: 'atlas-2',
  name: 'Atlas 2',
  subtitle: 'Race instrument',
  description: 'Advanced racing instrument',
  status: 'active',
  priceCents: 99900,
  currency: 'usd',
  taxIncluded: false,
  inTheBox: '["Atlas 2 unit"]',
  options: [{ name: 'Color', required: true, values: [{ label: 'Black', priceDeltaCents: 0 }] }],
  addOns: [{ slug: 'case', name: 'Carry Case', description: null, priceCents: 4900, addonType: 'physical' }],
  rentalEnabled: true,
  rentalPriceCents: 15000,
  lateFeeCents: 3500,
  reserveCutoffDays: 14,
  requiresEventSelection: true,
  requiresSailNumber: true,
  manualUrl: 'https://example.com/manual',
}

describe('GET /api/products', () => {
  it('returns product feed', async () => {
    getActiveProducts.mockResolvedValueOnce([mockProduct])
    const { GET } = await import('@/app/api/products/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.products).toHaveLength(1)
    expect(json.products[0].slug).toBe('atlas-2')
    expect(json.products[0].pricing.amountCents).toBe(99900)
    expect(json.products[0].inTheBox).toEqual(['Atlas 2 unit'])
    expect(json.products[0].rentalPolicy).not.toBeNull()
    expect(json.products[0].support?.manualUrl).toBe('https://example.com/manual')
  })

  it('omits rentalPolicy when rental not enabled', async () => {
    getActiveProducts.mockResolvedValueOnce([{ ...mockProduct, rentalEnabled: false }])
    const { GET } = await import('@/app/api/products/route')
    const res = await GET()
    const json = await res.json()
    expect(json.products[0].rentalPolicy).toBeNull()
  })

  it('omits support when no manualUrl', async () => {
    getActiveProducts.mockResolvedValueOnce([{ ...mockProduct, manualUrl: null }])
    const { GET } = await import('@/app/api/products/route')
    const res = await GET()
    const json = await res.json()
    expect(json.products[0].support).toBeNull()
  })
})

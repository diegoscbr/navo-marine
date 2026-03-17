// __tests__/lib/db/storefront.test.ts
import { getStorefrontProductBySlug, listStorefrontProducts } from '@/lib/db/storefront'

const mockSingle = jest.fn()
const mockOrder = jest.fn()
const mockEq = jest.fn()
const mockSelect = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    eq: (...args: unknown[]) => mockEq(...args),
    order: (...args: unknown[]) => mockOrder(...args),
    single: (...args: unknown[]) => mockSingle(...args),
  },
}))

// Wire the chain so each method returns the same proxy object
const chainProxy = {
  from: (...args: unknown[]) => { mockFrom(...args); return chainProxy },
  select: (...args: unknown[]) => { mockSelect(...args); return chainProxy },
  eq: (...args: unknown[]) => { mockEq(...args); return chainProxy },
  order: (...args: unknown[]) => mockOrder(...args),
  single: (...args: unknown[]) => mockSingle(...args),
}

const mockProductRow = {
  id: 'prod-1',
  slug: 'atlas-2',
  name: 'Vakaros Atlas 2',
  subtitle: 'The most accurate instrument',
  description_short: 'Short desc',
  base_price_cents: 124900,
  currency: 'usd',
  tax_included: true,
  manual_url: 'https://support.vakaros.com/',
  rental_enabled: true,
  rental_price_cents: 24500,
  late_fee_cents: 3500,
  reserve_cutoff_days: 14,
  requires_event_selection: true,
  requires_sail_number: true,
  product_sections: [
    {
      section_key: 'accuracy',
      heading: 'Most accurate ever',
      body_markdown: 'Body text',
      sort_order: 0,
      product_feature_bullets: [{ bullet_text: 'Bullet 1', sort_order: 0 }],
    },
  ],
  product_spec_groups: [
    {
      group_name: 'Sensors',
      sort_order: 0,
      product_specs: [{ label: 'GNSS', value: '25Hz', sort_order: 0 }],
    },
  ],
  product_box_items: [{ item_name: 'Atlas 2', sort_order: 0 }],
  product_addons: [
    {
      sort_order: 0,
      addons: {
        id: 'addon-1',
        slug: 'vakaros-care-warranty',
        name: 'Vakaros Care Warranty',
        description: 'Coverage',
        price_cents: 20000,
        addon_type: 'warranty',
      },
    },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  // Re-wire supabaseAdmin to return the chainProxy
  const { supabaseAdmin } = jest.requireMock('@/lib/db/client')
  supabaseAdmin.from = (...args: unknown[]) => { mockFrom(...args); return chainProxy }
})

describe('getStorefrontProductBySlug', () => {
  it('maps DB row to StorefrontProduct', async () => {
    mockSingle.mockResolvedValueOnce({ data: mockProductRow, error: null })
    const result = await getStorefrontProductBySlug('atlas-2')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('atlas-2')
    expect(result!.pricing.amountCents).toBe(124900)
    expect(result!.sections).toHaveLength(1)
    expect(result!.sections[0].bullets).toHaveLength(1)
    expect(result!.techSpecs).toHaveLength(1)
    expect(result!.inTheBox).toEqual(['Atlas 2'])
    expect(result!.addOns).toHaveLength(1)
    expect(result!.addOns[0].slug).toBe('vakaros-care-warranty')
    expect(result!.rentalPolicy?.requiresEventSelection).toBe(true)
    expect(result!.rentalPolicy?.requiresSailNumber).toBe(true)
  })

  it('returns null when product not found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    })
    const result = await getStorefrontProductBySlug('nonexistent')
    expect(result).toBeNull()
  })
})

describe('listStorefrontProducts', () => {
  it('returns mapped products array', async () => {
    mockOrder.mockResolvedValueOnce({ data: [mockProductRow], error: null })
    const results = await listStorefrontProducts()
    expect(results).toHaveLength(1)
    expect(results[0].slug).toBe('atlas-2')
  })

  it('returns empty array when no active products', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })
    const results = await listStorefrontProducts()
    expect(results).toEqual([])
  })
})

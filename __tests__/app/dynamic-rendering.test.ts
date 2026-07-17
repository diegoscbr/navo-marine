/**
 * DB-driven public pages must opt out of static prerendering.
 *
 * Without `export const dynamic = 'force-dynamic'`, Next.js bakes the
 * Supabase query results into the page HTML at build time, so admin
 * changes (events, products, packages) never appear until the next
 * deploy — and deleted events keep showing on /reserve.
 */
jest.mock('@/lib/db/events', () => ({
  listActiveRentalEvents: jest.fn(),
  listActiveDateWindows: jest.fn(),
}))
jest.mock('@/lib/db/storefront', () => ({
  listStorefrontProducts: jest.fn(),
  getStorefrontProductBySlug: jest.fn(),
}))
jest.mock('@/lib/db/packages', () => ({
  listPackageProducts: jest.fn(),
}))

const PAGES: Array<[string, () => Promise<{ dynamic?: string }>]> = [
  ['/reserve', () => import('@/app/reserve/page')],
  ['/products', () => import('@/app/products/page')],
  ['/products/[slug]', () => import('@/app/products/[slug]/page')],
  ['/packages', () => import('@/app/packages/page')],
]

describe('dynamic rendering for DB-driven pages', () => {
  it.each(PAGES)('%s exports dynamic = "force-dynamic"', async (_route, load) => {
    const mod = await load()
    expect(mod.dynamic).toBe('force-dynamic')
  })
})

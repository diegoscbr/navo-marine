/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import type { Session } from 'next-auth'

const sessionState: { value: { data: Session | null; status: 'authenticated' | 'unauthenticated' | 'loading' } } = {
  value: { data: null, status: 'unauthenticated' },
}

jest.mock('next-auth/react', () => ({
  useSession: () => sessionState.value,
}))
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

// jsdom 26 locks every Location property (including `href`) as a non-configurable
// "unforgeable" own descriptor on the location instance, and assigning to
// `window.location.href` triggers a "navigation not implemented" error without
// updating the location.
//
// To intercept the assignment for assertion, we reach into jsdom's internal
// impl object (held under a Symbol-keyed slot on the wrapper) and override its
// `href` setter on the impl class. Production code stays untouched; the
// captured value lands in `hrefHolder`.
const hrefHolder: { value: string } = { value: '' }
const locationWrapper = window.location as unknown as Record<symbol, unknown>
const implSymbol = Object.getOwnPropertySymbols(locationWrapper).find(
  (s) => s.toString() === 'Symbol(impl)',
)
if (!implSymbol) {
  throw new Error('Could not locate jsdom Location impl symbol')
}
const locationImpl = locationWrapper[implSymbol] as Record<string, unknown>
Object.defineProperty(locationImpl, 'href', {
  configurable: true,
  enumerable: true,
  get() { return hrefHolder.value },
  set(v: string) { hrefHolder.value = v },
})

beforeEach(() => {
  hrefHolder.value = ''
  sessionState.value = { data: null, status: 'unauthenticated' }
})

describe('ProductPurchasePanel Buy Now auth branch', () => {
  it('signed-out: clicking Buy Now sets window.location.href to /login with encoded purchase selection', async () => {
    sessionState.value = { data: null, status: 'unauthenticated' }
    const { ProductPurchasePanel } = await import('@/app/products/[slug]/ProductPurchasePanel')

    const product = {
      slug: 'atlas-2',
      name: 'Vakaros Atlas 2',
      pricing: { amountCents: 99500, taxIncluded: true },
      addOns: [
        { slug: 'vakaros-care-warranty', name: 'Vakaros Care', priceCents: 9900 },
      ],
    } as never

    render(<ProductPurchasePanel product={product} />)

    fireEvent.click(screen.getByRole('button', { name: /buy now/i }))

    expect(window.location.href).toMatch(/^\/login\?callbackUrl=/)
    const callbackUrl = decodeURIComponent(window.location.href.split('callbackUrl=')[1])
    expect(callbackUrl).toMatch(/^\/products\/atlas-2\?/)
    const params = new URLSearchParams(callbackUrl.split('?')[1])
    expect(params.get('reservation_type')).toBe('purchase')
    expect(params.get('product_id')).toBe('atlas-2')
    expect(params.get('quantity')).toBe('1')
    expect(params.get('warranty_selected')).toBe('true')
  })
})

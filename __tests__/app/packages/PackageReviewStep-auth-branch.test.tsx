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

describe('PackageReviewStep Pay-click auth branch', () => {
  it('signed-out: clicking Reserve sets window.location.href to /login with encoded package selection', async () => {
    sessionState.value = { data: null, status: 'unauthenticated' }
    const { PackageReviewStep } = await import('@/app/packages/PackageReviewStep')

    const product = {
      id: 'pkg1',
      name: 'Race Committee Package',
      slug: 'race-committee',
      price_per_day_cents: 20000,
    } as never

    render(
      <PackageReviewStep
        product={product}
        startDate="2026-05-01"
        endDate="2026-05-03"
        onBack={() => {}}
      />,
    )

    // getByRole(/reserve/i) would match the Back button label too in some
    // setups; narrow to the Pay button by including the "pay|hold" suffix.
    fireEvent.click(screen.getByRole('button', { name: /reserve.*(pay|hold)/i }))

    expect(window.location.href).toMatch(/^\/login\?callbackUrl=/)
    const callbackUrl = decodeURIComponent(window.location.href.split('callbackUrl=')[1])
    const params = new URLSearchParams(callbackUrl.split('?')[1])
    expect(params.get('reservation_type')).toBe('regatta_package')
    expect(params.get('product_id')).toBe('pkg1')
    expect(params.get('start_date')).toBe('2026-05-01')
    expect(params.get('end_date')).toBe('2026-05-03')
  })
})

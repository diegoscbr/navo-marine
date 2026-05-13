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
// Replace the impl's href setter; the wrapper's set href() forwards via
// `esValue[implSymbol]["href"] = V`, which lands on our override.
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

describe('ReserveBookingUI Pay-click auth branch', () => {
  it('signed-out: Pay click sets window.location.href to /login with encoded selection', async () => {
    sessionState.value = { data: null, status: 'unauthenticated' }
    const { ReserveBookingUI } = await import('@/app/reserve/ReserveBookingUI')

    // Render with a single seeded event whose allocation references product p1.
    // canSubmit requires sail_number + selected event + a matching event product,
    // so the event MUST carry rental_event_products or the Pay button stays disabled.
    const events = [
      {
        id: 'e1',
        name: 'Spring Regatta',
        location: 'Miami',
        event_url: null,
        start_date: '2026-04-10',
        end_date: '2026-04-12',
        rental_event_products: [
          {
            product_id: 'p1',
            rental_price_cents: 10500,
            rental_price_per_day_cents: 3500,
            late_fee_cents: 1500,
            reserve_cutoff_days: 14,
            capacity: 10,
            inventory_status: 'available',
          },
        ],
      },
    ] as never
    const windows = [] as never
    render(<ReserveBookingUI events={events} windows={windows} defaultProductId="p1" />)

    // Select the event FIRST so the sail-number input mounts (it lives inside the
    // event-tab block, but the input is always rendered when activeTab === 'event').
    const eventSelector = screen.getByLabelText(/select event/i)
    fireEvent.change(eventSelector, { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText(/sail number/i), { target: { value: 'US-1' } })

    fireEvent.click(screen.getByRole('button', { name: /reserve.*pay/i }))

    expect(window.location.href).toMatch(/^\/login\?callbackUrl=/)
    const callbackUrl = decodeURIComponent(window.location.href.split('callbackUrl=')[1])
    expect(callbackUrl).toMatch(/^\/reserve\?/)
    const params = new URLSearchParams(callbackUrl.split('?')[1])
    expect(params.get('reservation_type')).toBe('rental_event')
    expect(params.get('product_id')).toBe('p1')
    expect(params.get('event_id')).toBe('e1')
    expect(params.get('sail_number')).toBe('US-1')
  })
})

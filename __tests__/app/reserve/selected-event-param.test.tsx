/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ReserveBookingUI } from '@/app/reserve/ReserveBookingUI'
import type { RentalEvent, DateWindow } from '@/lib/db/events'

let paramsString = ''

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(paramsString),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

const eventA: RentalEvent = {
  id: 'evt-A',
  name: 'Event A',
  location: 'Loc A',
  event_url: null,
  start_date: '2026-09-01',
  end_date: '2026-09-03',
  rental_event_products: [
    {
      product_id: 'prod-1',
      rental_price_cents: 10000,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 10,
      inventory_status: 'in_stock',
    },
  ],
}

const eventB: RentalEvent = { ...eventA, id: 'evt-B', name: 'Event B' }

const noWindows: DateWindow[] = []

beforeEach(() => {
  paramsString = ''
})

describe('ReserveBookingUI ?selected_event param', () => {
  it('pre-selects the event in the event dropdown when uuid matches a loaded event', () => {
    paramsString = 'selected_event=evt-B'
    render(
      <ReserveBookingUI events={[eventA, eventB]} windows={noWindows} defaultProductId="prod-1" />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('evt-B')
  })

  it('does not pre-select when uuid does not match any loaded event', () => {
    paramsString = 'selected_event=evt-missing'
    render(
      <ReserveBookingUI events={[eventA, eventB]} windows={noWindows} defaultProductId="prod-1" />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('does nothing when the param is absent', () => {
    render(
      <ReserveBookingUI events={[eventA, eventB]} windows={noWindows} defaultProductId="prod-1" />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('')
  })
})

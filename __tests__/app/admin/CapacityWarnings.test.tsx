import { render, screen } from '@testing-library/react'
import { CapacityWarnings } from '@/app/admin/reservations/CapacityWarnings'
import type { EventSubscription } from '@/lib/db/fleet'

function sub(over: Partial<EventSubscription> = {}): EventSubscription {
  return {
    eventId: 'evt-1',
    eventName: 'Snipe World Championship',
    startDate: '2026-09-19',
    endDate: '2026-09-26',
    productId: 'prod-1',
    productName: 'Vakaros Atlas 2',
    capacity: 62,
    assigned: 0,
    booked: 31,
    remaining: 62,
    subscriptionPct: 50,
    nearCapacity: false,
    oversubscribed: false,
    available: true,
    ...over,
  }
}

describe('CapacityWarnings', () => {
  it('renders nothing when no window is under pressure', () => {
    const { container } = render(<CapacityWarnings subscriptions={[sub()]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there are no subscriptions at all', () => {
    const { container } = render(<CapacityWarnings subscriptions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns when bookings approach the fleet', () => {
    render(
      <CapacityWarnings
        subscriptions={[sub({ booked: 52, subscriptionPct: 84, nearCapacity: true })]}
      />,
    )

    expect(screen.getByText(/Snipe World Championship/)).toBeInTheDocument()
    expect(screen.getByText(/52 booked \/ 62 units/)).toBeInTheDocument()
    expect(screen.getByText(/Approaching fleet size/)).toBeInTheDocument()
  })

  it('reports the overshoot and reassures that bookings still go through', () => {
    render(
      <CapacityWarnings
        subscriptions={[
          sub({ booked: 90, subscriptionPct: 145, oversubscribed: true, remaining: 62 }),
        ]}
      />,
    )

    expect(screen.getByText(/90 booked \/ 62 units/)).toBeInTheDocument()
    expect(screen.getByText(/Over-subscribed by 28/)).toBeInTheDocument()
    // The whole point of the change: this is not a blocker.
    expect(screen.getByText(/Bookings still go through/)).toBeInTheDocument()
  })

  it('mentions allocated units only once some exist', () => {
    const { rerender } = render(
      <CapacityWarnings subscriptions={[sub({ oversubscribed: true, booked: 70, assigned: 0 })]} />,
    )
    expect(screen.queryByText(/already allocated/)).not.toBeInTheDocument()

    rerender(
      <CapacityWarnings subscriptions={[sub({ oversubscribed: true, booked: 70, assigned: 12 })]} />,
    )
    expect(screen.getByText(/12 already allocated/)).toBeInTheDocument()
  })

  it('shows one row per flagged event and product, skipping healthy ones', () => {
    render(
      <CapacityWarnings
        subscriptions={[
          sub({ oversubscribed: true, booked: 90 }),
          sub({ eventId: 'evt-2', eventName: 'J24 Nationals', booked: 3, subscriptionPct: 5 }),
          sub({
            eventId: 'evt-3',
            eventName: 'Tablet pressure',
            productName: 'Tablet (Internal)',
            capacity: 2,
            booked: 2,
            subscriptionPct: 100,
            nearCapacity: true,
          }),
        ]}
      />,
    )

    expect(screen.getByText(/Snipe World Championship/)).toBeInTheDocument()
    expect(screen.getByText(/Tablet pressure/)).toBeInTheDocument()
    expect(screen.queryByText(/J24 Nationals/)).not.toBeInTheDocument()
  })
})

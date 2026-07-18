import { render, screen } from '@testing-library/react'
import { UpcomingEventsPreview } from '@/components/sections/UpcomingEventsPreview'
import type { RentalEvent } from '@/lib/db/events'

const baseEvent = (over: Partial<RentalEvent> = {}): RentalEvent => ({
  id: 'evt-1',
  name: 'Snipe World Championship',
  location: 'Riva del Garda, Italy',
  event_url: 'https://example.com/snipe-worlds',
  start_date: '2026-08-10',
  end_date: '2026-08-17',
  rental_event_products: [],
  ...over,
})

describe('UpcomingEventsPreview', () => {
  it('renders nothing when events array is empty', () => {
    const { container } = render(<UpcomingEventsPreview events={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders event name, location, and a formatted date range', () => {
    render(<UpcomingEventsPreview events={[baseEvent()]} />)
    expect(screen.getByText('Snipe World Championship')).toBeInTheDocument()
    expect(screen.getByText('Riva del Garda, Italy')).toBeInTheDocument()
    expect(screen.getByText(/Aug/)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('renders a Reserve link deep-linking to /reserve?selected_event=<id>', () => {
    render(<UpcomingEventsPreview events={[baseEvent({ id: 'evt-abc' })]} />)
    const reserveLink = screen.getByRole('link', { name: /reserve/i })
    expect(reserveLink).toHaveAttribute('href', '/reserve?selected_event=evt-abc')
  })

  it('renders an Event info link to event_url when present', () => {
    render(<UpcomingEventsPreview events={[baseEvent()]} />)
    expect(
      screen.getByRole('link', { name: /event info/i }),
    ).toHaveAttribute('href', 'https://example.com/snipe-worlds')
  })

  it('omits Event info link when event_url is null', () => {
    render(<UpcomingEventsPreview events={[baseEvent({ event_url: null })]} />)
    expect(screen.queryByRole('link', { name: /event info/i })).not.toBeInTheDocument()
  })

  it('caps display to first 6 events even if more are passed', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      baseEvent({ id: `evt-${i}`, name: `Event ${i}` }),
    )
    render(<UpcomingEventsPreview events={many} />)
    expect(screen.getAllByRole('link', { name: /reserve/i })).toHaveLength(6)
  })
})

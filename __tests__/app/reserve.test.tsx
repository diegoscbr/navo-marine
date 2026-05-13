import { render, screen } from '@testing-library/react'

jest.mock('@/lib/db/events', () => ({
  listActiveRentalEvents: jest.fn(),
  listActiveDateWindows: jest.fn(),
}))
jest.mock('@/components/layout/Navbar', () => ({ Navbar: () => <nav /> }))
jest.mock('@/components/layout/Footer', () => ({ Footer: () => <footer /> }))
jest.mock('@/app/reserve/ReserveBookingUI', () => ({
  ReserveBookingUI: () => <div data-testid="reserve-booking-ui" />,
}))

const { listActiveRentalEvents, listActiveDateWindows } = require('@/lib/db/events') as {
  listActiveRentalEvents: jest.Mock
  listActiveDateWindows: jest.Mock
}

describe('/reserve page', () => {
  beforeEach(() => {
    listActiveRentalEvents.mockResolvedValue([])
    listActiveDateWindows.mockResolvedValue([])
  })

  it('renders the booking form for anonymous visitors', async () => {
    const ReservePage = (await import('@/app/reserve/page')).default
    const jsx = await ReservePage()
    render(jsx as React.ReactElement)
    expect(screen.getByRole('heading', { name: /reserve vakaros atlas 2/i })).toBeInTheDocument()
    expect(screen.getByTestId('reserve-booking-ui')).toBeInTheDocument()
  })
})

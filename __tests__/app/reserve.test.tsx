import { render, screen } from '@testing-library/react'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/db/events', () => ({
  listActiveRentalEvents: jest.fn(),
  listActiveDateWindows: jest.fn(),
}))
jest.mock('@/components/layout/Navbar', () => ({ Navbar: () => <nav /> }))
jest.mock('@/components/layout/Footer', () => ({ Footer: () => <footer /> }))
jest.mock('@/app/reserve/ReserveBookingUI', () => ({
  ReserveBookingUI: () => <div data-testid="reserve-booking-ui" />,
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { redirect } = require('next/navigation') as { redirect: jest.Mock }
const { listActiveRentalEvents, listActiveDateWindows } = require('@/lib/db/events') as {
  listActiveRentalEvents: jest.Mock
  listActiveDateWindows: jest.Mock
}

describe('/reserve page', () => {
  beforeEach(() => {
    listActiveRentalEvents.mockResolvedValue([])
    listActiveDateWindows.mockResolvedValue([])
  })

  it('redirects to login when unauthenticated', async () => {
    auth.mockResolvedValueOnce(null)
    const ReservePage = (await import('@/app/reserve/page')).default
    await ReservePage()
    expect(redirect).toHaveBeenCalledWith('/login?callbackUrl=/reserve')
  })

  it('renders heading when authenticated', async () => {
    auth.mockResolvedValueOnce({ user: { id: 'u1', email: 'sailor@test.com' } })
    const ReservePage = (await import('@/app/reserve/page')).default
    const jsx = await ReservePage()
    render(jsx as React.ReactElement)
    expect(screen.getByRole('heading', { name: /reserve vakaros atlas 2/i })).toBeInTheDocument()
  })

  it('renders ReserveBookingUI when authenticated', async () => {
    auth.mockResolvedValueOnce({ user: { id: 'u1', email: 'sailor@test.com' } })
    const ReservePage = (await import('@/app/reserve/page')).default
    const jsx = await ReservePage()
    render(jsx as React.ReactElement)
    expect(screen.getByTestId('reserve-booking-ui')).toBeInTheDocument()
  })
})

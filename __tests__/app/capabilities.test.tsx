import { render, screen } from '@testing-library/react'
import { listActiveRentalEvents } from '@/lib/db/events'

jest.mock('@/lib/db/events', () => ({
  listActiveRentalEvents: jest.fn(),
}))
jest.mock('@/components/layout/Navbar', () => ({ Navbar: () => <nav /> }))
jest.mock('@/components/layout/Footer', () => ({ Footer: () => <footer /> }))
jest.mock('next/navigation', () => ({ usePathname: () => '/capabilities' }))

const mockListActive = listActiveRentalEvents as jest.MockedFunction<
  typeof listActiveRentalEvents
>

describe('/capabilities page', () => {
  beforeEach(() => {
    mockListActive.mockResolvedValue([])
  })

  it('renders the mission hero heading', async () => {
    const CapabilitiesPage = (await import('@/app/capabilities/page')).default
    const jsx = await CapabilitiesPage()
    render(jsx as React.ReactElement)
    expect(screen.getByRole('heading', { level: 1, name: /power competitive sailing/i }))
      .toBeInTheDocument()
  })

  it('renders the "What we do." service columns heading', async () => {
    const CapabilitiesPage = (await import('@/app/capabilities/page')).default
    const jsx = await CapabilitiesPage()
    render(jsx as React.ReactElement)
    expect(screen.getByRole('heading', { name: /what we do/i })).toBeInTheDocument()
  })

  it('renders the bottom CTA "Race with us." heading', async () => {
    const CapabilitiesPage = (await import('@/app/capabilities/page')).default
    const jsx = await CapabilitiesPage()
    render(jsx as React.ReactElement)
    expect(screen.getByRole('heading', { name: /race with us/i })).toBeInTheDocument()
  })

  it('hides the upcoming-events section when there are no active events', async () => {
    mockListActive.mockResolvedValue([])
    const CapabilitiesPage = (await import('@/app/capabilities/page')).default
    const jsx = await CapabilitiesPage()
    render(jsx as React.ReactElement)
    expect(screen.queryByRole('heading', { name: /where we.+racing next/i }))
      .not.toBeInTheDocument()
  })
})

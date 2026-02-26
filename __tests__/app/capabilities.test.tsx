import { render, screen } from '@testing-library/react'
import CapabilitiesPage from '@/app/capabilities/page'

jest.mock('next/navigation', () => ({ usePathname: () => '/capabilities' }))

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('/capabilities page', () => {
  it('renders CoreCapabilities heading', () => {
    render(<CapabilitiesPage />)
    expect(screen.getByRole('heading', { name: /built for high-performance/i })).toBeInTheDocument()
  })

  it('renders DataCapabilities heading', () => {
    render(<CapabilitiesPage />)
    expect(
      screen.getByRole('heading', { name: /advanced data infrastructure/i })
    ).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('DataCapabilities', () => {
  it('renders section heading', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Advanced Data Infrastructure for Modern Racing.'
    )
  })

  it('renders all 5 data capabilities', () => {
    render(<DataCapabilities />)
    expect(screen.getByText(/high-frequency gps/i)).toBeInTheDocument()
    expect(screen.getByText(/wind.*current.*tactical/i)).toBeInTheDocument()
    expect(screen.getByText(/performance benchmarking/i)).toBeInTheDocument()
    expect(screen.getByText(/historical comparison/i)).toBeInTheDocument()
    expect(screen.getByText(/live.*post-event.*pipeline/i)).toBeInTheDocument()
  })

  it('renders explore CTA', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('link', { name: /explore data capabilities/i })).toBeInTheDocument()
  })

  it('renders capabilities video element', () => {
    const { container } = render(<DataCapabilities />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('autoplay')
  })

  it('video source points to capabilities-ex.mp4', () => {
    const { container } = render(<DataCapabilities />)
    const source = container.querySelector('video source')
    expect(source).toHaveAttribute('src', '/video/capabilities-ex.mp4')
  })

  it('does NOT render the code mockup panel', () => {
    render(<DataCapabilities />)
    expect(screen.queryByText(/navo-telemetry-dashboard/i)).not.toBeInTheDocument()
  })
})

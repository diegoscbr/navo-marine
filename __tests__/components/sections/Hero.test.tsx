import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

// JSDOM doesn't implement HTMLMediaElement — mock play/pause so React
// doesn't throw when the autoPlay attribute triggers internal calls.
beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => {
  jest.restoreAllMocks()
})

describe('Hero', () => {
  it('renders primary headline', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Technology That Moves Sailing Forward.'
    )
  })

  it('does not render removed partner credential/subheadline copy', () => {
    render(<Hero />)
    expect(
      screen.queryByText(/official vakaros atlas ii partner · premier partner of ur sailing/i)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/premier race management & performance data specialists/i)
    ).not.toBeInTheDocument()
  })

  it('renders primary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /explore our capabilities/i })).toBeInTheDocument()
  })

  it('renders secondary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })

  it('renders a background video element', () => {
    const { container } = render(<Hero />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('autoplay')
    expect(video?.muted).toBe(true)
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('aria-hidden', 'true')
  })

  it('video source points to the hosted file', () => {
    const { container } = render(<Hero />)
    const source = container.querySelector('video source')
    expect(source).toBeInTheDocument()
    expect(source).toHaveAttribute('src', '/video/hero-bg.mp4')
    expect(source).toHaveAttribute('type', 'video/mp4')
  })
})

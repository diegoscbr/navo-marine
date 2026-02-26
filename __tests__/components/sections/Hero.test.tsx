import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('Hero', () => {
  it('renders primary headline', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Technology That Moves Sailing Forward.'
    )
  })

  it('renders Explore Our Capabilities CTA linking to /capabilities', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /explore our capabilities/i })
    expect(link).toHaveAttribute('href', '/capabilities')
  })

  it('does NOT render Partner With NAVO button', () => {
    render(<Hero />)
    expect(screen.queryByRole('link', { name: /partner with navo/i })).not.toBeInTheDocument()
  })

  it('renders a background video element that is muted and hidden', () => {
    const { container } = render(<Hero />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video?.muted).toBe(true)
    expect(video).toHaveAttribute('aria-hidden', 'true')
  })

  it('video source points to hero-bg.mp4', () => {
    const { container } = render(<Hero />)
    const source = container.querySelector('video source')
    expect(source).toHaveAttribute('src', '/video/hero-bg.mp4')
  })
})

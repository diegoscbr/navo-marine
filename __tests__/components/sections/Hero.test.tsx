import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

describe('Hero', () => {
  it('renders primary headline', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Technology That Moves Sailing Forward.'
    )
  })

  it('renders subheadline with partner credentials', () => {
    render(<Hero />)
    expect(screen.getByText(/official vakaros atlas ii partner/i)).toBeInTheDocument()
  })

  it('renders primary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /explore our capabilities/i })).toBeInTheDocument()
  })

  it('renders secondary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })
})

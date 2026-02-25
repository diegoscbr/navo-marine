import { render, screen } from '@testing-library/react'
import { ClosingCTA } from '@/components/sections/ClosingCTA'

describe('ClosingCTA', () => {
  it('renders closing statement', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'The Future of Marine Performance Starts Here.'
    )
  })

  it('renders Partner CTA', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })

  it('renders Request Consultation CTA', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('link', { name: /request consultation/i })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { WhyNavo } from '@/components/sections/WhyNavo'

describe('WhyNavo', () => {
  it('renders section heading', () => {
    render(<WhyNavo />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Why Leading Teams Choose NAVO.'
    )
  })

  it('renders all differentiator points', () => {
    render(<WhyNavo />)
    expect(screen.getByText(/performance-first/i)).toBeInTheDocument()
    expect(screen.getByText(/hardware.*analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/international/i)).toBeInTheDocument()
    expect(screen.getByText(/technical precision/i)).toBeInTheDocument()
    expect(screen.getByText(/trusted.*elite/i)).toBeInTheDocument()
  })
})

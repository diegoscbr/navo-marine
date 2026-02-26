import { render, screen } from '@testing-library/react'
import { VakarosSection } from '@/components/sections/VakarosSection'

describe('VakarosSection', () => {
  it('renders heading with official partner claim', () => {
    render(<VakarosSection />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Official Vakaros Atlas 2 Partner'
    )
  })

  it('renders all 5 service items', () => {
    render(<VakarosSection />)
    expect(screen.getByText(/certified integration/i)).toBeInTheDocument()
    expect(screen.getByText(/calibration services/i)).toBeInTheDocument()
    expect(screen.getByText(/deployment strategy/i)).toBeInTheDocument()
    expect(screen.getByText(/team training/i)).toBeInTheDocument()
    expect(screen.getByText(/system optimization/i)).toBeInTheDocument()
  })

  it('renders Reserve Units CTA linking to /reserve', () => {
    render(<VakarosSection />)
    const link = screen.getByRole('link', { name: /reserve units/i })
    expect(link).toHaveAttribute('href', '/reserve')
  })

  it('does NOT render the old Learn About button', () => {
    render(<VakarosSection />)
    expect(screen.queryByRole('link', { name: /atlas ii integration/i })).not.toBeInTheDocument()
  })
})

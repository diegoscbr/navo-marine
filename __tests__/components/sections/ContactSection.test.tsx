import { render, screen } from '@testing-library/react'
import { ContactSection } from '@/components/sections/ContactSection'

describe('ContactSection', () => {
  it('renders heading', () => {
    render(<ContactSection />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Get in Touch.')
  })

  it('renders mailto CTA link', () => {
    render(<ContactSection />)
    const link = screen.getByRole('link', { name: /contact navo/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })
})

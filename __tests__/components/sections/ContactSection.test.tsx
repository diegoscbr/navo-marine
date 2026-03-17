import { render, screen } from '@testing-library/react'
import { ContactSection } from '@/components/sections/ContactSection'

describe('ContactSection', () => {
  it('renders heading', () => {
    render(<ContactSection />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Work with NAVO.')
  })

  it('renders mailto CTA link', () => {
    render(<ContactSection />)
    const link = screen.getByRole('link', { name: /email navo/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })
})

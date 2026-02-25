import { render, screen } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'

describe('Navbar', () => {
  it('renders NAVO brand name', () => {
    render(<Navbar />)
    expect(screen.getByText('NAVO')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /capabilities/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /race management/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument()
  })

  it('renders CTA button', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })
})

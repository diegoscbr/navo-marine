import { render, screen } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'

describe('Navbar', () => {
  it('renders NAVO logo', () => {
    render(<Navbar />)
    expect(screen.getByAltText('NAVO Marine Technologies')).toBeInTheDocument()
  })

  it('renders Capabilities nav link pointing to /capabilities', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /capabilities/i })
    expect(link).toHaveAttribute('href', '/capabilities')
  })

  it('renders Contact nav link pointing to /contact', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /^contact$/i })
    expect(link).toHaveAttribute('href', '/contact')
  })

  it('renders Reserve nav link pointing to /reserve', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /reserve/i })
    expect(link).toHaveAttribute('href', '/reserve')
  })

  it('renders Login button', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument()
  })

  it('does NOT render Partner With NAVO button', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /partner with navo/i })).not.toBeInTheDocument()
  })

  it('does NOT render Race Management link', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /race management/i })).not.toBeInTheDocument()
  })
})

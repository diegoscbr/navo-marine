import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

describe('Landing page', () => {
  it('renders all major sections', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /technology that moves/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /built for high-performance/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /elite race execution/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /official vakaros/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /future of marine/i })).toBeInTheDocument()
  })

  it('renders contact section', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact navo/i })).toBeInTheDocument()
  })
})

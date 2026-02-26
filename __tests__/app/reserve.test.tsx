import { render, screen } from '@testing-library/react'
import ReservePage from '@/app/reserve/page'

describe('/reserve page', () => {
  it('renders reservation heading', () => {
    render(<ReservePage />)
    expect(screen.getByRole('heading', { name: /reserve vakaros atlas ii units/i })).toBeInTheDocument()
  })

  it('renders booking message', () => {
    render(<ReservePage />)
    expect(screen.getByText(/book a reservation consultation to secure your atlas 2 units/i)).toBeInTheDocument()
  })

  it('renders Calendly fallback link', () => {
    render(<ReservePage />)
    const link = screen.getByRole('link', { name: /open calendly in a new tab/i })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/calendly\.com\/d\/cx99-3zw-gtb/)
  })
})

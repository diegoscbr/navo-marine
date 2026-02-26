import { render, screen } from '@testing-library/react'
import ReservePage from '@/app/reserve/page'

describe('/reserve page', () => {
  it('renders the coming soon heading', () => {
    render(<ReservePage />)
    expect(screen.getByRole('heading', { name: /reserve vakaros atlas ii units/i })).toBeInTheDocument()
  })

  it('renders coming soon message', () => {
    render(<ReservePage />)
    expect(screen.getByText(/reservation system launching soon/i)).toBeInTheDocument()
  })

  it('renders email input', () => {
    render(<ReservePage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders Notify Me button', () => {
    render(<ReservePage />)
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })
})

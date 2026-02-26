import { render, screen } from '@testing-library/react'
import ContactPage from '@/app/contact/page'

jest.mock('next/navigation', () => ({ usePathname: () => '/contact' }))

describe('/contact page', () => {
  it('renders ContactSection heading', () => {
    render(<ContactPage />)
    expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'

describe('AuthorityStrip', () => {
  it('renders Vakaros partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText(/vakaros atlas ii/i)).toBeInTheDocument()
  })

  it('renders UR SAILING partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText(/ur sailing/i)).toBeInTheDocument()
  })

  it('renders all 3 trust signals', () => {
    render(<AuthorityStrip />)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })
})

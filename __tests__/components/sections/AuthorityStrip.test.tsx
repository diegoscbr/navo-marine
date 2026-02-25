import { render, screen } from '@testing-library/react'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'

describe('AuthorityStrip', () => {
  it('renders Vakaros partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText('OFFICIAL BRAND PARTNER')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /vakaros atlas ii/i })).toBeInTheDocument()
  })

  it('renders UR SAILING partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText('PREMIER PARTNER')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /ur sailing/i })).toBeInTheDocument()
  })

  it('renders SailViewer powered-by credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText('POWERED BY')).toBeInTheDocument()
    expect(screen.getByText('SailViewer')).toBeInTheDocument()
  })

  it('renders all 3 trust signals', () => {
    render(<AuthorityStrip />)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })
})

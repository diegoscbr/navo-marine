import { render, screen } from '@testing-library/react'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

describe('DataCapabilities', () => {
  it('renders section heading', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Advanced Data Infrastructure for Modern Racing.'
    )
  })

  it('renders all 5 data capabilities', () => {
    render(<DataCapabilities />)
    expect(screen.getByText(/high-frequency gps/i)).toBeInTheDocument()
    expect(screen.getByText(/wind.*current.*tactical/i)).toBeInTheDocument()
    expect(screen.getByText(/performance benchmarking/i)).toBeInTheDocument()
    expect(screen.getByText(/historical comparison/i)).toBeInTheDocument()
    expect(screen.getByText(/live.*post-event.*pipeline/i)).toBeInTheDocument()
  })

  it('renders explore CTA', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('link', { name: /explore data capabilities/i })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'

describe('CoreCapabilities', () => {
  it('renders section heading', () => {
    render(<CoreCapabilities />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Built for High-Performance Sailing.'
    )
  })

  it('renders all 3 capability cards', () => {
    render(<CoreCapabilities />)
    expect(screen.getByText('Performance Technology')).toBeInTheDocument()
    expect(screen.getByText('Race Management Services')).toBeInTheDocument()
    expect(screen.getByText('Marine Data Intelligence')).toBeInTheDocument()
  })

  it('renders capability descriptions', () => {
    render(<CoreCapabilities />)
    expect(screen.getByText(/vakaros atlas ii/i)).toBeInTheDocument()
    expect(screen.getByText(/end-to-end regatta/i)).toBeInTheDocument()
    expect(screen.getAllByText(/post-race analytics/i).length).toBeGreaterThan(0)
  })
})

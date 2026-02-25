import { render, screen } from '@testing-library/react'
import { RaceManagement } from '@/components/sections/RaceManagement'

describe('RaceManagement', () => {
  it('renders section heading', () => {
    render(<RaceManagement />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Elite Race Execution.'
    )
  })

  it('renders all 5 capabilities', () => {
    render(<RaceManagement />)
    expect(screen.getByText(/event architecture/i)).toBeInTheDocument()
    expect(screen.getByText(/on-water technology/i)).toBeInTheDocument()
    expect(screen.getByText(/fleet tracking/i)).toBeInTheDocument()
    expect(screen.getByText(/compliance/i)).toBeInTheDocument()
    expect(screen.getAllByText(/spectator/i).length).toBeGreaterThan(0)
  })
})

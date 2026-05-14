import { render, screen } from '@testing-library/react'
import { StatsBand } from '@/components/sections/StatsBand'
import { stats } from '@/lib/content/about'

describe('StatsBand', () => {
  it('renders all four stat tiles with labels and values', () => {
    render(<StatsBand />)
    for (const tile of stats.tiles) {
      expect(screen.getByText(tile.label)).toBeInTheDocument()
      expect(screen.getByText(tile.value)).toBeInTheDocument()
    }
  })

  it('renders the kicker line', () => {
    render(<StatsBand />)
    expect(screen.getByText(stats.kicker)).toBeInTheDocument()
  })
})

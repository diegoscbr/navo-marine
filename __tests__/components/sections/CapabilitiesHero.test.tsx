import { render, screen } from '@testing-library/react'
import { CapabilitiesHero } from '@/components/sections/CapabilitiesHero'
import { mission } from '@/lib/content/about'

describe('CapabilitiesHero', () => {
  it('renders the mission heading as h1', () => {
    render(<CapabilitiesHero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mission.heading)
  })

  it('renders the mission subline', () => {
    render(<CapabilitiesHero />)
    expect(screen.getByText(mission.subline)).toBeInTheDocument()
  })
})

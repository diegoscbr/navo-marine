import { render, screen } from '@testing-library/react'
import { PartnersBand } from '@/components/sections/PartnersBand'
import { partners } from '@/lib/content/about'

describe('PartnersBand', () => {
  it('renders a logo image for every partner', () => {
    render(<PartnersBand />)
    for (const p of partners) {
      expect(screen.getByAltText(`${p.name} logo`)).toBeInTheDocument()
    }
  })

  it('marks the premier partner with a "Premier Partner" label', () => {
    render(<PartnersBand />)
    expect(screen.getByText(/premier partner/i)).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { PastEventsGrid } from '@/components/sections/PastEventsGrid'
import { pastEvents } from '@/lib/content/about'

describe('PastEventsGrid', () => {
  it('renders every past event name, date_label, and location', () => {
    render(<PastEventsGrid />)
    for (const e of pastEvents) {
      expect(screen.getByText(e.name)).toBeInTheDocument()
      expect(screen.getByText(e.date_label)).toBeInTheDocument()
      expect(screen.getByText(e.location)).toBeInTheDocument()
    }
  })

  it('renders an image for every past event with alt text matching the name', () => {
    render(<PastEventsGrid />)
    for (const e of pastEvents) {
      const img = screen.getByAltText(e.name)
      expect(img).toBeInTheDocument()
      expect(img.tagName).toBe('IMG')
    }
  })
})

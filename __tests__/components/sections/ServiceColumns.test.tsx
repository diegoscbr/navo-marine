import { render, screen } from '@testing-library/react'
import { ServiceColumns } from '@/components/sections/ServiceColumns'
import { serviceColumns } from '@/lib/content/about'

describe('ServiceColumns', () => {
  it('renders all three column titles', () => {
    render(<ServiceColumns />)
    for (const col of serviceColumns) {
      expect(screen.getByRole('heading', { level: 3, name: col.title })).toBeInTheDocument()
    }
  })

  it('renders body copy and at least one example per column', () => {
    render(<ServiceColumns />)
    for (const col of serviceColumns) {
      expect(screen.getByText(col.body)).toBeInTheDocument()
      expect(screen.getByText(col.examples[0])).toBeInTheDocument()
    }
  })
})

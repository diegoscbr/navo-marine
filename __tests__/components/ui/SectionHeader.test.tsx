import { render, screen } from '@testing-library/react'
import { SectionHeader } from '@/components/ui/SectionHeader'

describe('SectionHeader', () => {
  it('renders heading text', () => {
    render(<SectionHeader heading="Built for High-Performance Sailing." />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Built for High-Performance Sailing.'
    )
  })

  it('renders optional subheading', () => {
    render(
      <SectionHeader
        heading="Why NAVO"
        subheading="Performance-first methodology"
      />
    )
    expect(screen.getByText('Performance-first methodology')).toBeInTheDocument()
  })

  it('does not render subheading element when not provided', () => {
    render(<SectionHeader heading="Title" />)
    expect(screen.queryByTestId('subheading')).not.toBeInTheDocument()
  })
})

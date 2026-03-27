import { render, screen, fireEvent } from '@testing-library/react'
import { PackagesUI } from '@/app/packages/PackagesUI'
import type { PackageProduct } from '@/lib/db/packages'

const mockProducts: PackageProduct[] = [
  {
    id: 'prod-1',
    name: 'Race Committee Package',
    slug: 'race-committee-package',
    category: 'regatta_management',
    price_per_day_cents: 10500,
    payment_mode: 'capture',
    min_advance_booking_days: null,
    atlas2_units_required: 0,
    tablet_required: true,
    capacity: 1,
  },
  {
    id: 'prod-2',
    name: 'RaceSense Management Services',
    slug: 'racesense-management-services',
    category: 'regatta_management',
    price_per_day_cents: 40000,
    payment_mode: 'hold',
    min_advance_booking_days: 90,
    atlas2_units_required: 0,
    tablet_required: false,
    capacity: 1,
  },
]

describe('PackagesUI', () => {
  it('renders Step 1 with all package cards', () => {
    render(<PackagesUI products={mockProducts} />)
    expect(screen.getByText('Race Committee Package')).toBeInTheDocument()
    expect(screen.getByText('RaceSense Management Services')).toBeInTheDocument()
    expect(screen.getByText('$105', { exact: false })).toBeInTheDocument()
  })

  it('shows hold disclosure on RaceSense card', () => {
    render(<PackagesUI products={mockProducts} />)
    expect(screen.getByText(/payment hold/i)).toBeInTheDocument()
    expect(screen.getByText(/90.day advance/i)).toBeInTheDocument()
  })

  it('advances to Step 2 when a package is selected', () => {
    render(<PackagesUI products={mockProducts} />)
    fireEvent.click(screen.getByText('Race Committee Package').closest('button') ?? screen.getByText('Race Committee Package'))
    expect(screen.getByText(/select dates/i)).toBeInTheDocument()
  })

  it('shows empty state when no products', () => {
    render(<PackagesUI products={[]} />)
    expect(screen.getByText(/no packages available/i)).toBeInTheDocument()
  })

  it('shows hold disclosure on RaceSense card before selecting', () => {
    render(<PackagesUI products={mockProducts} />)
    // Verify hold info visible on card (Step 1) before user clicks through
    expect(screen.getAllByText(/payment hold/i).length).toBeGreaterThan(0)
  })
})

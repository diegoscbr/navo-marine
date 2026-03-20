import { render, screen } from '@testing-library/react'
import { PackageCards } from '@/app/packages/PackageCards'
import type { PackageProduct } from '@/lib/db/packages'

const makeProduct = (slug: string): PackageProduct => ({
  id: slug,
  slug,
  name: slug,
  category: 'race-management',
  price_per_day_cents: 10500,
  payment_mode: 'payment',
  min_advance_booking_days: null,
  atlas2_units_required: 0,
  tablet_required: false,
  capacity: 10,
})

describe('PackageCards', () => {
  it('renders an image with correct alt for race-committee-package', () => {
    render(
      <PackageCards
        products={[makeProduct('race-committee-package')]}
        onSelect={() => {}}
      />
    )
    const img = screen.getByRole('img', { name: 'race-committee-package' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'race-committee-package')
  })

  it('renders an image with correct alt for rc-wl-course-package', () => {
    render(
      <PackageCards
        products={[makeProduct('rc-wl-course-package')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole('img', { name: 'rc-wl-course-package' })).toBeInTheDocument()
  })

  it('renders an image with correct alt for racesense-management-services', () => {
    render(
      <PackageCards
        products={[makeProduct('racesense-management-services')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole('img', { name: 'racesense-management-services' })).toBeInTheDocument()
  })

  it('does not render an img element for an unknown slug', () => {
    render(
      <PackageCards
        products={[makeProduct('unknown-slug')]}
        onSelect={() => {}}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('displays the price in dollars per day', () => {
    render(
      <PackageCards
        products={[makeProduct('race-committee-package')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('$105')).toBeInTheDocument()
  })
})

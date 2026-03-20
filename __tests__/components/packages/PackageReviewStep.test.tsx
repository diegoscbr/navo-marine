import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PackageReviewStep } from '@/app/packages/PackageReviewStep'
import type { PackageProduct } from '@/lib/db/packages'

const captureProduct: PackageProduct = {
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
}

const holdProduct: PackageProduct = {
  ...captureProduct,
  name: 'RaceSense Management Services',
  slug: 'racesense-management-services',
  price_per_day_cents: 40000,
  payment_mode: 'hold',
}

describe('PackageReviewStep', () => {
  it('shows pricing breakdown', () => {
    render(
      <PackageReviewStep
        product={captureProduct}
        startDate="2027-06-01"
        endDate="2027-06-05"
        onBack={() => {}}
      />,
    )
    expect(screen.getByText(/5 days/)).toBeInTheDocument()
    expect(screen.getByText(/\$525/)).toBeInTheDocument() // 5 × $105
  })

  it('shows "Reserve & Pay" CTA for capture products', () => {
    render(
      <PackageReviewStep product={captureProduct} startDate="2027-06-01" endDate="2027-06-05" onBack={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /reserve & pay/i })).toBeInTheDocument()
  })

  it('shows "Reserve & Hold" CTA for hold products', () => {
    render(
      <PackageReviewStep product={holdProduct} startDate="2027-09-01" endDate="2027-09-05" onBack={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /reserve & hold/i })).toBeInTheDocument()
  })

  it('shows hold disclosure for hold products', () => {
    render(
      <PackageReviewStep product={holdProduct} startDate="2027-09-01" endDate="2027-09-05" onBack={() => {}} />,
    )
    expect(screen.getByText(/authorization hold/i)).toBeInTheDocument()
  })

  it('shows error message on failed checkout', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Package unavailable' }),
    })

    render(
      <PackageReviewStep product={captureProduct} startDate="2027-06-01" endDate="2027-06-05" onBack={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /reserve & pay/i }))

    await waitFor(() => {
      expect(screen.getByText('Package unavailable')).toBeInTheDocument()
    })
  })
})

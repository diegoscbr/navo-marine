import { render, screen } from '@testing-library/react'

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

jest.mock('@/app/admin/reservations/AssignUnitDropdown', () => ({
  AssignUnitDropdown: () => <div data-testid="assign-unit-dropdown" />,
}))

jest.mock('@/app/admin/reservations/PackageUnitAssignment', () => ({
  PackageUnitAssignment: () => <div data-testid="package-unit-assignment" />,
}))

jest.mock('@/app/admin/reservations/DeleteReservationButton', () => ({
  DeleteReservationButton: () => <button type="button">Delete</button>,
}))

jest.mock('@/app/admin/reservations/SendInvoiceButton', () => ({
  SendInvoiceButton: ({ productName }: { productName: string }) => (
    <div data-testid="send-invoice-name">{productName}</div>
  ),
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [] }),
    ...overrides,
  }

  for (const key of ['select', 'order', 'is']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }

  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/admin/reservations page', () => {
  it('renders rental event attribution and falls back to event dates when reservation dates are null', async () => {
    const reservations = [
      {
        id: 'res-1',
        customer_email: 'sailor@test.com',
        status: 'reserved_paid',
        reservation_type: 'rental_event',
        start_date: null,
        end_date: null,
        total_cents: 0,
        created_at: '2026-04-10T12:00:00Z',
        expires_at: null,
        unit_id: null,
        rental_events: {
          name: 'Rolex Miami OCR',
          location: 'Miami',
          start_date: '2026-04-10',
          end_date: '2026-04-12',
        },
        products: {
          name: 'Vakaros Atlas 2',
          tablet_required: false,
          atlas2_units_required: 1,
        },
      },
    ]

    const reservationsChain = makeChain({
      limit: jest.fn().mockResolvedValue({ data: reservations, error: null }),
    })
    const unitsChain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    const reservationUnitsChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: [] }),
    })

    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'reservations') return reservationsChain
      if (table === 'units') return unitsChain
      if (table === 'reservation_units') return reservationUnitsChain
      return makeChain()
    })

    const ReservationsPage = (await import('@/app/admin/reservations/page')).default
    const jsx = await ReservationsPage()
    render(jsx as React.ReactElement)

    expect(screen.getByText('Vakaros Atlas 2')).toBeInTheDocument()
    expect(screen.getByText('Rolex Miami OCR')).toBeInTheDocument()
    expect(screen.getByText('Miami')).toBeInTheDocument()
    expect(screen.getByText('2026-04-10 → 2026-04-12')).toBeInTheDocument()
    expect(screen.getByText('REGISTERED')).toBeInTheDocument()
  })

  it('passes event-aware product names to the invoice button for unpaid rental events', async () => {
    const reservations = [
      {
        id: 'res-2',
        customer_email: 'sailor@test.com',
        status: 'reserved_unpaid',
        reservation_type: 'rental_event',
        start_date: null,
        end_date: null,
        total_cents: 17500,
        created_at: '2026-04-10T12:00:00Z',
        expires_at: '2026-04-11T12:00:00Z',
        unit_id: null,
        rental_events: {
          name: 'Rolex Miami OCR',
          location: 'Miami',
          start_date: '2026-04-10',
          end_date: '2026-04-12',
        },
        products: {
          name: 'Vakaros Atlas 2',
          tablet_required: false,
          atlas2_units_required: 1,
        },
      },
    ]

    const reservationsChain = makeChain({
      limit: jest.fn().mockResolvedValue({ data: reservations, error: null }),
    })
    const unitsChain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    const reservationUnitsChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: [] }),
    })

    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'reservations') return reservationsChain
      if (table === 'units') return unitsChain
      if (table === 'reservation_units') return reservationUnitsChain
      return makeChain()
    })

    const ReservationsPage = (await import('@/app/admin/reservations/page')).default
    const jsx = await ReservationsPage()
    render(jsx as React.ReactElement)

    expect(screen.getByTestId('send-invoice-name')).toHaveTextContent(
      'Vakaros Atlas 2 — Rolex Miami OCR',
    )
  })

  it('renders customer_name above the email, and an Unknown fallback when it is null', async () => {
    const reservations = [
      {
        id: 'res-3',
        customer_email: 'named@test.com',
        customer_name: 'Sarah Whitfield',
        status: 'reserved_paid',
        reservation_type: 'rental_event',
        start_date: null,
        end_date: null,
        total_cents: 20000,
        created_at: '2026-04-10T12:00:00Z',
        expires_at: null,
        unit_id: null,
        rental_events: null,
        products: { name: 'Vakaros Atlas 2', tablet_required: false, atlas2_units_required: 1 },
      },
      {
        id: 'res-4',
        customer_email: 'unnamed@test.com',
        customer_name: null,
        status: 'reserved_unpaid',
        reservation_type: 'rental_event',
        start_date: null,
        end_date: null,
        total_cents: 20000,
        created_at: '2026-04-10T12:00:00Z',
        expires_at: '2026-04-11T12:00:00Z',
        unit_id: null,
        rental_events: null,
        products: { name: 'Vakaros Atlas 2', tablet_required: false, atlas2_units_required: 1 },
      },
    ]

    const reservationsChain = makeChain({
      limit: jest.fn().mockResolvedValue({ data: reservations, error: null }),
    })
    const unitsChain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    const reservationUnitsChain = makeChain({
      in: jest.fn().mockResolvedValue({ data: [] }),
    })

    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === 'reservations') return reservationsChain
      if (table === 'units') return unitsChain
      if (table === 'reservation_units') return reservationUnitsChain
      return makeChain()
    })

    const ReservationsPage = (await import('@/app/admin/reservations/page')).default
    const jsx = await ReservationsPage()
    render(jsx as React.ReactElement)

    expect(screen.getByText('Sarah Whitfield')).toBeInTheDocument()
    expect(screen.getByText('named@test.com')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('unnamed@test.com')).toBeInTheDocument()
  })
})

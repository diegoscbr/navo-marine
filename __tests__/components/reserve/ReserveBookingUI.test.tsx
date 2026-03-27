import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { ReserveBookingUI } from '@/app/reserve/ReserveBookingUI'
import type { RentalEvent } from '@/lib/db/events'

const mockUseSession = useSession as jest.Mock

const mockEvents: RentalEvent[] = [
  {
    id: 'evt-1',
    name: 'Regatta Cup 2026',
    location: 'Newport, RI',
    event_url: null,
    start_date: '2026-06-10',
    end_date: '2026-06-12',
    rental_event_products: [
      {
        product_id: 'prod-1',
        rental_price_cents: 10500,
        rental_price_per_day_cents: 3500,
        late_fee_cents: 1500,
        reserve_cutoff_days: 14,
        capacity: 10,
        inventory_status: 'available',
      },
    ],
  },
]

describe('ReserveBookingUI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com', name: 'Test User' } },
      status: 'authenticated',
    })
  })

  it('renders the event selector combobox', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders sail number input', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    expect(screen.getByPlaceholderText(/sail/i)).toBeInTheDocument()
  })

  it('renders the reserve button', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    expect(screen.getByRole('button', { name: /reserve/i })).toBeInTheDocument()
  })

  it('shows per-day pricing instead of flat fee', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    // Select an event to trigger pricing display
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
    expect(screen.getByText(/\$35\/day/i)).toBeInTheDocument()
  })

  it('shows extra days stepper defaulting to 0', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
    const stepper = screen.getByLabelText(/additional days/i)
    expect(stepper).toHaveValue(0)
  })

  it('updates total dynamically when extra days change', () => {
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
    const stepper = screen.getByLabelText(/additional days/i)
    fireEvent.change(stepper, { target: { value: '2' } })
    // 3 event days + 2 extra = 5 days × $35 = $175
    expect(screen.getByText(/\$175/)).toBeInTheDocument()
  })

  it('sends extra_days in checkout payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: 'https://stripe.com' }) })
    global.fetch = fetchMock
    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
    fireEvent.change(screen.getByLabelText(/additional days/i), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText(/sail/i), { target: { value: 'USA-1' } })
    fireEvent.click(screen.getByRole('button', { name: /reserve/i }))
    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.extra_days).toBe(2)
    })
  })

  it('posts the selected event allocation product_id when defaultProductId is stale', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: 'https://stripe.com' }) })
    global.fetch = fetchMock

    render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="stale-product-id" />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
    fireEvent.change(screen.getByPlaceholderText(/sail/i), { target: { value: 'USA-1' } })
    fireEvent.click(screen.getByRole('button', { name: /reserve/i }))

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.product_id).toBe('prod-1')
    })
  })
})

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SendInvoiceButton } from '@/app/admin/reservations/SendInvoiceButton'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

const defaultProps = {
  reservationId: 'r1',
  customerEmail: 'customer@test.com',
  totalCents: 17500,
  productName: 'Atlas 2 Rental',
}

describe('SendInvoiceButton', () => {
  it('renders an icon button with send invoice label', () => {
    render(<SendInvoiceButton {...defaultProps} />)
    expect(screen.getByRole('button', { name: /send invoice/i })).toBeInTheDocument()
  })

  it('shows confirmation dialog on click with email and amount', () => {
    render(<SendInvoiceButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /send invoice/i }))
    expect(screen.getByText(/send payment invoice/i)).toBeInTheDocument()
    expect(screen.getByText('customer@test.com')).toBeInTheDocument()
    expect(screen.getByText('$175.00')).toBeInTheDocument()
    expect(screen.getByText('Atlas 2 Rental')).toBeInTheDocument()
  })

  it('calls POST API and refreshes on confirm', async () => {
    jest.useFakeTimers()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    render(<SendInvoiceButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /send invoice/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm send invoice/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/reservations/r1/send-invoice',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    // Advance past the 1500ms setTimeout for refresh
    jest.advanceTimersByTime(2000)

    expect(mockRefresh).toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('closes dialog on cancel', () => {
    render(<SendInvoiceButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /send invoice/i }))
    expect(screen.getByText(/send payment invoice/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/send payment invoice/i)).not.toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invoice can only be sent for unpaid reservations' }),
    })

    render(<SendInvoiceButton {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /send invoice/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm send invoice/i }))

    await waitFor(() => {
      expect(screen.getByText(/invoice can only be sent/i)).toBeInTheDocument()
    })
  })
})

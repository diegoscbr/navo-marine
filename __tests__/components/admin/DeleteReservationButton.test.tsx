import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteReservationButton } from '@/app/admin/reservations/DeleteReservationButton'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

describe('DeleteReservationButton', () => {
  it('renders trash icon button', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('shows confirmation dialog on click', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByText(/rental_event/i)).toBeInTheDocument()
  })

  it('calls DELETE API and refreshes on confirm', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/reservations/r1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('closes dialog on cancel', () => {
    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Cannot delete active reservation' }),
    })

    render(
      <DeleteReservationButton
        reservationId="r1"
        customerEmail="test@example.com"
        reservationType="rental_event"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByText(/cannot delete/i)).toBeInTheDocument()
    })
  })
})

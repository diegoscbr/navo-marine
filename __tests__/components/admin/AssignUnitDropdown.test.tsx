import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssignUnitDropdown } from '@/app/admin/reservations/AssignUnitDropdown'

const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const units = [
  { id: 'u1', navo_number: 'NAVO-001', status: 'available' },
  { id: 'u2', navo_number: 'NAVO-002', status: 'available' },
]

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

it('renders unit options with navo_number labels', () => {
  render(
    <AssignUnitDropdown reservationId="res-1" currentUnitId={null} units={units} />,
  )
  expect(screen.getByRole('combobox')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'NAVO-001' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'NAVO-002' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: '— unassigned —' })).toBeInTheDocument()
})

it('calls PATCH with selected unit_id and refreshes on success', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

  render(
    <AssignUnitDropdown reservationId="res-1" currentUnitId={null} units={units} />,
  )

  await user.selectOptions(screen.getByRole('combobox'), 'u1')

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/reservations/res-1/assign',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ unit_id: 'u1' }),
      }),
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

it('shows an error message when the API call fails', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

  render(
    <AssignUnitDropdown reservationId="res-1" currentUnitId={null} units={units} />,
  )

  await user.selectOptions(screen.getByRole('combobox'), 'u1')

  await waitFor(() => {
    expect(screen.getByText(/failed to assign unit/i)).toBeInTheDocument()
  })
})

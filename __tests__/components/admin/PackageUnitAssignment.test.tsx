import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackageUnitAssignment } from '@/app/admin/reservations/PackageUnitAssignment'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const tabletUnits = [{ id: 't1', navo_number: 'NAVO-T01', unit_type: 'tablet' }]
const atlas2Units = [
  { id: 'a1', navo_number: 'NAVO-001', unit_type: 'atlas2' },
  { id: 'a2', navo_number: 'NAVO-002', unit_type: 'atlas2' },
]

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

it('renders tablet and atlas2 dropdowns', () => {
  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={atlas2Units}
      atlas2Count={2}
      currentAssignments={[]}
    />,
  )
  expect(screen.getByText(/tablet/i)).toBeInTheDocument()
  expect(screen.getAllByText(/atlas 2/i).length).toBeGreaterThanOrEqual(1)
  expect(screen.getByRole('option', { name: 'NAVO-T01' })).toBeInTheDocument()
  expect(screen.getAllByRole('option', { name: 'NAVO-001' }).length).toBeGreaterThan(0)
})

it('renders N atlas2 dropdowns matching atlas2Count', () => {
  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={[]}
      atlas2Units={atlas2Units}
      atlas2Count={3}
      currentAssignments={[]}
    />,
  )
  // 3 atlas2 dropdowns (each has a combobox role)
  const selects = screen.getAllByRole('combobox')
  expect(selects).toHaveLength(3)
})

it('calls POST assign-units and refreshes on selection', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={atlas2Units}
      atlas2Count={1}
      currentAssignments={[]}
    />,
  )

  const selects = screen.getAllByRole('combobox')
  await user.selectOptions(selects[0], 't1')

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/reservations/res-1/assign-units',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      assignments: [
        { unit_type: 'tablet', unit_id: 't1' },
        { unit_type: 'atlas2', unit_id: null },
      ],
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

it('filters sibling-selected atlas2 units out of other atlas2 dropdowns', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={[]}
      atlas2Units={atlas2Units}
      atlas2Count={2}
      currentAssignments={[]}
    />,
  )

  const selects = screen.getAllByRole('combobox')
  await user.selectOptions(selects[0], 'a1')

  await waitFor(() => {
    expect(within(selects[1]).queryByText('NAVO-001')).not.toBeInTheDocument()
  })
})

it('shows error message on API failure', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'fail' }) })

  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={[]}
      atlas2Count={0}
      currentAssignments={[]}
    />,
  )

  await user.selectOptions(screen.getByRole('combobox'), 't1')
  await waitFor(() => {
    expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
  })
})

import { availableUnitsForReservation, type UnitRow, type ReservationRow, type ReservationUnitRow } from '@/lib/admin/unit-availability'

const units: UnitRow[] = [
  { id: 'u1', navo_number: 'NAVO-001', status: 'available' },
  { id: 'u2', navo_number: 'NAVO-002', status: 'available' },
  { id: 'u3', navo_number: 'NAVO-003', status: 'available' },
]

it('excludes units assigned to other active reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'reserved_paid' },
    { id: 'res-2', unit_id: 'u2', status: 'reserved_unpaid' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-3', null)
  expect(result.map((u) => u.id)).toEqual(['u3'])
})

it('always includes the current unit for this reservation even if it appears active', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'reserved_paid' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-1', 'u1')
  expect(result.map((u) => u.id)).toContain('u1')
})

it('includes all units when none are assigned to active reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: null, status: 'reserved_unpaid' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null)
  expect(result).toHaveLength(3)
})

it('does not exclude units assigned to cancelled reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: 'u1', status: 'cancelled' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null)
  expect(result).toHaveLength(3)
})

it('excludes units assigned to other active reservations via reservation_units', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: null, status: 'reserved_paid' },
  ]
  const reservationUnits: ReservationUnitRow[] = [
    { reservation_id: 'res-1', unit_id: 'u1' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null, reservationUnits)
  expect(result.map((u) => u.id)).not.toContain('u1')
  expect(result).toHaveLength(2)
})

it('does not exclude reservation_units from cancelled reservations', () => {
  const reservations: ReservationRow[] = [
    { id: 'res-1', unit_id: null, status: 'cancelled' },
  ]
  const reservationUnits: ReservationUnitRow[] = [
    { reservation_id: 'res-1', unit_id: 'u1' },
  ]
  const result = availableUnitsForReservation(units, reservations, 'res-2', null, reservationUnits)
  expect(result).toHaveLength(3)
})

export type UnitRow = { id: string; navo_number: string; status: string }
export type ReservationRow = { id: string; unit_id: string | null; status: string }
export type ReservationUnitRow = { reservation_id: string; unit_id: string | null }

export const ACTIVE_STATUSES = ['reserved_unpaid', 'reserved_authorized', 'reserved_paid']

/**
 * Returns the units available to assign to a specific reservation.
 *
 * Rules:
 * - Excludes units already assigned to OTHER active reservations (via reservations.unit_id)
 * - Excludes units assigned to OTHER active reservations via reservation_units (packages)
 * - Always includes the unit currently assigned to THIS reservation (so it stays selectable)
 * - Includes all units when no other reservations are active
 *
 *   allUnits ──► filter(not busy OR is current unit) ──► available[]
 *                   │
 *                   busyUnitIds = unit_ids on OTHER active reservations
 *                               + unit_ids from reservation_units on OTHER active reservations
 */
export function availableUnitsForReservation(
  allUnits: UnitRow[],
  allReservations: ReservationRow[],
  reservationId: string,
  currentUnitId: string | null,
  reservationUnits: ReservationUnitRow[] = [],
): UnitRow[] {
  const activeReservationIds = new Set(
    allReservations
      .filter((r) => r.id !== reservationId && ACTIVE_STATUSES.includes(r.status))
      .map((r) => r.id),
  )

  const busyUnitIds = new Set<string>()

  // Units assigned via reservations.unit_id on other active reservations
  for (const r of allReservations) {
    if (r.id !== reservationId && r.unit_id && ACTIVE_STATUSES.includes(r.status)) {
      busyUnitIds.add(r.unit_id)
    }
  }

  // Units assigned via reservation_units on other active reservations
  for (const ru of reservationUnits) {
    if (ru.unit_id && activeReservationIds.has(ru.reservation_id)) {
      busyUnitIds.add(ru.unit_id)
    }
  }

  return allUnits.filter((u) => !busyUnitIds.has(u.id) || u.id === currentUnitId)
}

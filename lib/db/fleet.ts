import { supabaseAdmin } from '@/lib/db/client'

/** Unit statuses that mean the device is gone or unserviceable, so not rentable. */
export const NON_SERVICEABLE_UNIT_STATUSES = ['damaged', 'lost', 'sold'] as const

export type FleetAvailability = {
  available: boolean
  capacity: number
  reserved: number
  remaining: number
}

type FleetAvailabilityRow = {
  capacity: number
  reserved: number
  remaining: number
}

/**
 * Fleet-derived availability for a product over a date range.
 *
 * Capacity is the number of serviceable, non-retired rows in `units` — the exact
 * number the Add Unit and retire controls change. Reserved is every hold that
 * overlaps the range, counted across rental events, date windows and multi-unit
 * packages alike, so two overlapping events can never sell the same device twice.
 *
 * Deliberately ignores `rental_event_products.capacity` and
 * `date_window_allocations.capacity`; those columns are display-only now.
 */
export async function getFleetAvailability(
  productId: string,
  startDate: string,
  endDate: string,
): Promise<FleetAvailability> {
  const { data, error } = await supabaseAdmin.rpc('fleet_availability', {
    p_product_id: productId,
    p_start: startDate,
    p_end: endDate,
  })

  if (error) throw new Error(`getFleetAvailability: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as FleetAvailabilityRow | null | undefined

  if (!row) {
    throw new Error(
      `getFleetAvailability: no rows returned for product ${productId} (${startDate}..${endDate})`,
    )
  }

  return {
    available: row.reserved < row.capacity,
    capacity: row.capacity,
    reserved: row.reserved,
    remaining: row.remaining,
  }
}

/**
 * Count serviceable, non-retired units for a product.
 *
 * Date-independent, so it answers "how big is the fleet" rather than "how much is
 * free". Used to stamp the display-only capacity column when an event is created.
 */
export async function getFleetSize(productId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .is('retired_at', null)
    .not('status', 'in', `(${NON_SERVICEABLE_UNIT_STATUSES.join(',')})`)

  if (error) throw new Error(`getFleetSize: ${error.message}`)

  return count ?? 0
}

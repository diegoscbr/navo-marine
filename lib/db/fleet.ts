import { supabaseAdmin } from '@/lib/db/client'

/** Unit statuses that mean the device is gone or unserviceable, so not rentable. */
export const NON_SERVICEABLE_UNIT_STATUSES = ['damaged', 'lost', 'sold'] as const

/** Bookings at or above this share of the fleet are flagged to admins. */
export const NEAR_CAPACITY_PCT = 80

export type FleetAvailability = {
  /** False only when every serviceable unit is already assigned. */
  available: boolean
  /** Serviceable, non-retired units for this product. */
  capacity: number
  /** Physical units committed to overlapping reservations. The only gate. */
  assigned: number
  /** Overlapping holds, units-equivalent. Informational only. */
  booked: number
  /** capacity - assigned. Headroom in hardware terms. */
  remaining: number
  /** booked as a percentage of capacity, 0 when the fleet is empty. */
  subscriptionPct: number
  /** booked has reached NEAR_CAPACITY_PCT of the fleet. */
  nearCapacity: boolean
  /** booked exceeds the fleet outright. */
  oversubscribed: boolean
}

type FleetAvailabilityRow = {
  capacity: number
  assigned: number
  booked: number
  remaining: number
}

/**
 * Fleet availability for a product over a date range.
 *
 * Two numbers, two jobs. `assigned` counts the physical units actually committed
 * to overlapping reservations, and it is the only thing that can fail a checkout —
 * a booking nobody has allocated hardware to blocks nobody. `booked` counts
 * overlapping holds and exists purely to warn admins when bookings run ahead of
 * the fleet; it gates nothing.
 *
 * That split is deliberate: the business takes more bookings than units on
 * purpose, then allocates devices before the event.
 *
 * Deliberately ignores `rental_event_products.capacity` and
 * `date_window_allocations.capacity`; those columns are display-only.
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

  const subscriptionPct =
    row.capacity > 0 ? Math.round((row.booked / row.capacity) * 100) : 0

  return {
    // Gate on hardware, never on hold count.
    available: row.remaining > 0,
    capacity: row.capacity,
    assigned: row.assigned,
    booked: row.booked,
    remaining: row.remaining,
    subscriptionPct,
    nearCapacity: subscriptionPct >= NEAR_CAPACITY_PCT && subscriptionPct <= 100,
    oversubscribed: row.booked > row.capacity,
  }
}

export type EventSubscription = FleetAvailability & {
  eventId: string
  eventName: string
  startDate: string
  endDate: string
  productId: string
  productName: string
}

type EventAllocationRow = {
  event_id: string
  product_id: string
  rental_events: { name: string; start_date: string; end_date: string } | null
  products: { name: string } | null
}

/**
 * Subscription level per active event and product, for the admin warning strip.
 *
 * Purely advisory. Nothing here gates a checkout — it exists so the owner can see
 * bookings running ahead of the fleet and either allocate units or buy more.
 */
export async function getEventSubscriptions(): Promise<EventSubscription[]> {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabaseAdmin
    .from('rental_event_products')
    .select('event_id, product_id, rental_events!inner(name, start_date, end_date), products!inner(name)')
    .gte('rental_events.end_date', today)

  if (error) throw new Error(`getEventSubscriptions: ${error.message}`)

  const rows = (data ?? []) as unknown as EventAllocationRow[]

  const results = await Promise.all(
    rows
      .filter(row => row.rental_events != null)
      .map(async row => {
        const event = row.rental_events!
        const availability = await getFleetAvailability(
          row.product_id,
          event.start_date,
          event.end_date,
        )
        return {
          ...availability,
          eventId: row.event_id,
          eventName: event.name,
          startDate: event.start_date,
          endDate: event.end_date,
          productId: row.product_id,
          productName: row.products?.name ?? 'Unknown product',
        }
      }),
  )

  // Empty fleets carry no signal — a product with no units cannot be oversubscribed
  // in any meaningful sense, and would otherwise show as a permanent warning.
  return results
    .filter(r => r.capacity > 0)
    .sort((a, b) => b.subscriptionPct - a.subscriptionPct)
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

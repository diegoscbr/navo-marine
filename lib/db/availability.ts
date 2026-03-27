import { supabaseAdmin } from '@/lib/db/client'

export type AvailabilityResult = {
  available: boolean
  reserved: number
  capacity: number
  remaining: number
}

/**
 * Count reservations for a given event + product where status is
 * 'reserved_unpaid' or 'reserved_paid', then compare against capacity.
 */
export async function checkEventAvailability(
  eventId: string,
  productId: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_paid'])

  if (error) throw new Error(`checkEventAvailability: ${error.message}`)

  const reserved = count ?? 0
  const remaining = Math.max(0, capacity - reserved)
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining,
  }
}

/**
 * Count reservations for a given date window + product where status is
 * 'reserved_unpaid' or 'reserved_paid', then compare against capacity.
 */
export async function checkWindowAvailability(
  windowId: string,
  productId: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('date_window_id', windowId)
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_paid'])

  if (error) throw new Error(`checkWindowAvailability: ${error.message}`)

  const reserved = count ?? 0
  const remaining = Math.max(0, capacity - reserved)
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining,
  }
}

import { supabaseAdmin } from '@/lib/db/client'

// ── Types ──────────────────────────────────────────────────────────────────

export type RentalEventProduct = {
  product_id: string
  rental_price_cents: number
  late_fee_cents: number
  reserve_cutoff_days: number
  capacity: number
  inventory_status: string
}

export type RentalEvent = {
  id: string
  name: string
  location: string | null
  event_url: string | null
  start_date: string
  end_date: string
  rental_event_products: RentalEventProduct[]
}

export type DateWindowAllocation = {
  product_id: string
  capacity: number
  inventory_status: string
}

export type DateWindow = {
  id: string
  label: string | null
  start_date: string
  end_date: string
  date_window_allocations: DateWindowAllocation[]
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function listActiveRentalEvents(): Promise<RentalEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .select(`
      id, name, location, event_url, start_date, end_date,
      rental_event_products (
        product_id, rental_price_cents, late_fee_cents,
        reserve_cutoff_days, capacity, inventory_status
      )
    `)
    .eq('active', true)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date')

  if (error) throw new Error(`listActiveRentalEvents: ${error.message}`)
  return data as unknown as RentalEvent[]
}

export async function listActiveDateWindows(): Promise<DateWindow[]> {
  const { data, error } = await supabaseAdmin
    .from('date_windows')
    .select(`
      id, label, start_date, end_date,
      date_window_allocations (
        product_id, capacity, inventory_status
      )
    `)
    .eq('active', true)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date')

  if (error) throw new Error(`listActiveDateWindows: ${error.message}`)
  return data as unknown as DateWindow[]
}

export async function getEventProduct(
  eventId: string,
  productId: string,
): Promise<RentalEventProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('rental_event_products')
    .select('*')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getEventProduct: ${error.message}`)
  }
  return data as unknown as RentalEventProduct
}

export async function getDateWindowProduct(
  windowId: string,
  productId: string,
): Promise<DateWindowAllocation | null> {
  const { data, error } = await supabaseAdmin
    .from('date_window_allocations')
    .select('*')
    .eq('date_window_id', windowId)
    .eq('product_id', productId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getDateWindowProduct: ${error.message}`)
  }
  return data as unknown as DateWindowAllocation
}

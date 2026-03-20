import { supabaseAdmin } from '@/lib/db/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AvailabilityResult = {
  available: boolean
  reserved: number
  capacity: number
  remaining: number
}

export type PackageProduct = {
  id: string
  name: string
  slug: string
  category: string
  price_per_day_cents: number
  payment_mode: string
  min_advance_booking_days: number | null
  atlas2_units_required: number
  tablet_required: boolean
  capacity: number
}

const PACKAGE_PRODUCT_COLUMNS =
  'id, name, slug, category, price_per_day_cents, payment_mode, min_advance_booking_days, atlas2_units_required, tablet_required, capacity'

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Count reservations for a given product that overlap the requested date range,
 * then compare against capacity.
 *
 * Overlap condition: existing.start_date <= endDate AND existing.end_date >= startDate
 */
export async function checkPackageAvailability(
  productId: string,
  startDate: string,
  endDate: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_authorized', 'reserved_paid'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (error) throw new Error(`checkPackageAvailability: ${error.message}`)

  const reserved = count ?? 0
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining: Math.max(0, capacity - reserved),
  }
}

/**
 * Check that enough physical Atlas 2 and tablet units exist for a multi-unit
 * regatta package over the requested date range.
 *
 * Makes 4 count queries, each terminating with `.gte()`:
 *   1. Total available Atlas 2 units in the fleet
 *   2. Total available tablet units in the fleet
 *   3. Atlas 2 units already allocated for the date range
 *   4. Tablet units already allocated for the date range (only if tabletRequired)
 */
export async function checkMultiUnitAvailability(
  _productId: string,
  startDate: string,
  endDate: string,
  atlas2Required: number,
  tabletRequired: boolean,
): Promise<{ available: boolean; reason?: string }> {
  // 1. Total Atlas 2 units in fleet (gte on created_at as always-true sentinel)
  const { count: atlas2Total, error: a2Err } = await supabaseAdmin
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', 'atlas2')
    .eq('status', 'available')
    .gte('created_at', '1970-01-01T00:00:00Z')

  if (a2Err) throw new Error(`checkMultiUnitAvailability: ${a2Err.message}`)

  // 2. Total tablet units in fleet
  const { count: tabletTotal, error: tabErr } = await supabaseAdmin
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', 'tablet')
    .eq('status', 'available')
    .gte('created_at', '1970-01-01T00:00:00Z')

  if (tabErr) throw new Error(`checkMultiUnitAvailability: ${tabErr.message}`)

  // 3. Atlas 2 units already allocated for overlapping date range
  // NOTE: This query does not filter by reservation status. To prevent cancelled reservations
  // from blocking availability, reservation_units rows must be deleted when a reservation
  // is cancelled. Tracked in TODOS.md Phase 5 cleanup.
  const { count: atlas2Allocated, error: allocErr } = await supabaseAdmin
    .from('reservation_units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', 'atlas2')
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (allocErr) throw new Error(`checkMultiUnitAvailability: ${allocErr.message}`)

  const atlas2Available = (atlas2Total ?? 0) - (atlas2Allocated ?? 0)

  if (atlas2Available < atlas2Required) {
    return {
      available: false,
      reason: `Not enough Atlas 2 units (need ${atlas2Required}, ${atlas2Available} available)`,
    }
  }

  // 4. Tablet units already allocated for overlapping date range (only if needed)
  // NOTE: Same cancellation gap as query 3 above — reservation_units rows must be
  // deleted on cancellation to avoid false unavailability.
  let tabletAllocated = 0
  if (tabletRequired) {
    const { count: tabAlloc, error: tabAllocErr } = await supabaseAdmin
      .from('reservation_units')
      .select('id', { count: 'exact', head: true })
      .eq('unit_type', 'tablet')
      .lte('start_date', endDate)
      .gte('end_date', startDate)
    if (tabAllocErr) throw new Error(`checkMultiUnitAvailability: ${tabAllocErr.message}`)
    tabletAllocated = tabAlloc ?? 0
  }

  if (tabletRequired) {
    const tabletsAvailable = (tabletTotal ?? 0) - tabletAllocated
    if (tabletsAvailable < 1) {
      return { available: false, reason: 'No tablet units available for selected dates' }
    }
  }

  return { available: true }
}

// ── Unit allocation ───────────────────────────────────────────────────────────

/**
 * Insert reservation_units rows for a confirmed reservation.
 * Looks up the product's atlas2_units_required and tablet_required fields,
 * then writes one row per unit type needed.
 * Errors are logged but not rethrown — unit tracking is non-blocking.
 */
export async function insertReservationUnits(
  reservationId: string,
  productId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { data: product, error: productErr } = await supabaseAdmin
    .from('products')
    .select('atlas2_units_required, tablet_required')
    .eq('id', productId)
    .single()

  if (productErr || !product) {
    console.error('[insertReservationUnits] product fetch failed:', productErr?.message)
    return
  }

  const rows: {
    reservation_id: string
    unit_type: string
    quantity: number
    start_date: string
    end_date: string
  }[] = []

  if (product.atlas2_units_required > 0) {
    rows.push({
      reservation_id: reservationId,
      unit_type: 'atlas2',
      quantity: product.atlas2_units_required,
      start_date: startDate,
      end_date: endDate,
    })
  }

  if (product.tablet_required) {
    rows.push({
      reservation_id: reservationId,
      unit_type: 'tablet',
      quantity: 1,
      start_date: startDate,
      end_date: endDate,
    })
  }

  if (rows.length === 0) return

  const { error } = await supabaseAdmin.from('reservation_units').insert(rows)
  if (error) {
    console.error('[insertReservationUnits] insert failed:', error.message)
  }
}

// ── Product lookups ───────────────────────────────────────────────────────────

/**
 * Fetch a package product by its UUID.
 * Returns null if not found or if category is not 'regatta_management'.
 */
export async function getPackageProductById(id: string): Promise<PackageProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PACKAGE_PRODUCT_COLUMNS)
    .eq('id', id)
    .single()

  if (error || !data) return null
  if (data.category !== 'regatta_management') return null
  if (!data.price_per_day_cents) return null

  return data as PackageProduct
}

/**
 * Fetch a package product by its slug.
 * Returns null if not found (no category guard — slug is already product-specific).
 */
export async function getPackageProduct(slug: string): Promise<PackageProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PACKAGE_PRODUCT_COLUMNS)
    .eq('slug', slug)
    .single()

  if (error || !data) return null

  return data as PackageProduct
}

/**
 * List all active regatta management products.
 */
export async function listPackageProducts(): Promise<PackageProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PACKAGE_PRODUCT_COLUMNS)
    .eq('category', 'regatta_management')
    .eq('active', true)

  if (error) throw new Error(`listPackageProducts: ${error.message}`)

  return (data ?? []).filter(p => p.price_per_day_cents != null) as PackageProduct[]
}

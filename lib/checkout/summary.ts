import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/db/client'
import { getPackageProductById } from '@/lib/db/packages'
import { storefrontProducts } from '@/lib/commerce/products'
import { daysBetween } from '@/lib/utils/dates'
import type { Selection } from './state-codec'

export type LineItem = {
  label: string
  amountCents?: number
}

export type OrderSummary = {
  contextLabel: string
  callbackUrlPathLabel: string
  lineItems: LineItem[]
  totalCents: number
}

type RentalJoinedRow = {
  rental_price_cents: number
  rental_price_per_day_cents: number | null
  products: { name: string } | null
}

type EventJoinedRow = RentalJoinedRow & {
  rental_events: { name: string; start_date: string; end_date: string } | null
}

type WindowJoinedRow = RentalJoinedRow & {
  date_windows: { label: string | null; start_date: string; end_date: string } | null
}

async function loadRentalEventRow(eventId: string, productId: string): Promise<EventJoinedRow | null> {
  const { data } = await supabaseAdmin
    .from('rental_event_products')
    .select(`
      rental_price_cents,
      rental_price_per_day_cents,
      products!inner(name),
      rental_events!inner(name, start_date, end_date)
    `)
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .single()
  return (data as EventJoinedRow | null) ?? null
}

async function loadRentalCustomRow(windowId: string, productId: string): Promise<WindowJoinedRow | null> {
  const { data } = await supabaseAdmin
    .from('date_window_allocations')
    .select(`
      rental_price_cents,
      rental_price_per_day_cents,
      products!inner(name),
      date_windows!inner(label, start_date, end_date)
    `)
    .eq('date_window_id', windowId)
    .eq('product_id', productId)
    .single()
  return (data as WindowJoinedRow | null) ?? null
}

async function buildRentalEventSummary(
  selection: Extract<Selection, { reservation_type: 'rental_event' }>,
): Promise<OrderSummary | null> {
  const row = await loadRentalEventRow(selection.event_id, selection.product_id)
  if (!row || !row.products || !row.rental_events) return null
  const event = row.rental_events
  const days = daysBetween(event.start_date, event.end_date)
  const totalCents = row.rental_price_per_day_cents != null
    ? row.rental_price_per_day_cents * (days + (selection.extra_days ?? 0))
    : row.rental_price_cents
  const lineItems: LineItem[] = [
    { label: row.products.name },
    { label: `${event.name} · ${event.start_date} → ${event.end_date}` },
    { label: `Sail #${selection.sail_number}` },
  ]
  if (selection.extra_days && selection.extra_days > 0) {
    lineItems.push({ label: `+${selection.extra_days} extra day(s)` })
  }
  return {
    contextLabel: 'Reservation',
    callbackUrlPathLabel: 'reservation form',
    lineItems,
    totalCents,
  }
}

async function buildRentalCustomSummary(
  selection: Extract<Selection, { reservation_type: 'rental_custom' }>,
): Promise<OrderSummary | null> {
  const row = await loadRentalCustomRow(selection.date_window_id, selection.product_id)
  if (!row || !row.products || !row.date_windows) return null
  const window = row.date_windows
  const days = daysBetween(window.start_date, window.end_date)
  const totalCents = row.rental_price_per_day_cents != null
    ? row.rental_price_per_day_cents * (days + (selection.extra_days ?? 0))
    : row.rental_price_cents
  const windowLabel = window.label ?? `${window.start_date} → ${window.end_date}`
  const lineItems: LineItem[] = [
    { label: row.products.name },
    { label: windowLabel },
    { label: `Sail #${selection.sail_number}` },
  ]
  if (selection.extra_days && selection.extra_days > 0) {
    lineItems.push({ label: `+${selection.extra_days} extra day(s)` })
  }
  return {
    contextLabel: 'Reservation',
    callbackUrlPathLabel: 'reservation form',
    lineItems,
    totalCents,
  }
}

async function buildRegattaPackageSummary(
  selection: Extract<Selection, { reservation_type: 'regatta_package' }>,
): Promise<OrderSummary | null> {
  const product = await getPackageProductById(selection.product_id)
  if (!product) return null
  const days = daysBetween(selection.start_date, selection.end_date)
  const pricePerDay = product.price_per_day_cents ?? 0
  const totalCents = pricePerDay * days
  return {
    contextLabel: 'Package booking',
    callbackUrlPathLabel: 'package selection',
    lineItems: [
      { label: product.name },
      { label: `${selection.start_date} → ${selection.end_date}` },
      { label: `${days} day(s)` },
    ],
    totalCents,
  }
}

function buildPurchaseSummary(
  selection: Extract<Selection, { reservation_type: 'purchase' }>,
): OrderSummary | null {
  const product = storefrontProducts.find((p) => p.slug === selection.product_id)
  if (!product) return null
  const warranty = product.addOns.find((a) => a.slug === 'vakaros-care-warranty')
  const warrantyPerUnit = selection.warranty_selected && warranty ? warranty.priceCents : 0
  const totalCents = (product.pricing.amountCents + warrantyPerUnit) * selection.quantity
  const lineItems: LineItem[] = [{ label: `${product.name} — Qty ${selection.quantity}` }]
  if (selection.warranty_selected && warranty) {
    lineItems.push({ label: warranty.name })
  }
  return {
    contextLabel: 'Purchase',
    callbackUrlPathLabel: 'product page',
    lineItems,
    totalCents,
  }
}

async function loadOrderSummaryUncached(selection: Selection): Promise<OrderSummary | null> {
  switch (selection.reservation_type) {
    case 'rental_event':
      return buildRentalEventSummary(selection)
    case 'rental_custom':
      return buildRentalCustomSummary(selection)
    case 'regatta_package':
      return buildRegattaPackageSummary(selection)
    case 'purchase':
      return buildPurchaseSummary(selection)
  }
}

// MODULE-SCOPE cache wrapper. Single closure across the lifetime of the
// function instance. Next.js hashes the runtime args into the cache key,
// so calling `cachedLoad(selection)` keys on the selection structure.
// 5-minute TTL — short enough that pricing/event edits propagate quickly,
// long enough to absorb bot scraping bursts.
const cachedLoad = unstable_cache(
  async (selection: Selection) => loadOrderSummaryUncached(selection),
  ['order-summary-v1'],
  { revalidate: 300 },
)

export async function loadOrderSummary(selection: Selection): Promise<OrderSummary | null> {
  return cachedLoad(selection)
}

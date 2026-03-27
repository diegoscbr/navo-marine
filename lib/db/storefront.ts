import { supabaseAdmin } from '@/lib/db/client'
import type { StorefrontProduct } from '@/lib/commerce/types'

const STOREFRONT_SELECT = `
  id, slug, name, subtitle, description_short,
  base_price_cents, currency, tax_included,
  manual_url, rental_enabled, rental_price_cents,
  late_fee_cents, reserve_cutoff_days,
  requires_event_selection, requires_sail_number,
  product_sections (
    section_key, heading, body_markdown, sort_order,
    product_feature_bullets ( bullet_text, sort_order )
  ),
  product_spec_groups (
    group_name, sort_order,
    product_specs ( label, value, sort_order )
  ),
  product_box_items ( item_name, sort_order ),
  product_addons (
    sort_order,
    addons ( id, slug, name, description, price_cents, addon_type )
  )
` as const

type DBProductRow = {
  id: string
  slug: string
  name: string
  subtitle: string | null
  description_short: string | null
  base_price_cents: number
  currency: string
  tax_included: boolean
  manual_url: string | null
  rental_enabled: boolean
  rental_price_cents: number | null
  late_fee_cents: number | null
  reserve_cutoff_days: number | null
  requires_event_selection: boolean
  requires_sail_number: boolean
  product_sections: Array<{
    section_key: string
    heading: string
    body_markdown: string | null
    sort_order: number
    product_feature_bullets: Array<{ bullet_text: string; sort_order: number }>
  }>
  product_spec_groups: Array<{
    group_name: string
    sort_order: number
    product_specs: Array<{ label: string; value: string; sort_order: number }>
  }>
  product_box_items: Array<{ item_name: string; sort_order: number }>
  product_addons: Array<{
    sort_order: number
    addons: {
      id: string
      slug: string
      name: string
      description: string | null
      price_cents: number
      addon_type: string
    }
  }>
}

function toStorefrontProduct(row: DBProductRow): StorefrontProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle ?? undefined,
    descriptionShort: row.description_short ?? '',
    pricing: {
      amountCents: row.base_price_cents,
      currency: row.currency as 'usd',
      taxIncluded: row.tax_included,
    },
    inTheBox: [...row.product_box_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.item_name),
    sections: [...row.product_sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        key: s.section_key,
        heading: s.heading,
        body: s.body_markdown ?? '',
        bullets: [...s.product_feature_bullets]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((bullet) => bullet.bullet_text),
      })),
    techSpecs: [...row.product_spec_groups]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({
        group: g.group_name,
        rows: [...g.product_specs]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ label: s.label, value: s.value })),
      })),
    addOns: [...row.product_addons]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pa) => ({
        id: pa.addons.id,
        slug: pa.addons.slug,
        name: pa.addons.name,
        description: pa.addons.description ?? undefined,
        priceCents: pa.addons.price_cents,
        addonType: pa.addons.addon_type as 'warranty' | 'accessory' | 'service',
      })),
    ...(row.rental_enabled && row.rental_price_cents != null
      ? {
          rentalPolicy: {
            rentalPriceCents: row.rental_price_cents,
            lateFeeCents: row.late_fee_cents ?? 0,
            reserveCutoffDays: row.reserve_cutoff_days ?? 14,
            statuses: ['in_stock', 'inventory_on_the_way', 'out_of_stock'] as const,
            requiresEventSelection: row.requires_event_selection as true,
            requiresSailNumber: row.requires_sail_number as true,
          },
        }
      : {}),
    support: { manualUrl: row.manual_url ?? '' },
  }
}

export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(STOREFRONT_SELECT)
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getStorefrontProductBySlug: ${error.message}`)
  }
  return toStorefrontProduct(data as unknown as DBProductRow)
}

export async function listStorefrontProducts(): Promise<StorefrontProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(STOREFRONT_SELECT)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listStorefrontProducts: ${error.message}`)
  return (data as unknown as DBProductRow[]).map(toStorefrontProduct)
}

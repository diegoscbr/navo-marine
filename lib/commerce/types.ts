export type InventoryStatus = 'in_stock' | 'inventory_on_the_way' | 'out_of_stock'

export type AddonType = 'warranty' | 'accessory' | 'service'

export type StorefrontProduct = {
  id: string
  slug: string
  name: string
  subtitle?: string
  descriptionShort: string
  pricing: {
    amountCents: number
    currency: 'usd'
    taxIncluded: boolean
  }
  inTheBox: string[]
  sections: Array<{
    key: string
    heading: string
    body: string
    bullets: string[]
  }>
  techSpecs: Array<{
    group: string
    rows: Array<{ label: string; value: string }>
  }>
  addOns: Array<{
    id: string
    slug: string
    name: string
    description?: string
    priceCents: number
    addonType: AddonType
  }>
  rentalPolicy?: {
    rentalPriceCents: number
    lateFeeCents: number
    reserveCutoffDays: number
    statuses: InventoryStatus[]
    requiresEventSelection: true
    requiresSailNumber: true
  }
  support: {
    manualUrl: string
  }
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { StorefrontProduct } from '@/lib/commerce/types'

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ProductPurchasePanelProps = {
  product: StorefrontProduct
}

export function ProductPurchasePanel({ product }: ProductPurchasePanelProps) {
  const [quantity, setQuantity] = useState(1)
  const [warrantySelected, setWarrantySelected] = useState(true)

  const warranty = product.addOns.find((addon) => addon.slug === 'vakaros-care-warranty')

  const totals = useMemo(() => {
    const addonCents = warrantySelected && warranty ? warranty.priceCents : 0
    const unitCents = product.pricing.amountCents + addonCents
    const totalCents = unitCents * quantity
    return { addonCents, unitCents, totalCents }
  }, [product.pricing.amountCents, quantity, warranty, warrantySelected])

  const decrement = () => setQuantity((current) => Math.max(1, current - 1))
  const increment = () => setQuantity((current) => Math.min(8, current + 1))

  return (
    <aside className="rounded-3xl border border-black/10 bg-white p-6 text-[#1d1d1f] shadow-[0_20px_45px_rgba(0,0,0,0.12)]">
      <p className="text-xs uppercase tracking-[0.22em] text-black/45">Buy Atlas 2</p>
      <p className="mt-2 text-4xl font-semibold">{formatUSD(product.pricing.amountCents)}</p>
      {product.pricing.taxIncluded && <p className="mt-1 text-sm text-black/55">Tax included.</p>}

      <div className="mt-6 rounded-2xl border border-black/10 bg-[#f5f5f7] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-black/50">Quantity</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={decrement}
            className="h-10 w-10 rounded-full border border-black/20 text-xl leading-none transition-colors hover:border-black/45"
            aria-label="Decrease quantity"
          >
            -
          </button>
          <p className="w-8 text-center text-lg font-semibold">{quantity}</p>
          <button
            type="button"
            onClick={increment}
            className="h-10 w-10 rounded-full border border-black/20 text-xl leading-none transition-colors hover:border-black/45"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      {warranty && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-black/10 bg-[#f5f5f7] p-4 transition-colors hover:border-black/30">
          <input
            type="checkbox"
            checked={warrantySelected}
            onChange={(event) => setWarrantySelected(event.target.checked)}
            className="mt-1 h-4 w-4 accent-marine-500"
          />
          <span>
            <span className="block text-sm font-medium">{warranty.name}</span>
            <span className="block text-sm text-black/55">{formatUSD(warranty.priceCents)}</span>
          </span>
        </label>
      )}

      <div className="mt-5 space-y-2 border-t border-black/10 pt-5 text-sm">
        <div className="flex items-center justify-between text-black/70">
          <span>Unit subtotal</span>
          <span>{formatUSD(totals.unitCents)}</span>
        </div>
        <div className="flex items-center justify-between text-black/70">
          <span>Quantity</span>
          <span>{quantity}</span>
        </div>
        <div className="flex items-center justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formatUSD(totals.totalCents)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled
        className="mt-6 w-full rounded-full bg-[#1d1d1f] px-6 py-3 text-sm font-medium text-white opacity-60"
      >
        Checkout Coming Soon
      </button>
      <Link
        href="/contact"
        className="mt-3 inline-flex w-full justify-center rounded-full border border-black/20 px-6 py-3 text-sm font-medium text-black/85 transition-colors hover:border-black/50 hover:text-black"
      >
        Contact Sales
      </Link>

      <p className="mt-4 text-xs text-black/50">
        Qi charger is not included in the box. You can use any Qi-compatible charging pad, or add one
        at checkout when purchasing is live.
      </p>
      <p className="mt-2 text-xs text-black/50">
        Need a rental instead?{' '}
        <Link className="text-marine-500 underline-offset-4 hover:underline" href="/reserve">
          Reserve Atlas 2
        </Link>
        .
      </p>
    </aside>
  )
}

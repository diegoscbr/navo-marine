'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
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
    <motion.aside
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-xl border border-white/10 bg-navy-800/70 p-6 shadow-[0_20px_45px_rgba(0,0,0,0.3)] backdrop-blur-xl"
    >
      <p className="text-xs uppercase tracking-[0.22em] text-white/40">Buy Atlas 2</p>
      <p className="mt-2 text-4xl font-semibold text-white">{formatUSD(product.pricing.amountCents)}</p>
      {product.pricing.taxIncluded && <p className="mt-1 text-sm text-white/50">Tax included.</p>}

      <div className="mt-6 rounded-lg border border-white/10 bg-navy-700/40 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">Quantity</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={decrement}
            className="h-10 w-10 rounded-full border border-white/20 text-xl leading-none text-white/80 transition-colors hover:border-white/40 hover:text-white"
            aria-label="Decrease quantity"
          >
            -
          </button>
          <p className="w-8 text-center text-lg font-semibold text-white">{quantity}</p>
          <button
            type="button"
            onClick={increment}
            className="h-10 w-10 rounded-full border border-white/20 text-xl leading-none text-white/80 transition-colors hover:border-white/40 hover:text-white"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      {warranty && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-navy-700/40 p-4 transition-colors hover:border-white/20">
          <input
            type="checkbox"
            checked={warrantySelected}
            onChange={(event) => setWarrantySelected(event.target.checked)}
            className="mt-1 h-4 w-4 accent-marine-500"
          />
          <span>
            <span className="block text-sm font-medium text-white">{warranty.name}</span>
            <span className="block text-sm text-white/50">{formatUSD(warranty.priceCents)}</span>
          </span>
        </label>
      )}

      <div className="mt-5 space-y-2 border-t border-white/10 pt-5 text-sm">
        <div className="flex items-center justify-between text-white/60">
          <span>Unit subtotal</span>
          <span>{formatUSD(totals.unitCents)}</span>
        </div>
        <div className="flex items-center justify-between text-white/60">
          <span>Quantity</span>
          <span>{quantity}</span>
        </div>
        <div className="flex items-center justify-between text-base font-semibold text-white">
          <span>Total</span>
          <span>{formatUSD(totals.totalCents)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled
        className="glass-btn glass-btn-primary mt-6 w-full rounded-full px-6 py-3 text-sm font-medium opacity-60"
      >
        Checkout Coming Soon
      </button>
      <Link
        href="/contact"
        className="glass-btn glass-btn-ghost mt-3 inline-flex w-full justify-center rounded-full px-6 py-3 text-sm font-medium"
      >
        Contact Sales
      </Link>

      <p className="mt-4 text-xs text-white/40">
        Qi charger is not included in the box. You can use any Qi-compatible charging pad, or add one
        at checkout when purchasing is live.
      </p>
      <p className="mt-2 text-xs text-white/40">
        Need a rental instead?{' '}
        <Link className="text-marine-400 underline-offset-4 hover:underline" href="/reserve">
          Reserve Atlas 2
        </Link>
        .
      </p>
    </motion.aside>
  )
}

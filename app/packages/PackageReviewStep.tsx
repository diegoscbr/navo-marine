'use client'

import { useState } from 'react'
import type { PackageProduct } from '@/lib/db/packages'
import { daysBetween, formatDateRange } from '@/lib/utils/dates'

type Props = {
  product: PackageProduct
  startDate: string
  endDate: string
  onBack: () => void
}

export function PackageReviewStep({ product, startDate, endDate, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHold = product.payment_mode === 'hold'
  const dayCount = daysBetween(startDate, endDate)
  const totalCents = dayCount * product.price_per_day_cents

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_type: 'regatta_package',
          product_id: product.id,
          start_date: startDate,
          end_date: endDate,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="font-heading text-2xl font-semibold text-white mb-6 text-center">
        Review & Confirm
      </h2>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Package</p>
          <p className="text-white font-semibold">{product.name}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Dates</p>
          <p className="text-white">{formatDateRange(startDate, endDate)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Pricing</p>
          <p className="text-white/70 text-sm">
            {dayCount} day{dayCount !== 1 ? 's' : ''} × ${(product.price_per_day_cents / 100).toFixed(0)}/day
          </p>
          <p className="text-2xl font-bold text-white mt-1">${(totalCents / 100).toFixed(2)}</p>
        </div>

        {isHold && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            <strong>Payment Hold Notice:</strong> This booking places an authorization hold on your card.
            Additional expenses incurred during the event will be invoiced separately after completion.
            The hold will be captured upon event completion.
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
      )}

      <div className="flex gap-4 mt-6">
        <button
          onClick={onBack}
          disabled={loading}
          className="glass-btn glass-btn-ghost flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="glass-btn glass-btn-primary flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          {loading ? 'Processing...' : isHold ? 'Reserve & Hold' : 'Reserve & Pay'}
        </button>
      </div>
    </div>
  )
}

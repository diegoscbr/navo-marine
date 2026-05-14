'use client'

import { useState, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import type { PackageProduct } from '@/lib/db/packages'
import { daysBetween, formatDateRange } from '@/lib/utils/dates'

type Props = {
  product: PackageProduct
  onNext: (startDate: string, endDate: string) => void
  onBack: () => void
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable'

type FetchResult =
  | { kind: 'success'; startDate: string; endDate: string; available: boolean }
  | { kind: 'error'; startDate: string; endDate: string }
  | null

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function DateRangePicker({ product, onNext, onBack }: Props) {
  const [range, setRange] = useState<DateRange | undefined>()
  const [fetchResult, setFetchResult] = useState<FetchResult>(null)
  const [error, setError] = useState<string | null>(null)

  const startDate = range?.from ? toISODate(range.from) : null
  const endDate = range?.to ? toISODate(range.to) : null

  const dayCount = startDate && endDate ? daysBetween(startDate, endDate) : null
  const totalCents = dayCount ? dayCount * product.price_per_day_cents : null

  // Derived: advance-booking validation. Date.now() is intentionally read at
  // render time so the warning updates as the clock crosses the threshold —
  // tearing on a millisecond boundary is acceptable for this UI.
  let advanceError: string | null = null
  if (startDate && product.min_advance_booking_days) {
    const daysUntil = Math.floor(
      // eslint-disable-next-line react-hooks/purity
      (new Date(startDate + 'T12:00:00Z').getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    )
    if (daysUntil < product.min_advance_booking_days) {
      advanceError = `${product.name} requires ${product.min_advance_booking_days} days advance booking. Please choose a start date at least ${product.min_advance_booking_days} days from today.`
    }
  }

  // Derived: availability state from inputs + last fetch result.
  const fetchMatchesInputs =
    fetchResult !== null &&
    startDate !== null &&
    endDate !== null &&
    fetchResult.startDate === startDate &&
    fetchResult.endDate === endDate
  let availability: AvailabilityState
  if (!startDate || !endDate || advanceError) {
    availability = 'idle'
  } else if (fetchMatchesInputs && fetchResult?.kind === 'success') {
    availability = fetchResult.available ? 'available' : 'unavailable'
  } else if (fetchMatchesInputs && fetchResult?.kind === 'error') {
    availability = 'idle'
  } else {
    availability = 'checking'
  }

  // Effect: fetch availability when inputs are complete and valid.
  // All setState calls happen inside the async callback, after await.
  useEffect(() => {
    if (!startDate || !endDate || advanceError) return

    let cancelled = false

    fetch(
      `/api/packages/availability?product_id=${product.id}&start_date=${startDate}&end_date=${endDate}`,
    )
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setFetchResult({ kind: 'error', startDate, endDate })
          setError('Failed to check availability. Please try again.')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setFetchResult({
          kind: 'success',
          startDate,
          endDate,
          available: Boolean(data.available),
        })
      })
      .catch(() => {
        if (cancelled) return
        setFetchResult({ kind: 'error', startDate, endDate })
        setError('Failed to check availability. Please try again.')
      })

    return () => {
      cancelled = true
    }
  }, [startDate, endDate, advanceError, product.id])

  const canProceed = startDate && endDate && availability === 'available' && !advanceError

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="font-heading text-2xl font-semibold text-white">Select Dates</h2>
      <p className="text-white/60 text-sm">{product.name}</p>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          disabled={{ before: new Date() }}
          classNames={{
            root: 'text-white',
            months: 'flex gap-4',
            month_caption: 'text-white/80 font-medium mb-2',
            nav: 'text-white/60',
            day: 'text-white/70 hover:text-white rounded-lg',
            day_button: 'w-9 h-9 rounded-lg hover:bg-white/10',
            selected: 'bg-marine-500 text-white rounded-lg',
            range_start: 'bg-marine-500 text-white rounded-l-lg',
            range_end: 'bg-marine-500 text-white rounded-r-lg',
            range_middle: 'bg-marine-500/20 text-white',
            today: 'border border-white/20',
            disabled: 'text-white/20 cursor-not-allowed',
          }}
        />
      </div>

      {dayCount && totalCents && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center w-full max-w-sm">
          <p className="text-white/60 text-sm">
            {startDate && endDate ? formatDateRange(startDate, endDate) : ''}
          </p>
          <p className="text-2xl font-bold text-white mt-1">${(totalCents / 100).toFixed(2)}</p>
          <p className="text-xs text-white/40 mt-1">
            {dayCount} day{dayCount !== 1 ? 's' : ''} × ${(product.price_per_day_cents / 100).toFixed(0)}/day
          </p>
        </div>
      )}

      {availability === 'checking' && (
        <p className="text-sm text-white/50">Checking availability...</p>
      )}
      {availability === 'available' && (
        <p className="text-sm text-green-400">✓ Available for selected dates</p>
      )}
      {availability === 'unavailable' && (
        <p className="text-sm text-red-400">✗ Not available for selected dates. Please choose different dates.</p>
      )}

      {advanceError && (
        <p className="text-sm text-amber-400 text-center max-w-sm">{advanceError}</p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-4 w-full max-w-sm">
        <button
          onClick={onBack}
          className="glass-btn glass-btn-ghost flex-1 px-6 py-3 text-sm font-medium"
        >
          ← Back
        </button>
        <button
          onClick={() => canProceed && onNext(startDate!, endDate!)}
          disabled={!canProceed}
          className="glass-btn glass-btn-primary flex-1 px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          Review →
        </button>
      </div>
    </div>
  )
}

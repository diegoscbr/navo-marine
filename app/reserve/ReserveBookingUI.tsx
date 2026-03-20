'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import type { RentalEvent, DateWindow } from '@/lib/db/events'
import { daysBetween } from '@/lib/utils/dates'

type Tab = 'event' | 'custom'

type Props = {
  events: RentalEvent[]
  windows: DateWindow[]
  defaultProductId: string
}

const DEFAULT_PRICE_PER_DAY_CENTS = 3500

export function ReserveBookingUI({ events, windows, defaultProductId }: Props) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<Tab>('event')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedWindowId, setSelectedWindowId] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [extraDays, setExtraDays] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session?.user) {
    return (
      <div className="text-center">
        <p className="text-white/60 mb-4">You must be signed in to reserve.</p>
        <a href="/login" className="glass-btn glass-btn-primary px-6 py-3 text-sm font-medium">
          Sign In to Continue
        </a>
      </div>
    )
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const eventProduct = selectedEvent?.rental_event_products?.[0]

  const pricePerDay = selectedEvent?.rental_price_per_day_cents ?? DEFAULT_PRICE_PER_DAY_CENTS
  const eventDays = selectedEvent
    ? daysBetween(selectedEvent.start_date, selectedEvent.end_date)
    : 0
  const totalDays = eventDays + extraDays
  const totalCents = totalDays * pricePerDay

  function handleExtraDaysChange(value: number) {
    setExtraDays(Math.min(14, Math.max(0, value)))
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      const body =
        activeTab === 'event'
          ? {
              reservation_type: 'rental_event' as const,
              product_id: defaultProductId,
              event_id: selectedEventId,
              sail_number: sailNumber,
              extra_days: extraDays,
            }
          : {
              reservation_type: 'rental_custom' as const,
              product_id: defaultProductId,
              date_window_id: selectedWindowId,
              sail_number: sailNumber,
            }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    sailNumber.trim().length > 0 &&
    (activeTab === 'event' ? !!selectedEventId : !!selectedWindowId)

  return (
    <div className="w-full max-w-2xl">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl bg-white/5 p-1 mb-8">
        <button
          onClick={() => setActiveTab('event')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'event'
              ? 'bg-marine-500 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Rent for an Event
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'custom'
              ? 'bg-marine-500 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Custom Dates
        </button>
      </div>

      {/* Event Tab */}
      {activeTab === 'event' && (
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm text-white/60 mb-2 block">Select Event</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            >
              <option value="">Choose an event...</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} — {evt.location} ({evt.start_date} to {evt.end_date})
                </option>
              ))}
            </select>
          </label>

          {selectedEvent && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
              {/* Per-day price */}
              <div>
                <p className="text-lg font-semibold text-white">
                  ${(pricePerDay / 100).toFixed(0)}<span className="text-sm font-normal text-white/60">/day</span>
                </p>
                {eventProduct && (
                  <p className="text-xs text-white/40 mt-1">
                    Late fee: ${(eventProduct.late_fee_cents / 100).toFixed(2)} if reserved within {eventProduct.reserve_cutoff_days} days of event
                  </p>
                )}
              </div>

              {/* Extra days stepper */}
              <label className="block">
                <span className="text-sm text-white/60 mb-2 block">Additional days needed beyond the event</span>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={extraDays}
                  onChange={(e) => handleExtraDaysChange(Number(e.target.value))}
                  aria-label="additional days"
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                />
              </label>

              {/* Dynamic total */}
              <p className="text-sm text-white/70">
                {totalDays} {totalDays === 1 ? 'day' : 'days'} &times; ${pricePerDay / 100}/day ={' '}
                <span className="font-semibold text-white">${totalCents / 100}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Custom Dates Tab */}
      {activeTab === 'custom' && (
        <div className="space-y-6">
          <label className="block">
            <span className="text-sm text-white/60 mb-2 block">Select Date Window</span>
            <select
              value={selectedWindowId}
              onChange={(e) => setSelectedWindowId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
            >
              <option value="">Choose a date window...</option>
              {windows.map((win) => (
                <option key={win.id} value={win.id}>
                  {win.label ?? 'Custom'} ({win.start_date} to {win.end_date})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Sail Number — shared between both tabs */}
      <label className="block mt-6">
        <span className="text-sm text-white/60 mb-2 block">Sail Number</span>
        <input
          type="text"
          value={sailNumber}
          onChange={(e) => setSailNumber(e.target.value)}
          placeholder="Sail number (e.g., USA-12345)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className="glass-btn glass-btn-primary mt-8 w-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
      >
        {loading ? 'Processing...' : 'Reserve & Pay'}
      </button>
    </div>
  )
}

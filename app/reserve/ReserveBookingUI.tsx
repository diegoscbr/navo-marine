'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { RentalEvent, DateWindow } from '@/lib/db/events'
import { daysBetween } from '@/lib/utils/dates'
import {
  buildLoginUrl,
  type RentalEventSelection,
  type RentalCustomSelection,
} from '@/lib/checkout/state-codec'
import { useRehydrateSelection } from '@/lib/checkout/use-rehydrate-selection'

type Props = {
  events: RentalEvent[]
  windows: DateWindow[]
  defaultProductId: string
}

const DEFAULT_PRICE_PER_DAY_CENTS = 3500

export function ReserveBookingUI({ events, windows, defaultProductId }: Props) {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState<'event' | 'custom'>('event')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [sailNumber, setSailNumber] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [extraDays, setExtraDays] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedWindowId, setSelectedWindowId] = useState('')

  useRehydrateSelection((selection) => {
    if (selection.reservation_type === 'rental_event') {
      setActiveTab('event')
      setSelectedEventId(selection.event_id)
      setSailNumber(selection.sail_number)
      if (selection.extra_days !== undefined) setExtraDays(selection.extra_days)
      return
    }
    if (selection.reservation_type === 'rental_custom') {
      setActiveTab('custom')
      setSelectedWindowId(selection.date_window_id)
      setSailNumber(selection.sail_number)
      if (selection.extra_days !== undefined) setExtraDays(selection.extra_days)
    }
  })

  // Pre-fill confirmation email from session on first render
  const emailValue = confirmationEmail !== '' ? confirmationEmail : (session?.user?.email ?? '')

  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const eventProduct = selectedEvent?.rental_event_products?.find(
    (product) => product.product_id === defaultProductId,
  ) ?? selectedEvent?.rental_event_products?.[0]
  const selectedProductId = eventProduct?.product_id ?? defaultProductId

  // Mirror the event-tab's product_id resolution for the custom-date tab.
  // A date_window can offer multiple products via date_window_allocations;
  // prefer the default product (Atlas 2), fall back to the first allocation.
  const selectedWindow = windows.find((w) => w.id === selectedWindowId)
  const windowAllocation =
    selectedWindow?.date_window_allocations?.find(
      (a) => a.product_id === defaultProductId,
    ) ?? selectedWindow?.date_window_allocations?.[0]
  const selectedCustomProductId = windowAllocation?.product_id ?? defaultProductId

  const pricePerDay =
    eventProduct?.rental_price_per_day_cents ??
    selectedEvent?.rental_price_per_day_cents ??
    DEFAULT_PRICE_PER_DAY_CENTS
  const eventDays = selectedEvent
    ? daysBetween(selectedEvent.start_date, selectedEvent.end_date)
    : 0
  const totalDays = eventDays + extraDays
  const totalCents = totalDays * pricePerDay

  function handleExtraDaysChange(value: number) {
    setExtraDays(Math.min(14, Math.max(0, value)))
  }

  async function handleSubmit() {
    // Anonymous visitor: redirect to /login carrying selection state.
    // status === 'loading' = session still resolving; do nothing (rare; user clicks again on hydration).
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      if (activeTab === 'event') {
        const selection: RentalEventSelection = {
          reservation_type: 'rental_event',
          product_id: selectedProductId,
          event_id: selectedEventId,
          sail_number: sailNumber.trim(),
          ...(extraDays > 0 ? { extra_days: extraDays } : {}),
        }
        window.location.href = buildLoginUrl('/reserve', selection)
        return
      }
      // custom-date tab
      const selection: RentalCustomSelection = {
        reservation_type: 'rental_custom',
        product_id: selectedCustomProductId,
        date_window_id: selectedWindowId,
        sail_number: sailNumber.trim(),
        ...(extraDays > 0 ? { extra_days: extraDays } : {}),
      }
      window.location.href = buildLoginUrl('/reserve', selection)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const body = {
        reservation_type: 'rental_event' as const,
        product_id: selectedProductId,
        event_id: selectedEventId,
        sail_number: sailNumber,
        extra_days: extraDays,
        confirmation_email: emailValue.trim() || undefined,
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

  const canSubmit = sailNumber.trim().length > 0 && !!selectedEventId && !!eventProduct

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

      {/* Custom Dates — contact us */}
      {activeTab === 'custom' && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-white/80 font-medium">Need custom dates?</p>
          <p className="mt-2 text-sm text-white/50">
            Custom rentals are handled as direct invoices. Reach out and we&apos;ll set everything up for you.
          </p>
          <Link
            href="/contact"
            className="glass-btn glass-btn-primary mt-6 inline-flex px-8 py-3 text-sm font-medium"
          >
            Contact Us
          </Link>
          <p className="mt-4 text-xs text-white/30">619-288-9746 · info@navomarine.com</p>
        </div>
      )}

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

      {/* Sail Number and submit — only shown on event tab */}
      {activeTab === 'event' && (
        <>
          <label className="block mt-6">
            <span className="text-sm text-white/60 mb-2 block">Confirmation Email</span>
            <input
              type="email"
              value={emailValue}
              onChange={(e) => setConfirmationEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30"
            />
            <p className="mt-1 text-xs text-white/30">Booking confirmation will be sent here</p>
          </label>

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

          {selectedEventId && !eventProduct && (
            <p className="mt-4 text-sm text-red-400">This event does not have a reservable product allocation.</p>
          )}

          <div className="mt-8">
            {status === 'unauthenticated' && (
              <p className="mb-2 text-center text-xs text-white/40">
                You&rsquo;ll sign in with Google to complete.
              </p>
            )}
            {status === 'authenticated' && session?.user && (
              <p className="mb-2 text-center text-xs text-white/40">
                ✓ Signed in as {session.user.email}
              </p>
            )}
            {/* during status === 'loading' the slot renders nothing — prevents flash */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="glass-btn glass-btn-primary w-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
            >
              {loading ? 'Processing...' : 'Reserve & Pay'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

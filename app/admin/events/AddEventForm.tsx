'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AddEventForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    location: '',
    event_url: '',
    start_date: '',
    end_date: '',
  })

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          event_url: form.event_url || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create event')
        return
      }
      setForm({ name: '', location: '', event_url: '', start_date: '', end_date: '' })
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-500/80"
      >
        + Add Event
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4"
    >
      <h2 className="font-heading text-base font-semibold text-white">New Event</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-white/50 mb-1 block">Event Name *</span>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="2026 US Sailing Nationals"
          />
        </label>

        <label className="block">
          <span className="text-xs text-white/50 mb-1 block">Location *</span>
          <input
            required
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="Annapolis, MD"
          />
        </label>

        <label className="block">
          <span className="text-xs text-white/50 mb-1 block">Start Date *</span>
          <input
            required
            type="date"
            value={form.start_date}
            onChange={(e) => set('start_date', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block">
          <span className="text-xs text-white/50 mb-1 block">End Date *</span>
          <input
            required
            type="date"
            value={form.end_date}
            onChange={(e) => set('end_date', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs text-white/50 mb-1 block">Event URL (optional)</span>
          <input
            type="url"
            value={form.event_url}
            onChange={(e) => set('event_url', e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder-white/30"
            placeholder="https://www.ussailing.org/"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create Event'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

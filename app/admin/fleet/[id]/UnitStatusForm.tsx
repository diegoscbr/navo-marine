'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const STATUSES = [
  'available',
  'reserved_unpaid',
  'reserved_paid',
  'in_transit',
  'at_event',
  'returned',
  'damaged',
  'lost',
  'sold',
] as const

type Props = { unitId: string; currentStatus: string }

export function UnitStatusForm({ unitId, currentStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState(currentStatus)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const fieldClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none focus:ring-1 focus:ring-marine-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    startTransition(async () => {
      const res = await fetch(`/api/admin/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Something went wrong.')
        return
      }
      setSuccess(true)
      setNotes('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/40">
          New status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClass}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/40">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={fieldClass}
          placeholder="Reason for status change"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Status updated.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || status === currentStatus}
        className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-400 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Update status'}
      </button>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  eventId: string
  eventName: string
}

export function DeleteEventButton({ eventId, eventName }: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Failed to delete')
        return
      }
      setShowConfirm(false)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setShowConfirm(true); setError(null) }}
        aria-label="Delete event"
        className="rounded p-1 text-white/30 transition-colors hover:bg-red-500/20 hover:text-red-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <h3 className="font-heading text-base font-semibold text-white">
              Are you sure?
            </h3>
            <p className="mt-2 text-sm text-white/60">
              This will permanently delete{' '}
              <span className="text-white/80">{eventName}</span> and all
              associated product links.
            </p>
            <p className="mt-1 text-xs text-white/40">
              Existing reservations for this event will NOT be deleted. This cannot be undone.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                aria-label="Confirm delete"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                aria-label="Cancel"
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

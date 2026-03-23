'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Unit = { id: string; navo_number: string; status: string }

export function AssignUnitDropdown({
  reservationId,
  currentUnitId,
  units,
}: {
  reservationId: string
  currentUnitId: string | null
  units: Unit[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const unit_id = e.target.value || null
    setLoading(true)
    setError(null)
    const response = await fetch(`/api/admin/reservations/${reservationId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id }),
    })
    setLoading(false)
    if (!response.ok) {
      setError('Failed to assign unit. Please try again.')
      return
    }
    router.refresh()
  }

  return (
    <div>
      <select
        defaultValue={currentUnitId ?? ''}
        onChange={handleChange}
        disabled={loading}
        className="rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
      >
        <option value="">— unassigned —</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.navo_number}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

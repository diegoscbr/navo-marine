'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Unit = { id: string; serial_number: string; status: string }

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

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const unit_id = e.target.value || null
    setLoading(true)
    await fetch(`/api/admin/reservations/${reservationId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <select
      defaultValue={currentUnitId ?? ''}
      onChange={handleChange}
      disabled={loading}
      className="rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
    >
      <option value="">— unassigned —</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.serial_number}
        </option>
      ))}
    </select>
  )
}

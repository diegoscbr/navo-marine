'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Unit = { id: string; navo_number: string; unit_type: string }
type Assignment = { unit_type: 'tablet' | 'atlas2'; unit_id: string | null }

export function PackageUnitAssignment({
  reservationId,
  tabletUnits,
  atlas2Units,
  atlas2Count,
  currentAssignments,
}: {
  reservationId: string
  tabletUnits: Unit[]
  atlas2Units: Unit[]
  atlas2Count: number
  currentAssignments: Assignment[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initTablet = currentAssignments.find((a) => a.unit_type === 'tablet')?.unit_id ?? null
  const [tabletId, setTabletId] = useState<string | null>(initTablet)

  // N atlas2 slots — one per atlas2_units_required
  const initAtlas2Ids = Array.from({ length: atlas2Count }, (_, i) => {
    const matches = currentAssignments.filter((a) => a.unit_type === 'atlas2')
    return matches[i]?.unit_id ?? null
  })
  const [atlas2Ids, setAtlas2Ids] = useState<(string | null)[]>(initAtlas2Ids)

  async function save(newTabletId: string | null, newAtlas2Ids: (string | null)[]) {
    setLoading(true)
    setError(null)
    const assignments: Assignment[] = []
    if (tabletUnits.length > 0) {
      assignments.push({ unit_type: 'tablet', unit_id: newTabletId })
    }
    for (const id of newAtlas2Ids) {
      assignments.push({ unit_type: 'atlas2', unit_id: id })
    }

    const response = await fetch(`/api/admin/reservations/${reservationId}/assign-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    })
    setLoading(false)
    if (!response.ok) {
      setError('Failed to save assignment. Please try again.')
      return
    }
    router.refresh()
  }

  const selectClass =
    'rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50'

  return (
    <div className="space-y-1">
      {tabletUnits.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-white/30">Tablet:</span>
          <select
            value={tabletId ?? ''}
            onChange={(e) => {
              const val = e.target.value || null
              setTabletId(val)
              void save(val, atlas2Ids)
            }}
            disabled={loading}
            className={selectClass}
          >
            <option value="">— unassigned —</option>
            {tabletUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.navo_number}
              </option>
            ))}
          </select>
        </div>
      )}
      {atlas2Ids.map((id, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-xs text-white/30">
            Atlas 2{atlas2Count > 1 ? ` (${i + 1})` : ''}:
          </span>
          <select
            value={id ?? ''}
            onChange={(e) => {
              const val = e.target.value || null
              const updated = atlas2Ids.map((v, j) => (j === i ? val : v))
              setAtlas2Ids(updated)
              void save(tabletId, updated)
            }}
            disabled={loading}
            className={selectClass}
          >
            <option value="">— unassigned —</option>
            {atlas2Units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.navo_number}
              </option>
            ))}
          </select>
        </div>
      ))}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

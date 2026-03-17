import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/db/client'
import { UnitStatusForm } from './UnitStatusForm'

export const metadata: Metadata = { title: 'Unit | NAVO Admin' }

const STATUS_STYLES: Record<string, string> = {
  available:       'bg-emerald-500/15 text-emerald-400',
  reserved_unpaid: 'bg-yellow-500/15 text-yellow-400',
  reserved_paid:   'bg-blue-500/15 text-blue-400',
  in_transit:      'bg-purple-500/15 text-purple-400',
  at_event:        'bg-cyan-500/15 text-cyan-400',
  returned:        'bg-white/10 text-white/50',
  damaged:         'bg-red-500/15 text-red-400',
  lost:            'bg-red-500/20 text-red-500',
  sold:            'bg-white/5 text-white/30',
}

type UnitRow = {
  id: string
  navo_number: string
  serial_number: string | null
  status: string
  notes: string | null
  added_at: string
  retired_at: string | null
  products: { name: string } | null
}

type AuditRow = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_type: string
  notes: string | null
  created_at: string
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [unitResult, auditResult] = await Promise.all([
    supabaseAdmin
      .from('units')
      .select('id, navo_number, serial_number, status, notes, added_at, retired_at, products(name)')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('unit_events')
      .select('id, event_type, from_status, to_status, actor_type, notes, created_at')
      .eq('unit_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (unitResult.error || !unitResult.data) notFound()

  const unit = unitResult.data as unknown as UnitRow
  const events = (auditResult.data ?? []) as unknown as AuditRow[]

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/fleet" className="text-xs text-white/40 hover:text-white/70">
          ← Fleet
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <h1 className="font-heading font-mono text-2xl font-semibold text-white">
            {unit.navo_number}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[unit.status] ?? 'bg-white/10 text-white/50'}`}
          >
            {unit.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/40">{unit.products?.name}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Audit log */}
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
            Audit log
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-white/30">No events recorded.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white/80">
                      {e.from_status ? (
                        <>
                          {e.from_status.replace(/_/g, ' ')}
                          {' → '}
                          {e.to_status?.replace(/_/g, ' ')}
                        </>
                      ) : (
                        e.event_type.replace(/_/g, ' ')
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-white/30">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  {e.notes && <p className="mt-1 text-xs text-white/40">{e.notes}</p>}
                  <p className="mt-1 text-xs text-white/25">{e.actor_type}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status override */}
          {!unit.retired_at && (
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
                Status override
              </h2>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <UnitStatusForm unitId={unit.id} currentStatus={unit.status} />
              </div>
            </div>
          )}

          {/* Unit metadata */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Details
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Serial</span>
                <span className="font-mono text-white/60">{unit.serial_number ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Added</span>
                <span className="text-white/60">
                  {new Date(unit.added_at).toLocaleDateString()}
                </span>
              </div>
              {unit.retired_at && (
                <div className="flex justify-between">
                  <span className="text-white/40">Retired</span>
                  <span className="text-white/60">
                    {new Date(unit.retired_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

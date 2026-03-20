import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/db/client'

export const metadata: Metadata = {
  title: 'Reservations | NAVO Admin',
}

type Reservation = {
  id: string
  customer_email: string
  status: string
  start_date: string | null
  end_date: string | null
  total_cents: number
  created_at: string
  products: { name: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  reserved_unpaid: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  reserved_authorized: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  reserved_paid: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

function statusBadge(status: string): string {
  if (status === 'reserved_authorized') {
    return 'HOLD — awaiting capture'
  }
  return status.replace(/_/g, ' ').toUpperCase()
}

export default async function AdminReservationsPage() {
  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_email, status, start_date, end_date, total_cents, created_at, products(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-red-400">Failed to load reservations: {error.message}</p>
      </div>
    )
  }

  const rows = (reservations ?? []) as unknown as Reservation[]

  // Count by status
  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold text-white">Reservations</h1>
        <p className="mt-1 text-sm text-white/40">
          {rows.length} reservation{rows.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Status summary */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span
              key={status}
              className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-white/10 text-white/50'}`}
            >
              {status.replace(/_/g, ' ')} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No reservations yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="bg-white/[0.02] transition-colors hover:bg-white/5">
                  <td className="px-5 py-3 text-white/70">{r.customer_email}</td>
                  <td className="px-5 py-3 text-white/60">{r.products?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${STATUS_STYLES[r.status] ?? 'bg-white/10 text-white/50 border-white/10'}`}
                    >
                      {statusBadge(r.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-xs">
                    {r.start_date && r.end_date ? `${r.start_date} → ${r.end_date}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-white/70">${(r.total_cents / 100).toFixed(2)}</td>
                  <td className="px-5 py-3 text-white/40 text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

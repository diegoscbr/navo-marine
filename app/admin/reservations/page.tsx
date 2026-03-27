import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/db/client'
import { AssignUnitDropdown } from './AssignUnitDropdown'
import { PackageUnitAssignment } from './PackageUnitAssignment'
import { availableUnitsForReservation } from '@/lib/admin/unit-availability'
import { DeleteReservationButton } from './DeleteReservationButton'
import { SendInvoiceButton } from './SendInvoiceButton'

export const metadata: Metadata = {
  title: 'Reservations | NAVO Admin',
}

type Reservation = {
  id: string
  customer_email: string
  status: string
  reservation_type: string
  start_date: string | null
  end_date: string | null
  total_cents: number
  created_at: string
  expires_at: string | null
  unit_id: string | null
  products: { name: string; tablet_required: boolean; atlas2_units_required: number } | null
}

type Unit = { id: string; navo_number: string; status: string; unit_type: string }

type ReservationUnit = { reservation_id: string; unit_type: 'tablet' | 'atlas2'; unit_id: string | null }

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
    .select('id, customer_email, status, reservation_type, start_date, end_date, total_cents, created_at, expires_at, unit_id, products(name, tablet_required, atlas2_units_required)')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: units } = await supabaseAdmin
    .from('units')
    .select('id, navo_number, status, unit_type')
    .is('retired_at', null)
    .order('navo_number')

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-red-400">Failed to load reservations: {error.message}</p>
      </div>
    )
  }

  const rows = (reservations ?? []) as unknown as Reservation[]
  const unitList = (units ?? []) as Unit[]
  const reservationRowsForAvailability = rows.map((r) => ({
    id: r.id,
    unit_id: r.unit_id,
    status: r.status,
  }))

  // Fetch reservation_units for package assignment display
  const reservationIds = rows.map((r) => r.id)
  const { data: reservationUnitsData } = reservationIds.length > 0
    ? await supabaseAdmin
        .from('reservation_units')
        .select('reservation_id, unit_type, unit_id')
        .in('reservation_id', reservationIds)
    : { data: [] }

  const reservationUnits = (reservationUnitsData ?? []) as ReservationUnit[]

  function availableUnitsFor(reservationId: string, currentUnitId: string | null) {
    return availableUnitsForReservation(
      unitList,
      reservationRowsForAvailability,
      reservationId,
      currentUnitId,
      reservationUnits.map((ru) => ({ reservation_id: ru.reservation_id, unit_id: ru.unit_id })),
    ) as Unit[]
  }

  function availableUnitsForType(
    reservationId: string,
    unitType: Unit['unit_type'],
  ): Unit[] {
    return availableUnitsFor(reservationId, null).filter((u) => u.unit_type === unitType)
  }

  // Count by status
  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  function canInvoice(r: Reservation): boolean {
    // Only show for unpaid reservations that haven't already been invoiced.
    // When an invoice is sent, expires_at is set to null.
    return r.status === 'reserved_unpaid' && r.expires_at !== null
  }

  function invoiceSent(r: Reservation): boolean {
    return r.status === 'reserved_unpaid' && r.expires_at === null
  }

  function canDelete(r: Reservation): boolean {
    if (r.status === 'reserved_unpaid' || r.status === 'cancelled') return true
    if (r.status === 'reserved_paid' || r.status === 'completed') {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const endDate = r.end_date ? new Date(r.end_date) : null
      return endDate !== null && endDate < now
    }
    return false
  }

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
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const isPackage =
                  r.reservation_type === 'regatta_package' &&
                  (r.products?.tablet_required || (r.products?.atlas2_units_required ?? 0) > 0)

                const currentAssignments = reservationUnits
                  .filter((ru) => ru.reservation_id === r.id && ru.unit_id)
                  .map((ru) => ({ unit_type: ru.unit_type, unit_id: ru.unit_id }))

                return (
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
                    <td className="px-5 py-3">
                      {isPackage ? (
                        <PackageUnitAssignment
                          reservationId={r.id}
                          tabletUnits={r.products?.tablet_required ? availableUnitsForType(r.id, 'tablet') : []}
                          atlas2Units={(r.products?.atlas2_units_required ?? 0) > 0 ? availableUnitsForType(r.id, 'atlas2') : []}
                          atlas2Count={r.products?.atlas2_units_required ?? 0}
                          currentAssignments={currentAssignments}
                        />
                      ) : (
                        <AssignUnitDropdown
                          reservationId={r.id}
                          currentUnitId={r.unit_id}
                          units={availableUnitsFor(r.id, r.unit_id)}
                        />
                      )}
                    </td>
                    <td className="px-5 py-3 text-white/40 text-xs">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {canInvoice(r) && (
                          <SendInvoiceButton
                            reservationId={r.id}
                            customerEmail={r.customer_email}
                            totalCents={r.total_cents}
                            productName={r.products?.name ?? 'NAVO Product'}
                          />
                        )}
                        {invoiceSent(r) && (
                          <span className="text-xs text-blue-400/70">Sent</span>
                        )}
                        {canDelete(r) && (
                          <DeleteReservationButton
                            reservationId={r.id}
                            customerEmail={r.customer_email}
                            reservationType={r.reservation_type}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

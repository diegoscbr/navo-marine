import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

type ReservationRow = {
  id: string
  customer_email: string
  status: string
  reservation_type: string
  start_date: string | null
  end_date: string | null
  total_cents: number
  created_at: string
  unit_id: string | null
  rental_events: { name: string; location: string | null; start_date: string; end_date: string } | null
  products: { name: string } | null
}

type UnitRow = { id: string; navo_number: string }

type ReservationUnitRow = { reservation_id: string; unit_id: string | null }

const CSV_HEADERS = [
  'Customer Email',
  'Product',
  'Reservation Type',
  'Event Name',
  'Event Location',
  'Status',
  'Start Date',
  'End Date',
  'Total (USD)',
  'Unit',
  'Created At',
]

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatStatus(status: string, totalCents: number): string {
  if (status === 'reserved_authorized') return 'HOLD — awaiting capture'
  if (status === 'reserved_paid' && totalCents === 0) return 'REGISTERED'
  return status.replace(/_/g, ' ').toUpperCase()
}

function formatUsd(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

function buildUnitsLabel(
  r: ReservationRow,
  assignmentsByReservation: Map<string, string[]>,
  unitsById: Map<string, string>,
): string {
  const packageUnitIds = assignmentsByReservation.get(r.id) ?? []
  if (packageUnitIds.length > 0) {
    const numbers = packageUnitIds
      .map((id) => unitsById.get(id))
      .filter((n): n is string => Boolean(n))
      .sort()
    return numbers.join(' + ')
  }
  if (r.unit_id) {
    return unitsById.get(r.unit_id) ?? ''
  }
  return ''
}

function buildCsv(
  rows: ReservationRow[],
  unitsById: Map<string, string>,
  assignmentsByReservation: Map<string, string[]>,
): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.map(escapeCsv).join(','))

  for (const r of rows) {
    const isRentalEvent = r.reservation_type === 'rental_event'
    const startDate = r.start_date ?? (isRentalEvent ? r.rental_events?.start_date ?? null : null)
    const endDate = r.end_date ?? (isRentalEvent ? r.rental_events?.end_date ?? null : null)

    const cells = [
      r.customer_email,
      r.products?.name ?? '',
      r.reservation_type,
      isRentalEvent ? r.rental_events?.name ?? '' : '',
      isRentalEvent ? r.rental_events?.location ?? '' : '',
      formatStatus(r.status, r.total_cents),
      startDate ?? '',
      endDate ?? '',
      formatUsd(r.total_cents),
      buildUnitsLabel(r, assignmentsByReservation, unitsById),
      formatCreated(r.created_at),
    ]
    lines.push(cells.map(escapeCsv).join(','))
  }

  return lines.join('\r\n')
}

function buildFilename(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `navo-reservations-${y}-${m}-${d}.csv`
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: reservationsData, error: reservationsError } = await supabaseAdmin
    .from('reservations')
    .select(
      'id, customer_email, status, reservation_type, start_date, end_date, total_cents, created_at, unit_id, rental_events(name, location, start_date, end_date), products(name)',
    )
    .order('created_at', { ascending: false })

  if (reservationsError) {
    return NextResponse.json({ error: reservationsError.message }, { status: 500 })
  }

  const rows = (reservationsData ?? []) as unknown as ReservationRow[]

  const { data: unitsData, error: unitsError } = await supabaseAdmin
    .from('units')
    .select('id, navo_number')

  if (unitsError) {
    return NextResponse.json({ error: unitsError.message }, { status: 500 })
  }

  const unitsById = new Map<string, string>()
  for (const u of (unitsData ?? []) as UnitRow[]) {
    unitsById.set(u.id, u.navo_number)
  }

  const reservationIds = rows.map((r) => r.id)
  let assignmentRows: ReservationUnitRow[] = []
  if (reservationIds.length > 0) {
    const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
      .from('reservation_units')
      .select('reservation_id, unit_id')
      .in('reservation_id', reservationIds)

    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 })
    }
    assignmentRows = (assignmentsData ?? []) as ReservationUnitRow[]
  }

  const assignmentsByReservation = new Map<string, string[]>()
  for (const a of assignmentRows) {
    if (!a.unit_id) continue
    const existing = assignmentsByReservation.get(a.reservation_id) ?? []
    assignmentsByReservation.set(a.reservation_id, [...existing, a.unit_id])
  }

  const csvBody = buildCsv(rows, unitsById, assignmentsByReservation)
  // Excel UTF-8 BOM so accented names render correctly when opened directly.
  const body = `﻿${csvBody}`
  const filename = buildFilename(new Date())

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

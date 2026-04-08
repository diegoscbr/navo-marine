import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { status: string; notes?: string }

  if (!body.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  const VALID_UNIT_STATUSES = new Set([
    'available', 'reserved_unpaid', 'reserved_paid', 'in_transit',
    'at_event', 'returned', 'damaged', 'lost', 'sold',
  ])

  if (!VALID_UNIT_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${[...VALID_UNIT_STATUSES].join(', ')}` },
      { status: 400 },
    )
  }

  // Block override to 'available' if unit has an active paid reservation
  if (body.status === 'available') {
    const { data: activeRes } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('unit_id', id)
      .in('status', ['reserved_paid'])
      .maybeSingle()

    if (activeRes) {
      return NextResponse.json(
        {
          error:
            'Cannot mark unit available: it has an active paid reservation. Cancel the reservation first.',
        },
        { status: 409 },
      )
    }
  }

  // Fetch current status for audit log
  const { data: currentUnit } = await supabaseAdmin
    .from('units')
    .select('status')
    .eq('id', id)
    .single()

  const fromStatus = (currentUnit as { status: string } | null)?.status ?? null

  const { data, error } = await supabaseAdmin
    .from('units')
    .update({ status: body.status, notes: body.notes ?? null })
    .eq('id', id)
    .select('id, navo_number, status, notes')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.error('[admin/units/id] DB error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await supabaseAdmin.from('unit_events').insert({
    unit_id: id,
    event_type: 'status_changed',
    from_status: fromStatus,
    to_status: body.status,
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: body.notes ?? 'Manual status override',
  })

  return NextResponse.json({ unit: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Block retire if unit has any active reservation
  const { data: activeRes } = await supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('unit_id', id)
    .in('status', ['reserved_unpaid', 'reserved_paid'])
    .maybeSingle()

  if (activeRes) {
    return NextResponse.json(
      { error: 'Cannot retire unit: it has an active reservation. Cancel it first.' },
      { status: 409 },
    )
  }

  const { data: currentUnit } = await supabaseAdmin
    .from('units')
    .select('status')
    .eq('id', id)
    .single()

  const { error } = await supabaseAdmin
    .from('units')
    .update({ retired_at: new Date().toISOString(), status: 'sold' })
    .eq('id', id)

  if (error) {
    console.error('[admin/units/id] DB error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await supabaseAdmin.from('unit_events').insert({
    unit_id: id,
    event_type: 'status_changed',
    from_status: (currentUnit as { status: string } | null)?.status ?? null,
    to_status: 'sold',
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: 'Unit retired from fleet',
  })

  return NextResponse.json({ success: true })
}

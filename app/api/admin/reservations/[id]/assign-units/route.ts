import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

type Assignment = {
  unit_type: 'tablet' | 'atlas2'
  unit_id: string | null
}

type AssignUnitsBody = {
  assignments: Assignment[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireAdmin()
  if (!adminResult.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: reservationId } = await params

  let body: AssignUnitsBody
  try {
    body = (await req.json()) as AssignUnitsBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.assignments)) {
    return NextResponse.json({ error: 'assignments must be an array' }, { status: 400 })
  }

  // Filter to only assignments with a unit_id set
  const toAssign = body.assignments
    .filter((a): a is Assignment & { unit_id: string } => a.unit_id !== null)
    .map((a) => ({ unit_type: a.unit_type, unit_id: a.unit_id }))

  const seenUnitIds = new Set<string>()
  for (const assignment of toAssign) {
    if (seenUnitIds.has(assignment.unit_id)) {
      return NextResponse.json(
        { error: 'Duplicate unit IDs are not allowed' },
        { status: 400 },
      )
    }
    seenUnitIds.add(assignment.unit_id)
  }

  // Atomic delete+insert via RPC — avoids partial-write if insert fails
  const { error } = await supabaseAdmin.rpc('assign_reservation_units', {
    p_reservation_id: reservationId,
    p_assignments: toAssign,
  })

  if (error) {
    console.error('assign-units rpc failed:', error)
    return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

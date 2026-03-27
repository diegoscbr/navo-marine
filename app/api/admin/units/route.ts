import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, navo_number, serial_number, status, notes, added_at, products(id, name, slug)')
    .is('retired_at', null)
    .order('navo_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ units: data })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    navo_number: string
    product_id: string
    serial_number?: string
    notes?: string
  }

  if (!body.navo_number || !body.product_id) {
    return NextResponse.json({ error: 'navo_number and product_id are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('units')
    .insert({
      navo_number: body.navo_number,
      product_id: body.product_id,
      serial_number: body.serial_number ?? null,
      notes: body.notes ?? null,
      status: 'available',
    })
    .select('id, navo_number, serial_number, status, notes, added_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Unit number already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const unitId = (data as { id: string }).id
  await supabaseAdmin.from('unit_events').insert({
    unit_id: unitId,
    event_type: 'status_changed',
    from_status: null,
    to_status: 'available',
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: 'Unit added to fleet',
  })

  return NextResponse.json({ unit: data }, { status: 201 })
}

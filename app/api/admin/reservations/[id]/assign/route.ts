import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as { unit_id?: string | null }

  if (body.unit_id === undefined) {
    return NextResponse.json({ error: 'unit_id is required (pass null to unassign)' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({ unit_id: body.unit_id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, unit_id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservation: data })
}

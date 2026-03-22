import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as Partial<{
    name: string
    location: string
    event_url: string | null
    start_date: string
    end_date: string
    active: boolean
  }>

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .update(body)
    .eq('id', id)
    .select('id, name, location, event_url, start_date, end_date, active')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabaseAdmin
    .from('rental_events')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

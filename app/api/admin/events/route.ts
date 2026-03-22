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
    .from('rental_events')
    .select('id, name, location, event_url, start_date, end_date, active, created_at')
    .order('start_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name: string
    location: string
    event_url?: string
    start_date: string
    end_date: string
    active?: boolean
  }

  if (!body.name || !body.location || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'name, location, start_date, end_date are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .insert({
      name: body.name,
      location: body.location,
      event_url: body.event_url ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
      active: body.active ?? true,
    })
    .select('id, name, location, event_url, start_date, end_date, active, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event: data }, { status: 201 })
}

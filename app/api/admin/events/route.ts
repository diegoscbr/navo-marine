import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .select('id, name, location, event_url, start_date, end_date, active, created_at')
    .order('start_date', { ascending: false })

  if (error) {
    console.error('[admin/events] DB error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
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
    console.error('[admin/events] DB error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Auto-link all individual_rental products to this event
  const eventDays = Math.max(
    1,
    Math.ceil(
      (new Date(body.end_date).getTime() - new Date(body.start_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1,
  )

  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('id, price_per_day_cents')
    .eq('category', 'individual_rental')

  let linkWarning: string | undefined
  if (productsError) {
    linkWarning = `Failed to query products: ${productsError.message}`
  } else if (products && products.length > 0) {
    const allocations = products.map((p: { id: string; price_per_day_cents: number | null }) => ({
      event_id: data.id,
      product_id: p.id,
      rental_price_cents: (p.price_per_day_cents ?? 0) * eventDays,
      late_fee_cents: 3500,
      reserve_cutoff_days: 14,
      capacity: 40,
      inventory_status: 'in_stock',
      rental_price_per_day_cents: p.price_per_day_cents ?? null,
    }))

    const { error: linkError } = await supabaseAdmin.from('rental_event_products').insert(allocations)
    if (linkError) {
      linkWarning = `Event created but product linking failed: ${linkError.message}`
    }
  }

  return NextResponse.json({ event: data, ...(linkWarning ? { linkWarning } : {}) }, { status: 201 })
}

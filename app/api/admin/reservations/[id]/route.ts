import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

const DELETABLE_WITHOUT_DATE_CHECK = new Set(['reserved_unpaid', 'cancelled'])

type DateEmbed = { end_date: string | null } | { end_date: string | null }[] | null

// PostgREST returns to-one embeds as objects, but untyped clients may infer arrays
function embedEndDate(embed: DateEmbed): string | null {
  const row = Array.isArray(embed) ? embed[0] ?? null : embed
  return row?.end_date ?? null
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, end_date, rental_events(end_date), date_windows(end_date)')
    .eq('id', id)
    .single()

  if (fetchError || !reservation) {
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[admin/reservations] fetch failed:', fetchError.message)
    }
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  const { status, end_date, rental_events, date_windows } =
    reservation as unknown as {
      id: string
      status: string
      end_date: string | null
      rental_events: DateEmbed
      date_windows: DateEmbed
    }

  if (!DELETABLE_WITHOUT_DATE_CHECK.has(status)) {
    // Event and custom-window reservations carry no dates of their own;
    // fall back to the linked rental_event / date_window end date
    const effectiveEndDate =
      end_date ?? embedEndDate(rental_events) ?? embedEndDate(date_windows)
    // Compare as YYYY-MM-DD strings in UTC so behavior matches across runtimes
    const today = new Date().toISOString().slice(0, 10)

    if (!effectiveEndDate || effectiveEndDate >= today) {
      return NextResponse.json(
        { error: 'Paid reservations can only be deleted after their end date' },
        { status: 403 },
      )
    }
  }

  const { error: ordersError } = await supabaseAdmin
    .from('orders')
    .update({ reservation_id: null })
    .eq('reservation_id', id)

  if (ordersError) {
    console.error('[admin/reservations] orders cleanup failed:', ordersError.message)
    return NextResponse.json(
      { error: 'Failed to detach linked orders' },
      { status: 500 },
    )
  }

  const { error: deleteError } = await supabaseAdmin
    .from('reservations')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

const DELETABLE_WITHOUT_DATE_CHECK = new Set(['reserved_unpaid', 'cancelled'])

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, end_date, event_id')
    .eq('id', id)
    .single()

  if (fetchError || !reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  const { status, end_date } = reservation as {
    id: string
    status: string
    end_date: string | null
    event_id: string | null
  }

  if (!DELETABLE_WITHOUT_DATE_CHECK.has(status)) {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const endDate = end_date ? new Date(end_date) : null

    if (!endDate || endDate >= now) {
      return NextResponse.json(
        { error: 'Paid reservations can only be deleted after their end date' },
        { status: 403 },
      )
    }
  }

  await supabaseAdmin
    .from('orders')
    .update({ reservation_id: null })
    .eq('reservation_id', id)

  const { error: deleteError } = await supabaseAdmin
    .from('reservations')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

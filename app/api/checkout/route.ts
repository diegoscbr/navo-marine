// app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { handleRentalEvent } from '@/lib/checkout/handlers/rental-event'
import { handleRentalCustom } from '@/lib/checkout/handlers/rental-custom'
import { handleRegattaPackage } from '@/lib/checkout/handlers/regatta-package'

type CheckoutBody = {
  reservation_type: string
  product_id?: string
  event_id?: string
  date_window_id?: string
  sail_number?: string
  extra_days?: number
  start_date?: string
  end_date?: string
  confirmation_email?: string
}

// IMPORTANT: 'purchase' must remain here — existing product purchase flow uses it.
// Removing it would be a regression. The plan adds 'regatta_package'; all four are valid.
const VALID_TYPES = ['rental_event', 'rental_custom', 'purchase', 'regatta_package'] as const

export async function POST(req: NextRequest) {
  // 1. Auth — required for all reservation types
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: Partial<CheckoutBody>
  try {
    body = (await req.json()) as Partial<CheckoutBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Use confirmation_email if provided and valid; fall back to session email
  const rawConfirmEmail = body.confirmation_email?.trim()
  const emailOverride =
    rawConfirmEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawConfirmEmail)
      ? rawConfirmEmail
      : null
  if (rawConfirmEmail && !emailOverride) {
    return NextResponse.json({ error: 'confirmation_email is not a valid email address' }, { status: 400 })
  }

  const authedSession = {
    user: { ...session.user, email: emailOverride ?? session.user.email },
  } as { user: { id?: string | null; email?: string | null } }

  // 2. Common validation
  if (!body.reservation_type || !VALID_TYPES.includes(body.reservation_type as typeof VALID_TYPES[number])) {
    return NextResponse.json(
      { error: 'reservation_type must be one of: rental_event, rental_custom, purchase, regatta_package' },
      { status: 400 },
    )
  }

  if (!body.product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  const baseUrl = req.nextUrl.origin

  // 3. Type-specific validation + dispatch
  if (body.reservation_type === 'rental_event') {
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id is required for rental_event' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
    const rawExtraDays = Number(body.extra_days ?? 0)
    if (rawExtraDays < 0 || rawExtraDays > 14 || !Number.isInteger(rawExtraDays)) {
      return NextResponse.json({ error: 'extra_days must be an integer between 0 and 14' }, { status: 400 })
    }
    const result = await handleRentalEvent(
      { event_id: body.event_id, product_id: body.product_id, sail_number: body.sail_number, extra_days: rawExtraDays },
      authedSession,
      baseUrl,
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  if (body.reservation_type === 'rental_custom') {
    if (!body.date_window_id) {
      return NextResponse.json({ error: 'date_window_id is required for rental_custom' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
    const rawExtraDaysCustom = Number(body.extra_days ?? 0)
    if (rawExtraDaysCustom < 0 || rawExtraDaysCustom > 14 || !Number.isInteger(rawExtraDaysCustom)) {
      return NextResponse.json({ error: 'extra_days must be an integer between 0 and 14' }, { status: 400 })
    }
    const result = await handleRentalCustom(
      { date_window_id: body.date_window_id, product_id: body.product_id, sail_number: body.sail_number, extra_days: rawExtraDaysCustom },
      authedSession,
      baseUrl,
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  if (body.reservation_type === 'regatta_package') {
    if (!body.start_date) {
      return NextResponse.json({ error: 'start_date is required for regatta_package' }, { status: 400 })
    }
    if (!body.end_date) {
      return NextResponse.json({ error: 'end_date is required for regatta_package' }, { status: 400 })
    }

    const result = await handleRegattaPackage(
      { product_id: body.product_id, start_date: body.start_date, end_date: body.end_date },
      authedSession,
      baseUrl,
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  // 'purchase' type — not yet implemented
  return NextResponse.json({ error: 'purchase type not yet implemented' }, { status: 501 })
}

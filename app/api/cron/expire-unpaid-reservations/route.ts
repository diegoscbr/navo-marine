import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/db/client'
import {
  cancelExpiredHold,
  restoreReservationAsPaid,
  type ExpiringHold,
} from '@/lib/cron/reservation-lifecycle'

/**
 * Expiry sweep: release holds that were never paid, so they stop consuming fleet
 * capacity.
 *
 * Stripe is the source of truth, not our own `status` column. That inversion is
 * the whole point — the previous sweep trusted local state, and when the webhook
 * broke it cancelled bookings customers had already paid for.
 *
 * Decision table per candidate:
 *   Stripe says paid / no_payment_required -> restore (never cancel)
 *   Stripe says anything else              -> cancel under a compare-and-swap
 *   Stripe lookup throws                   -> leave alone, count as errored
 *   No Stripe session id at all            -> leave alone, flag for review
 */

/** Only sweep holds that expired at least this long ago, to avoid racing a webhook. */
const GRACE_MINUTES = 15

/** Bound the batch so one run cannot exceed the function timeout. */
const BATCH_LIMIT = 100

const CANDIDATE_COLUMNS =
  'id, stripe_checkout_session_id, unit_id, user_id, customer_email, expires_at, total_cents'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET

  // Fail closed. An unauthenticated sweep endpoint is a remote cancel button.
  if (!secret) {
    console.error('[cron] expire-unpaid: CRON_SECRET is not configured, refusing to run')
    return NextResponse.json(
      { error: 'Cron is not configured' },
      { status: 503 },
    )
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') !== null

  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabaseAdmin
    .from('reservations')
    .select(CANDIDATE_COLUMNS)
    .eq('status', 'reserved_unpaid')
    .not('expires_at', 'is', null)
    .lt('expires_at', cutoff)
    .limit(BATCH_LIMIT)

  if (error) {
    console.error(`[cron] expire-unpaid: candidate query failed error=${error.message}`)
    return NextResponse.json({ error: 'Failed to load candidates' }, { status: 500 })
  }

  const rows = (candidates ?? []) as (ExpiringHold & { expires_at: string })[]

  const tally = {
    processed: rows.length,
    restored: 0,
    cancelled: 0,
    skipped: 0,
    errored: 0,
    needsReview: 0,
    wouldCancel: 0,
    wouldRestore: 0,
  }

  for (const hold of rows) {
    // A hold with no session was never sent to Stripe, so there is nothing to
    // verify against. $0 registrations are inserted as reserved_paid with a NULL
    // expires_at, so they never appear here — anything that does is unexplained
    // and gets a human, not a cancellation.
    if (!hold.stripe_checkout_session_id) {
      tally.needsReview++
      console.warn(
        `[cron] expire-unpaid: needs review reservationId=${hold.id} reason=no-stripe-session`,
      )
      continue
    }

    let session
    try {
      session = await stripe.checkout.sessions.retrieve(hold.stripe_checkout_session_id)
    } catch (err) {
      // Cannot verify means cannot cancel. Try again next run.
      tally.errored++
      console.error(
        `[cron] expire-unpaid: stripe lookup failed reservationId=${hold.id} error=${err}`,
      )
      continue
    }

    const isPaid =
      session.payment_status === 'paid' || session.payment_status === 'no_payment_required'

    if (dryRun) {
      if (isPaid) tally.wouldRestore++
      else tally.wouldCancel++
      continue
    }

    try {
      if (isPaid) {
        const outcome = await restoreReservationAsPaid(hold, session)
        if (outcome === 'error') tally.errored++
        else tally.restored++
        continue
      }

      const outcome = await cancelExpiredHold(hold)
      if (outcome === 'cancelled') tally.cancelled++
      else if (outcome === 'skipped') tally.skipped++
      else tally.errored++
    } catch (err) {
      tally.errored++
      console.error(`[cron] expire-unpaid: transition failed reservationId=${hold.id} error=${err}`)
    }
  }

  const summary = { dryRun, ...tally }
  console.log(`[cron] expire-unpaid: ${JSON.stringify(summary)}`)

  return NextResponse.json(summary)
}

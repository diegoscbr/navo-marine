// One-off backfill for reservations the migration's SQL pass couldn't reach:
// no linked order, so nothing to copy from orders.shipping_address. Retrieves
// each Stripe Checkout Session directly and cross-checks the email before
// writing — a null customer_name is safer than a wrong one. Most of these are
// expected to come back empty: they're all reserved_unpaid, and Stripe only
// collects a shipping/billing name as a step inside checkout the customer may
// never have reached.
//
// Run: npx tsx scripts/backfill-customer-names.ts [--dry-run]
import { stripe } from '../lib/stripe/client'
import { supabaseAdmin } from '../lib/db/client'

export async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')

  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_email, stripe_checkout_session_id')
    .is('customer_name', null)
    .not('stripe_checkout_session_id', 'is', null)

  if (error) throw error

  let written = 0
  let skippedNoName = 0
  let skippedMismatch = 0
  let skippedError = 0

  for (const row of rows ?? []) {
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>
    try {
      session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id!)
    } catch (err) {
      // A bad, expired, or fabricated session id must not abort the whole
      // batch — skip this row and keep going.
      console.warn(`[error] ${row.id} — could not retrieve session: ${(err as Error).message}`)
      skippedError += 1
      continue
    }

    const name =
      session.collected_information?.shipping_details?.name ??
      session.customer_details?.name ??
      null

    if (!name) {
      console.log(`[skip] ${row.id} — Stripe has no name on file`)
      skippedNoName += 1
      continue
    }

    // The cross-check: refuse to write a name whose session doesn't match
    // this reservation's own email.
    const stripeEmail = session.customer_details?.email
    if (stripeEmail && stripeEmail !== row.customer_email) {
      console.warn(
        `[cross-check failed] ${row.id} — Stripe email (${stripeEmail}) ` +
        `!= reservation email (${row.customer_email}), skipping`,
      )
      skippedMismatch += 1
      continue
    }

    console.log(`[${DRY_RUN ? 'dry-run' : 'write'}] ${row.id} → "${name}"`)
    if (!DRY_RUN) {
      const { error: updateErr } = await supabaseAdmin
        .from('reservations')
        .update({ customer_name: name })
        .eq('id', row.id)
      if (updateErr) {
        console.error(`[error] ${row.id} — update failed: ${updateErr.message}`)
        skippedError += 1
        continue
      }
    }
    written += 1
  }

  console.log(
    `\nDone. candidates=${(rows ?? []).length} written=${written} ` +
    `no-name=${skippedNoName} mismatch=${skippedMismatch} errors=${skippedError}` +
    (DRY_RUN ? ' (dry-run — nothing was actually written)' : ''),
  )
}

// Only auto-run when executed directly (`npx tsx scripts/backfill-customer-names.ts`),
// not when imported by the test suite.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

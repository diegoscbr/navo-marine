# Reservation Webhook Recovery — Design Doc

**Date:** 2026-04-29
**Author:** Diego Escobar (with Claude)
**Status:** Draft — pending review

## Problem statement

Real customers paid for rental reservations through Stripe Checkout, but the production database shows their reservations as `cancelled`. Across at least 8 days of data, the Stripe webhook handler in production has never successfully processed an event — every paying customer's reservation has been auto-cancelled by an hourly pg_cron sweep that flips `reserved_unpaid` rows past `expires_at` to `cancelled`.

The user observed this when reviewing `/admin/reservations` on production and seeing 7 of 8 rows in the `cancelled` state, while the Stripe Customers dashboard confirmed real charges from those same customers.

## Diagnosis

### Production data evidence

| Signal | Value |
|---|---|
| Reservations with `status = cancelled` | 7 |
| Reservations with `status = reserved_paid` | 1 (`mindy@minmiller.com`, $0, no Stripe — took the zero-dollar direct-success path) |
| Total `orders` records ever created | 0 |
| Total rows in `stripe_events` log | 0 |
| Cancelled rows that reached Stripe Checkout (have `stripe_checkout_session_id`) | 6 of 7 |
| Cancelled rows that have `stripe_payment_intent_id` | 0 |

### Why the rows ended up cancelled

The `expire_unpaid_reservations()` plpgsql function (introduced in `supabase/migrations/010_fix_cron_reservation_units_cleanup.sql`) is scheduled hourly. It selects `reservations` where `status = 'reserved_unpaid'` and `expires_at < now()`, then sets them to `cancelled`.

Every cancelled row's `updated_at` lands on a clean hour boundary, confirming the cron — not human action — caused the cancellation.

The cron is not the bug. The bug is upstream: the webhook never flipped these rows from `reserved_unpaid` to `reserved_paid`, so the cron treated them as legitimately abandoned 24-hour holds.

### Root cause: webhook never reaches `logStripeEvent`

The webhook handler at `app/api/webhooks/stripe/route.ts`:
1. Verifies the Stripe signature
2. On signature success, calls `fulfillCheckoutSession()` for `checkout.session.completed`
3. Calls `logStripeEvent()` after success

For every other event type (e.g., `payment_intent.created`, `charge.succeeded`), it logs unconditionally to `stripe_events`.

`stripe_events` having zero rows means **no event has ever passed signature verification**. Either:
- Stripe's prod webhook endpoint is misconfigured (wrong URL, disabled, or pointing at a non-prod environment)
- `STRIPE_WEBHOOK_SECRET` in Vercel production env doesn't match the active Stripe webhook signing secret
- A network or Vercel-routing issue prevents events from reaching the function

### Affected customers

Six paying customers + one likely-internal email had their reservations phantom-cancelled. All events are in the future — no service was missed.

| Customer | Amount | Event dates | Notes |
|---|---|---|---|
| andypivey@gmail.com | $350 | 2026-05-15 → 05-24 | Confirmed paid in Stripe |
| info@navomarine.com | $350 | 2026-05-15 → 05-24 | Confirmed internal test (no Stripe charge) |
| rteitge@gmail.com | $350 | 2026-05-15 → 05-24 | Confirmed paid in Stripe |
| mcrussell1015@gmail.com | $105 | 2026-06-12 → 06-14 | Confirmed paid in Stripe |
| brantbolling@gmail.com | $105 | 2026-06-12 → 06-14 | Confirmed paid in Stripe |
| maru.urban.art@gmail.com (×2) | $70, $70 | 2026-05-16 → 05-17 | Unpaid test sessions (per user) |

### Secondary observation: Actions column overflow

Adding the dedicated Event column on `/admin/reservations` (PR #5) widened the table beyond a typical viewport, pushing the Actions column off-screen on standard widths. The Send Invoice and Delete buttons are still rendered in the DOM but are not visible without horizontal scroll. This is a UX regression, not a feature regression.

## Goals

1. Stop new paid customers from being phantom-cancelled.
2. Restore the affected customers programmatically using Stripe as the source of truth, with no customer-facing communication (per user direction — customers were never notified of the bug; silent restoration is preferred).
3. Make the system self-healing so this class of bug cannot recur even if the webhook breaks again in the future.
4. Restore admin UX for the Actions column.
5. Add the missing observability: a test framework that, if green, gives the user confidence the system is working end-to-end. The framework doubles as a health probe.

## Non-goals

- A general-purpose monitoring/alerting product. The user explicitly chose "testing framework as observability" over building separate monitoring tooling.
- Apology email / customer-facing communication for affected customers. Restoration is silent.
- Refunds for affected customers. The user will manually refund maru's duplicate reservation in the Stripe Dashboard after restoration.
- Tracer tests for `rental_custom`, `regatta_package`, or `purchase` flows. Coverage is `rental_event` only — that is where ~95% of customer money flows.
- Per-reservation PDF receipts.
- Slack/SMS alerting. Email-only.
- A "Stripe paid but webhook lagging" intermediate state. The existing `reserved_unpaid` semantics suffice.

## High-level approach

Five sequential phases, each shipped as its own PR.

| Phase | Goal | PR ships independently |
|---|---|---|
| 1. Hotfix | Pause cron + structured webhook logs + runbook | Yes — top priority |
| 2. Backfill | Stripe-first reconciliation script | After Phase 1 + webhook config verified |
| 3. Self-healing cron | Migrate pg_cron job to Vercel Cron route with Stripe verify | After Phase 2 |
| 4. UI improvements | Sticky Actions column + CSV export | Parallel with Phase 3 OK |
| 5. Testing framework | Playwright CI E2E (rental_event happy path) + GHA scheduled webhook probe + Resend email alerts | Last |

**Sequencing constraints:**
- Phase 1 must ship before Phase 2 — backfill is meaningless if cron is still cancelling fresh paid rows.
- Phase 2 must ship before Phase 3 — re-enabling cron logic should run against a clean DB state.
- Phase 4 has no ordering dependency on 2 or 3.
- Phase 5 ships last so the system it's testing is stable.

---

## Phase 1 — Hotfix

**Goal:** stop the bleeding, give the user diagnostic visibility for the webhook config fix.

### Components

#### 1. Pause the pg_cron job

A migration that disables the `expire_unpaid_reservations` schedule. The function definition remains intact for reference; only the schedule is removed.

```sql
-- supabase/migrations/011_pause_expire_unpaid_cron.sql
-- Pauses the unpaid-reservation expiry job until Phase 3 replaces it
-- with a Vercel Cron route that verifies with Stripe before cancelling.

SELECT cron.unschedule('expire-unpaid-reservations');
```

(Exact job name confirmed via `SELECT * FROM cron.job` before migration is written.)

**Side effect:** while paused, every checkout creates a `reserved_unpaid` row that does not auto-clean. Rows accumulate in admin until the user manually deletes them or Phase 3 ships. Acceptable per user direction.

#### 2. Structured webhook logging

Modify `app/api/webhooks/stripe/route.ts` and `lib/stripe/webhook.ts` to emit single-line, prefixed log entries at every major step:

```
[webhook] received id=<event.id> type=<event.type>
[webhook] sig=ok
[webhook] sig=fail reason=<message>
[webhook] idempotent=skipped event_id=<event.id>
[webhook] idempotent=new
[webhook] fulfill=ok orderId=<order.id> reservationId=<reservation.id>
[webhook] fulfill=fail step=<reservation-lookup|update|order-insert> error=<message>
```

No new endpoints, no new attack surface. Failure modes become readable in Vercel function logs.

#### 3. Runbook

A new file at `docs/runbooks/stripe-webhook.md` walks through:
1. Stripe Dashboard verification (endpoint URL, enabled in live mode, subscribed events include `checkout.session.completed`)
2. Copy signing secret from Stripe
3. Vercel project env var check (`STRIPE_WEBHOOK_SECRET`)
4. Update + redeploy if mismatch
5. From Stripe Dashboard, click "Send test event"
6. Read `[webhook]` lines in Vercel logs:
   - `sig=ok` + `fulfill=fail step=reservation-lookup` ⇒ webhook works (test event has no matching reservation, expected)
   - `sig=fail reason=...` ⇒ secret mismatch
   - No log lines ⇒ Stripe isn't reaching the endpoint

### Files

- `supabase/migrations/011_pause_expire_unpaid_cron.sql` (new)
- `app/api/webhooks/stripe/route.ts` (modified — add structured logs)
- `lib/stripe/webhook.ts` (modified — add structured logs)
- `docs/runbooks/stripe-webhook.md` (new)

### Tests

No new tests; existing webhook tests should pass without modification (structured logs are `console.log`/`console.error` calls, RTL/Jest don't assert on log output). Spot-check by running `npm test`.

### Acceptance criteria

- [ ] `npm test` passes
- [ ] Pushing the migration to Supabase via CLI removes the cron schedule (verifiable via `SELECT * FROM cron.job`)
- [ ] After deploy, sending a test event from Stripe Dashboard produces visible `[webhook] sig=ok` line in Vercel logs

### Risks

- **Manual re-enable required.** The cron is permanently off after Phase 1. Phase 3 replaces it with a Vercel Cron route; if Phase 3 is indefinitely delayed, unpaid rows accumulate forever in the DB.
- **The runbook is on the user.** Implementation cannot test that the Stripe Dashboard config is correct.

---

## Phase 2 — Backfill

**Goal:** restore the 6 affected customers using Stripe as the source of truth, idempotently.

### Architecture: standalone CLI script

`scripts/backfill-cancelled-reservations.ts` — invoked locally, defaults to dry-run, writes only with `--apply`.

```bash
npm run backfill           # dry-run, prints decisions
npm run backfill -- --apply  # commits changes
```

Why a script, not an admin route or migration:
- One-off recovery operation
- Dry-run + apply is the safe shape
- No new prod attack surface
- Logs go to local terminal where the user reviews
- Re-runnable safely

### Selection filter

```sql
SELECT id, customer_email, stripe_checkout_session_id, total_cents, ...
FROM reservations
WHERE stripe_checkout_session_id IS NOT NULL
  AND stripe_payment_intent_id IS NULL;
```

Captures cancelled rows (cron killed them) AND any future row that survived the webhook silently dropping. Idempotent: rows already restored have `stripe_payment_intent_id` and are skipped on re-run.

### Per-row decision logic

For each candidate, fetch the Stripe Checkout Session and read `payment_status`:

| Stripe `payment_status` | Action |
|---|---|
| `paid` | **RESTORE_PAID** — update reservation: `status='reserved_paid'`, link `stripe_payment_intent_id`, set `expires_at=null`. Insert `orders` row with `order_number`, totals, currency, status, etc. |
| `no_payment_required` | **RESTORE_PAID** — same as above, no `payment_intent` |
| `unpaid` / session not found | **RESTORE_UNPAID** — update reservation: `status='reserved_unpaid'`, `expires_at=null`. User manually deletes via admin UI. |
| Stripe 404 (bad session_id) | **SKIP** — log warning, leave row unchanged |

### Expected outcome (current production data)

- 4 RESTORE_PAID: andypivey ($350), mcrussell1015 ($105), brantbolling ($105), rteitge ($350)
- 3 RESTORE_UNPAID: maru.urban.art (×2 unpaid tests), info@navomarine.com (likely internal)
- 0 SKIP

After running with `--apply`, the user manually deletes the 3 unpaid rows from `/admin/reservations`. The 4 restored rows have `orders` records and matching `stripe_payment_intent_id` values pulled from each Stripe session.

No customer email is sent. Per user direction, restoration is silent.

### Sanity guards

- Currency check: error out if a Stripe session returns a non-USD currency.
- Idempotency: skip rows that already have `stripe_payment_intent_id`.
- Duplicate detection: rows with the same `customer_email` AND same `event_id` AND `created_at` within 15 minutes are flagged with ⚠ in dry-run output. Not auto-resolved — the user decides.
- Confirmation prompt before `--apply` writes anything. User types `yes` to proceed.

### Files

- `scripts/backfill-cancelled-reservations.ts` (new)
- `__tests__/scripts/backfill-cancelled-reservations.test.ts` (new) — covers each decision branch, idempotency, currency mismatch, duplicate flagging
- `package.json` (modified — adds `backfill` script)
- `docs/runbooks/backfill-cancelled-reservations.md` (new) — usage runbook with prerequisite "Phase 1 webhook config verified working"

### Acceptance criteria

- [ ] Dry-run on prod DB lists exactly the 6 known affected rows with the expected decisions
- [ ] After `--apply`, querying prod DB shows the 4 RESTORE_PAID rows have `status='reserved_paid'` and a matching `stripe_payment_intent_id`
- [ ] Matching `orders` rows exist for the 4 restored reservations
- [ ] Re-running the script after `--apply` reports 0 candidates (idempotent)
- [ ] Unit tests pass, including a synthetic duplicate-flagging case

### Risks

- **Race with new checkouts.** Cron is paused (Phase 1 prerequisite). Webhook is fixed (Phase 1 prerequisite). Risk of write conflicts during the script run is low.
- **Bad session_id mapping.** Test data with malformed session IDs would route to SKIP. Manual review of dry-run output catches this before `--apply`.
- **maru's duplicate refund is manual.** Script flags it; user actions the refund in the Stripe Dashboard separately.

---

## Phase 3 — Self-healing cron

**Goal:** replace the paused pg_cron job with a Vercel Cron route that verifies with Stripe before cancelling.

### Architecture: migrate from pg_cron to Vercel Cron

Three options were considered:
- **(a)** Keep pg_cron + add the `http` Postgres extension to call Stripe from plpgsql. Rejected: Stripe key in DB is awkward, plpgsql JSON parsing is painful, error handling is weak.
- **(b)** Hybrid — pg_cron triggers a Vercel Edge Function. Rejected: two moving parts to keep in sync.
- **(c)** Migrate to a Vercel Cron route. **Selected.**

Reasons to pick (c):
- Reuses existing Stripe client (`lib/stripe/client.ts`)
- TypeScript code is far easier to test than plpgsql Stripe calls
- Single language, single place to debug
- Existing Jest infra covers the new logic
- The pg_cron job is already paused in Phase 1; this phase just doesn't restart it

### Route handler

```ts
// app/api/cron/expire-unpaid-reservations/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/db/client'
import {
  cancelReservation,
  restoreReservationAsPaid,
} from '@/lib/cron/reservation-lifecycle'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: candidates } = await supabaseAdmin
    .from('reservations')
    .select('id, stripe_checkout_session_id, unit_id, customer_email, user_id, total_cents, product_id, start_date, end_date')
    .eq('status', 'reserved_unpaid')
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)

  let restored = 0, cancelled = 0, errored = 0

  for (const row of candidates ?? []) {
    try {
      if (!row.stripe_checkout_session_id) {
        await cancelReservation(row)
        cancelled++
        continue
      }
      const session = await stripe.checkout.sessions.retrieve(
        row.stripe_checkout_session_id,
      )
      if (
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
      ) {
        await restoreReservationAsPaid(row, session)
        restored++
      } else {
        await cancelReservation(row)
        cancelled++
      }
    } catch (err) {
      console.error(`[cron] expire-unpaid: error on ${row.id}`, err)
      errored++
    }
  }

  return NextResponse.json({
    processed: candidates?.length ?? 0,
    restored,
    cancelled,
    errored,
  })
}
```

### Schedule

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/expire-unpaid-reservations",
      "schedule": "0 * * * *"
    }
  ]
}
```

Hourly, matching the previous pg_cron cadence.

### Helper module

`lib/cron/reservation-lifecycle.ts` exports:

- `cancelReservation(row)` — mirrors the side-effects of the original plpgsql:
  1. Delete `reservation_units` rows
  2. Free assigned unit (`units.status = 'available'`, insert `unit_events` row)
  3. Update reservation: `status='cancelled'`, `updated_at=now()`
  4. Insert `notifications` row for the customer

- `restoreReservationAsPaid(row, session)` — mirrors `fulfillCheckoutSession()`:
  1. Update reservation: `status='reserved_paid'`, link `stripe_payment_intent_id`, `expires_at=null`
  2. Insert `orders` row
  3. Update unit status if assigned
  4. Send `bookingConfirmed` email (fire-and-forget)

### Defense-in-depth properties

- **Webhook works** → most rows flip to `reserved_paid` in seconds, never reach cron.
- **Webhook breaks again** → cron catches it within an hour and self-heals.
- **Stripe down at cron time** → `try/catch` records `errored++`, row is left alone. No data loss; next hourly run retries.
- **Stripe says `unpaid` after 24h** → genuine abandonment, cancel as before.

### Files

- `app/api/cron/expire-unpaid-reservations/route.ts` (new)
- `lib/cron/reservation-lifecycle.ts` (new) — shared helpers
- `__tests__/api/cron/expire-unpaid-reservations.test.ts` (new) — covers all branches
- `__tests__/lib/cron/reservation-lifecycle.test.ts` (new) — covers helpers
- `vercel.json` (modified — add cron entry) — leave the `vercel.ts` migration for a separate cleanup; do not couple to this phase
- `supabase/migrations/012_document_pg_cron_retirement.sql` (new) — empty migration with a SQL comment explaining the pg_cron job is permanently retired and the new owner is Vercel Cron at `/api/cron/expire-unpaid-reservations`

### Acceptance criteria

- [ ] Unit tests cover: no session, paid session, unpaid session, Stripe 404, multi-row partial failure
- [ ] Manual integration smoke test on a Vercel preview: trigger the cron route with a valid `CRON_SECRET`, verify it returns `{processed: 0}` against a clean DB
- [ ] After deploy to prod, Vercel Cron logs show hourly hits with `processed=N, restored=0, cancelled=0` once the system is healthy

### Risks

- **`CRON_SECRET` env var.** Vercel auto-generates this on first cron config. User confirms it's set in production env before merging.
- **The first cron run after Phase 3 is the first integration test of the self-heal logic in production.** Acceptable risk because the cron is fail-open: errors leave rows unchanged.

---

## Phase 4 — UI improvements

**Goal:** restore admin UX for the Actions column; add CSV export.

Two small, independent components.

### 4a. Sticky Actions column

Current behavior: adding the Event column made the table wider than typical viewports. The Actions column is rendered in the DOM but is off-screen; the user must horizontal-scroll to see Send Invoice and Delete buttons.

Fix: pin the Actions column to the right edge with `position: sticky; right: 0` on both `<th>` and `<td>`. Background color matches the row to avoid bleed-through.

```tsx
// app/admin/reservations/page.tsx
<th className="sticky right-0 bg-white/5 px-5 py-3">Actions</th>
...
<td className="sticky right-0 bg-[#0b1422] px-5 py-3 group-hover:bg-white/[0.025]">...</td>
```

The exact background hex matches the row's resolved color (alpha-blended over the page background); a small visual test post-implementation confirms no row bleed-through during scroll.

### 4b. CSV export

A new "Export CSV" button at the top of `/admin/reservations`. On click, generates a CSV from the current `rows` array client-side and triggers a download.

**Why client-side:** no new API surface, fast, and the row data is already on the page. Server-side streaming would only matter at >10k rows.

**Columns** (sufficient for accounting workflows):

```
reservation_id, customer_email, reservation_type, product_name,
event_name, event_location, status, start_date, end_date,
total_cents, total_usd, unit_assigned, stripe_session_id,
stripe_payment_intent_id, created_at, updated_at
```

**Filename:** `navo-reservations-YYYY-MM-DD.csv`

### Files

- `app/admin/reservations/page.tsx` (modified — sticky column classes; new ExportCsvButton import)
- `app/admin/reservations/ExportCsvButton.tsx` (new) — client component; serializes rows to CSV; uses `Blob` + `URL.createObjectURL` for download
- `__tests__/components/admin/ExportCsvButton.test.tsx` (new) — asserts the button click produces a Blob with expected CSV header row + first data row
- `__tests__/app/admin/reservations.test.tsx` (modified — add assertion that Actions column header has `sticky` class; add assertion that ExportCsvButton renders)

### Acceptance criteria

- [ ] At standard 1440px viewport, Actions column is visible without scroll
- [ ] At narrow 1024px viewport, Actions column remains pinned to right edge during horizontal scroll
- [ ] CSV download produces a file with a header row, one row per reservation, and ISO-8601 timestamps
- [ ] Tests pass

### Risks

- **Sticky column on Safari with overflow-x-auto requires care.** Verified pattern: `<table>` wrapper has `overflow-x-auto`, sticky cells use `position: sticky; right: 0; z-index: 1; background: <opaque>`. Without an opaque background the underlying scrolled cells bleed through.

---

## Phase 5 — Testing framework

**Goal:** a green test suite is the user's signal that the system works end-to-end. Tests double as health checks.

Two components: a Playwright CI test and a GitHub Actions scheduled webhook probe.

### 5a. Playwright CI E2E for `rental_event` happy path

Runs on every PR. Uses Stripe Test Mode so no real charges occur.

**Test flow:**
1. Navigate to `/reserve` on the deployed preview URL
2. Sign in (test user via NextAuth credentials)
3. Pick a rental event from a known seeded fixture
4. Fill sail number and submit
5. Assert redirect to Stripe Checkout
6. Fill `4242 4242 4242 4242` test card in Stripe-hosted Checkout (Playwright frame interaction)
7. Submit payment, follow redirect to `/checkout/success`
8. Hit the admin API directly with an admin-token: `GET /api/admin/reservations` and assert the new reservation has `status='reserved_paid'` and a `stripe_payment_intent_id`
9. Assert one row in `stripe_events` with the right `event_type` (queried via Supabase service-role from the test runner)

**Setup:**
- Playwright config currently targets `https://navomarine.com` (production). Phase 5a updates it to use a `BASE_URL` env var, defaulted to a preview URL in CI.
- A new "Test Event" fixture is seeded into the dev Supabase branch by a setup hook before the test runs.
- An admin test user is provisioned with a known email in dev DB.

**Files:**
- `playwright.config.ts` (modified — `BASE_URL` env, base config split between local/CI)
- `e2e/rental-event-happy-path.spec.ts` (new)
- `e2e/fixtures/seed-test-event.ts` (new) — seeds + tears down a test rental event
- `.github/workflows/e2e.yml` (new) — runs Playwright on PRs against the dev preview URL
- `package.json` (modified — adds `test:e2e:ci` script that uses CI config)

### 5b. GHA scheduled webhook probe

Runs hourly (`0 * * * *`) via `.github/workflows/webhook-probe.yml`. Independent of the production stack (true external observer).

**Probe flow:**
1. Use Stripe API in test mode to create a test `checkout.session.completed` event payload
2. Sign the payload with the **test-mode** webhook signing secret
3. POST to `https://navomarine.com/api/webhooks/stripe` (production webhook URL — but using **test-mode signature verification**)

   **Concern:** the production webhook handler verifies signatures with the **live-mode** secret (`STRIPE_WEBHOOK_SECRET`). A test-signed event would fail verification on prod. Two options:

   **Option A:** Add a separate test-mode webhook in Stripe Dashboard pointing at the same URL. The handler accepts both live and test-mode signatures (compare against either secret). Probe uses the test secret. Adds slight code complexity.

   **Option B:** The probe POSTs to a dedicated `/api/_health/webhook-probe` endpoint that does its own signature check using a probe-specific shared secret. This is functionally a synthetic version of the webhook handler — covers the "is the route reachable, is the env var set, can it write to stripe_events" properties. Doesn't catch a misconfigured Stripe Dashboard.

   **Decision:** **Option B** — simpler, less coupling to Stripe's mode duality, and the Stripe Dashboard misconfiguration class of bug is caught by the Phase 1 runbook + the structured logging. The probe specifically guards the post-deploy "is the webhook handler still reachable + writing to stripe_events" property.

4. Wait 60 seconds
5. Query `https://navomarine.com/api/_health/stripe-events-recency` (read-only endpoint, returns `{ last_event_at, count_24h }`, protected by the same probe token)
6. Assert `last_event_at` is within the last 5 minutes
7. On any assertion failure, send an email via Resend to `dgo.scbr@gmail.com` and `info@navomarine.com`

**Files:**
- `app/api/_health/webhook-probe/route.ts` (new) — accepts probe-signed POST, writes to `stripe_events` with a special `event_type='probe.synthetic'`
- `app/api/_health/stripe-events-recency/route.ts` (new) — returns last event timestamp; protected by `PROBE_TOKEN` env var
- `.github/workflows/webhook-probe.yml` (new) — hourly cron + Resend notification step
- `lib/cron/probe.ts` (new) — shared signing/verification logic
- `__tests__/api/_health/webhook-probe.test.ts` (new)
- `__tests__/api/_health/stripe-events-recency.test.ts` (new)

### Email alerting via Resend

GHA workflow uses Resend's HTTP API directly (no SDK; `curl` step):

```yaml
- name: Notify on failure
  if: failure()
  run: |
    curl -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${{ secrets.RESEND_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d '{
        "from": "alerts@navomarine.com",
        "to": ["dgo.scbr@gmail.com", "info@navomarine.com"],
        "subject": "🚨 NAVO webhook probe failed",
        "text": "GitHub Actions run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
      }'
```

**Prerequisites the user provides:**
- Resend account + verified `navomarine.com` domain
- `RESEND_API_KEY` added to GitHub Actions secrets
- `PROBE_TOKEN` generated and added to both Vercel production env and GHA secrets

### Acceptance criteria

- [ ] Playwright `rental-event-happy-path.spec.ts` passes against a preview URL in CI on every PR
- [ ] GHA workflow `webhook-probe.yml` runs hourly and is green for at least 24 consecutive hours after Phase 1+2+3 land
- [ ] Forcing a deliberate failure (set `PROBE_TOKEN` to wrong value temporarily) results in an email at both addresses within 5 minutes
- [ ] The endpoints `/api/_health/webhook-probe` and `/api/_health/stripe-events-recency` return 401 without `PROBE_TOKEN`

### Risks

- **`stripe_events` table accumulates probe rows.** ~24 rows/day = ~9k/year. Negligible storage. If desired, add a daily cleanup that deletes rows where `event_type='probe.synthetic'` older than 7 days. Not in scope for v1.
- **Probe false-positives during prod deploys.** A deploy mid-probe could cause a transient 502 and trigger an alert. Acceptable noise; tune retries if it becomes a problem.
- **Domain verification for Resend.** The user has to verify `navomarine.com` in Resend before the alerts will deliver. Documented in the runbook.

---

## Risk register (consolidated)

| Risk | Phase | Mitigation |
|---|---|---|
| Cron permanently off, unpaid rows accumulate | 1 | Phase 3 re-introduces lifecycle as Vercel Cron with self-heal |
| User cannot complete webhook config without Stripe Dashboard + Vercel access | 1 | Runbook is exhaustive; structured logs make diagnosis explicit |
| Backfill applied with broken webhook re-cancels rows | 2 | Runbook prerequisite: webhook config verified working |
| Currency or test-data anomalies in production sessions | 2 | Dry-run + sanity guards; manual review before `--apply` |
| `CRON_SECRET` not set when Phase 3 deploys | 3 | Pre-merge checklist; route returns 401 (visible failure, not silent) |
| Stripe rate limits during cron | 3 | Hourly cadence × ~6 candidates max = trivial; rate limit unreachable |
| Sticky column bleeding through on Safari | 4 | Opaque background + visual smoke-test |
| Probe false-positives | 5 | Acceptable noise; tune retries if needed |
| Resend domain not verified | 5 | Documented as user prerequisite |

## Open questions / future work (deferred)

- Per-reservation PDF receipt (deferred — not in this scope)
- Tracer tests for `rental_custom`, `regatta_package`, `purchase` (deferred — `rental_event` only for v1)
- Slack/SMS alerting (deferred — email-only for v1)
- Migration from `vercel.json` to `vercel.ts` (deferred — separate cleanup PR)
- Probe synthetic-event cleanup job (deferred — storage is negligible)
- Surface the "system is healthy" signal to user (e.g., a green dot in admin nav) — not in v1 scope

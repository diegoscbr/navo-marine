# Reservation Webhook Recovery — Phase 1 (Hotfix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop new paid customers from being phantom-cancelled, and give the user diagnostic visibility for the webhook config fix they'll perform in Stripe Dashboard + Vercel env.

**Architecture:** Three independent components shipped together in one PR:
1. A Supabase migration that unschedules the hourly pg_cron job that auto-cancels `reserved_unpaid` rows past `expires_at` (the cron itself is correct; it's running while the upstream webhook is silently broken).
2. Structured `console.log` lines (prefix `[webhook]`) at each major step of the Stripe webhook handler so the user can read Vercel function logs and pinpoint which step is failing during their config fix.
3. A runbook documenting the Stripe Dashboard + Vercel env-var checks the user will perform after the code lands.

**Tech Stack:** Supabase (pg_cron), Next.js App Router (Route Handlers), Stripe SDK, TypeScript, Jest. No new dependencies.

**Spec reference:** `docs/plans/2026-04-29-reservation-webhook-recovery-design.md` § Phase 1.

**Estimated time:** 2-3 hours including diagnosis-by-user via runbook.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/011_pause_expire_unpaid_cron.sql` | NEW | Unschedule the pg_cron job; keep function definition intact for reference |
| `app/api/webhooks/stripe/route.ts` | MODIFY | Add `[webhook]` structured log lines at request entry, signature step, idempotency step, and dispatch |
| `lib/stripe/webhook.ts` | MODIFY | Add `[webhook]` structured log lines at each step of `fulfillCheckoutSession()` and at `isEventAlreadyProcessed`/`logStripeEvent` |
| `docs/runbooks/stripe-webhook.md` | NEW | Step-by-step the user follows after merge to verify Stripe Dashboard config + Vercel env var |
| `__tests__/api/webhooks/stripe.test.ts` | NO CHANGE | Existing tests pass without modification (logging is `console.log`, RTL/Jest don't assert on log output) |

No new TypeScript files, no new tests, no new dependencies, no new endpoints.

---

## Pre-flight: verify state and confirm cron job name

### Task 0: Confirm pg_cron job name on production

**Files:** none (read-only DB query)

The migration we'll write (`011_pause_expire_unpaid_cron.sql`) calls `cron.unschedule('<job-name>')`. The job name is set when the schedule is created — we have the function definition in migration `010` but I haven't seen the `cron.schedule()` call. The job might be named `expire-unpaid-reservations`, `expire_unpaid_reservations`, or something else entirely.

- [ ] **Step 1:** Query the prod Supabase via the MCP tool to find the unpaid-expiry cron job. Filter by command rather than relying on the job name, so we pick the right job even if other unrelated cron jobs exist on this project.

```
Tool: mcp__supabase__execute_sql
project_id: fdjuhjadjqkpqnpxgmue
query: SELECT jobid, schedule, command, jobname FROM cron.job WHERE command LIKE '%expire_unpaid_reservations%';
```

Expected: exactly one row whose `command` references `expire_unpaid_reservations()`. Record the exact value of `jobname`.

- [ ] **Step 2:** If the query returns 0 rows, the schedule has already been removed — skip Task 2 and mark this phase as no-op for the migration. If it returns 2+ rows (unlikely but possible), inspect each `command` to identify which is the production scheduler call and use that row's `jobname`.

- [ ] **Step 3:** No commit yet — this is a discovery step.

---

## Task 1: Branch off main and verify working tree

**Files:** none (git operations only)

Hotfix should ship to main directly. Branching off main avoids dragging unrelated dev-branch commits (dead-code cleanup, design doc) into the hotfix PR.

- [ ] **Step 1:** Make sure no uncommitted work is lost. Save the current state of the working tree if needed.

```bash
git status -s
```

If there are uncommitted changes in `e2e/storefront.spec.ts` or `docs/plans/2026-04-29-reservation-webhook-recovery-design.md`, stash them:

```bash
git stash push -m "WIP before hotfix branch"
```

- [ ] **Step 2:** Switch to main and pull the latest from origin.

```bash
git checkout main && git pull origin main
```

Note: if SSH push/pull is blocked in this environment, the user pulls manually — flag this and pause for confirmation that local main matches origin main before continuing.

- [ ] **Step 3:** Create a hotfix branch off main.

```bash
git checkout -b hotfix/webhook-cron-pause
```

- [ ] **Step 4:** Confirm clean state.

```bash
git status -s
```

Expected: no output (clean working tree on `hotfix/webhook-cron-pause`).

---

## Task 2: Write and apply the pause-cron migration

**Files:**
- Create: `supabase/migrations/011_pause_expire_unpaid_cron.sql`

The migration unschedules the hourly job. The function definition stays in place (for reference and for re-enable when Phase 3 is ready). The `expire_unpaid_reservations()` function continues to exist in the DB but nothing calls it.

- [ ] **Step 1:** Create the migration file.

```bash
mkdir -p supabase/migrations
```

Write `supabase/migrations/011_pause_expire_unpaid_cron.sql` with this exact content (replace `<JOBNAME>` with the value confirmed in Task 0 Step 1):

```sql
-- Pauses the unpaid-reservation expiry job until Phase 3 replaces it
-- with a Vercel Cron route that verifies with Stripe before cancelling.
-- The function expire_unpaid_reservations() remains defined for reference;
-- only the schedule is removed.
--
-- Background: the webhook handler in production has been silently failing
-- signature verification, leaving paid reservations in `reserved_unpaid`
-- state until this cron flipped them to `cancelled`. With the cron paused,
-- new paid customers can no longer be phantom-cancelled. Phase 3 introduces
-- a Vercel Cron route that consults Stripe before cancelling, providing
-- defense-in-depth so this bug class cannot recur.

SELECT cron.unschedule('<JOBNAME>');
```

- [ ] **Step 2:** Pause and ask the user to confirm before applying to production.

Show the user the migration content and the project ID, then ask:

> "Ready to apply this migration to production Supabase project `fdjuhjadjqkpqnpxgmue`? This will permanently unschedule the cron job until Phase 3. Reply 'apply' to proceed."

Wait for explicit `apply`. Do not skip this step. Production-DB writes require confirmation.

- [ ] **Step 3:** After confirmation, apply via the MCP tool.

```
Tool: mcp__supabase__apply_migration
project_id: fdjuhjadjqkpqnpxgmue
name: 011_pause_expire_unpaid_cron
query: <the SQL from Step 1>
```

Expected: success response.

- [ ] **Step 4:** Verify the schedule is removed.

```
Tool: mcp__supabase__execute_sql
project_id: fdjuhjadjqkpqnpxgmue
query: SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid;
```

Expected: the `<JOBNAME>` row is gone. If any rows remain, they are unrelated jobs (audit and confirm before continuing).

- [ ] **Step 5:** Commit.

```bash
git add supabase/migrations/011_pause_expire_unpaid_cron.sql
git commit -m "fix: pause expire_unpaid_reservations cron until webhook restored

Stops the hourly pg_cron sweep that has been auto-cancelling reservations
whose payments succeeded in Stripe but whose status never flipped from
reserved_unpaid to reserved_paid (because the production webhook has been
silently failing signature verification).

The function expire_unpaid_reservations() remains defined; only the
schedule is removed. Phase 3 of the recovery plan introduces a Vercel
Cron route that verifies with Stripe before cancelling.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 3: Add structured logging to the webhook route handler

**Files:**
- Modify: `app/api/webhooks/stripe/route.ts`

The route currently does `console.error` on signature failure but logs nothing on success. We add a single line per major step with a consistent `[webhook]` prefix so the Vercel function log is grep-friendly.

- [ ] **Step 1:** Read the current state of the file to confirm line numbers and structure.

```bash
cat app/api/webhooks/stripe/route.ts
```

- [ ] **Step 2:** Replace the file with the new version below. The behavior is identical — only logging is added.

`app/api/webhooks/stripe/route.ts`:

```typescript
// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import {
  isEventAlreadyProcessed,
  logStripeEvent,
  fulfillCheckoutSession,
} from '@/lib/stripe/webhook'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body — required for Stripe signature verification
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    console.error('[webhook] sig=fail reason=missing-stripe-signature-header')
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // 2. Verify webhook signature
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[webhook] sig=fail reason=${message}`)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    )
  }

  console.log(`[webhook] received id=${event.id} type=${event.type}`)
  console.log(`[webhook] sig=ok`)

  // 3. Idempotency — skip if already processed
  const alreadyProcessed = await isEventAlreadyProcessed(event.id)
  if (alreadyProcessed) {
    console.log(`[webhook] idempotent=skipped event_id=${event.id}`)
    return NextResponse.json({ skipped: true })
  }
  console.log(`[webhook] idempotent=new`)

  // 4. Handle event types
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const result = await fulfillCheckoutSession(session)

      if (!result.ok) {
        console.error(`[webhook] fulfill=fail error=${result.error}`)
        // Return 500 so Stripe retries the webhook
        // Do NOT log the event — prevents retry-skipping if fulfillment fails
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      console.log(`[webhook] fulfill=ok orderId=${result.orderId}`)

      // 5. Log AFTER fulfillment succeeds — prevents retry-skipping on partial failure
      await logStripeEvent(event)

      return NextResponse.json({ received: true, orderId: result.orderId })
    }

    default:
      // Log unhandled events for audit, then acknowledge
      console.log(`[webhook] dispatch=default-passthrough type=${event.type}`)
      await logStripeEvent(event)
      return NextResponse.json({ received: true })
  }
}
```

- [ ] **Step 3:** Run the existing webhook test to verify nothing broke.

```bash
npm test -- __tests__/api/webhooks/stripe.test.ts
```

Expected: PASS. The existing tests don't assert on log output, so the additional `console.log` calls don't affect test outcomes.

- [ ] **Step 4:** Commit.

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat: add structured [webhook] logs to stripe route handler

Single-line, prefix-tagged logs at each major step (received,
sig=ok/fail, idempotent=skipped/new, fulfill=ok/fail) so the
Vercel function log is greppable during the webhook config fix.

No behavior change. Existing tests pass unchanged.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 4: Add structured logging to the fulfillment helper

**Files:**
- Modify: `lib/stripe/webhook.ts`

The fulfillment path inside `fulfillCheckoutSession()` has multiple places where the operation can fail. Adding a `[webhook] fulfill=fail step=...` line at each failure point makes it possible to read the Vercel logs during the user's diagnostic step and immediately know whether the lookup failed, the update failed, or the order insert failed.

- [ ] **Step 1:** Read the current state of the file to confirm line numbers.

```bash
cat lib/stripe/webhook.ts
```

- [ ] **Step 2:** Modify the file. The only change is adding `console.log` / `console.error` calls — no behavior change.

Replace the body of `fulfillCheckoutSession` (starting at line 59, the function declaration) with:

```typescript
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const sessionId = session.id
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  console.log(`[webhook] fulfill=start sessionId=${sessionId} paymentIntentId=${paymentIntentId ?? 'none'}`)

  // 1. Find the reservation by stripe_checkout_session_id
  const { data: reservation, error: resErr } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, unit_id, total_cents, customer_email, product_id, start_date, end_date')
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (resErr || !reservation) {
    const reason = resErr?.message ?? 'reservation row not found'
    console.error(`[webhook] fulfill=fail step=reservation-lookup sessionId=${sessionId} error=${reason}`)
    return { ok: false, error: `Reservation not found for session ${sessionId}` }
  }

  const reservationId = (reservation as { id: string }).id
  console.log(`[webhook] fulfill=lookup-ok reservationId=${reservationId}`)

  // 2. Update reservation to reserved_paid
  const { error: updateErr } = await supabaseAdmin
    .from('reservations')
    .update({
      status: 'reserved_paid',
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)

  if (updateErr) {
    console.error(`[webhook] fulfill=fail step=reservation-update reservationId=${reservationId} error=${updateErr.message}`)
    return { ok: false, error: `Failed to update reservation: ${updateErr.message}` }
  }

  // 3. Create order record (before unit update to minimize partial-failure window)
  const orderNumber = generateOrderNumber()
  const shippingAddress = toShippingAddress(session)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: (reservation as { user_id: string }).user_id,
      customer_email:
        (reservation as { customer_email: string }).customer_email ??
        session.customer_email ??
        '',
      reservation_id: reservationId,
      shipping_address: shippingAddress,
      status: 'paid',
      subtotal_cents: (reservation as { total_cents: number }).total_cents,
      tax_cents: 0,
      total_cents: (reservation as { total_cents: number }).total_cents,
      currency: 'usd',
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
    })
    .select('id')
    .single()

  if (orderErr) {
    console.error(`[webhook] fulfill=fail step=order-insert reservationId=${reservationId} error=${orderErr.message}`)
    return { ok: false, error: `Failed to create order: ${orderErr.message}` }
  }

  const orderId = (order as { id: string }).id
  console.log(`[webhook] fulfill=order-ok orderId=${orderId} orderNumber=${orderNumber}`)

  // 4. Update unit status if a unit was assigned (non-critical after order creation)
  if ((reservation as { unit_id: string | null }).unit_id) {
    const { error: unitErr } = await supabaseAdmin
      .from('units')
      .update({ status: 'reserved_paid' })
      .eq('id', (reservation as { unit_id: string }).unit_id)

    if (unitErr) {
      console.error(`[webhook] fulfill=warn step=unit-update unitId=${(reservation as { unit_id: string }).unit_id} error=${unitErr.message}`)
      // Non-fatal: order was already created, reservation is paid. Log and continue.
    }
  }

  // 5. Send booking confirmed email (fire-and-forget)
  const productId = (reservation as { product_id: string | null }).product_id
  const { data: productRow } = productId
    ? await supabaseAdmin.from('products').select('name').eq('id', productId).single()
    : { data: null }

  const confirmedEmail = bookingConfirmed({
    to:
      (reservation as { customer_email: string }).customer_email ??
      session.customer_email ??
      '',
    reservationId,
    orderId,
    productName: (productRow as { name: string } | null)?.name ?? 'NAVO Rental',
    startDate: (reservation as { start_date: string | null }).start_date ?? null,
    endDate: (reservation as { end_date: string | null }).end_date ?? null,
    totalCents: (reservation as { total_cents: number }).total_cents,
  })
  void sendEmail(confirmedEmail.to, confirmedEmail.subject, confirmedEmail.html)
    .catch((err) => console.error(`[webhook] fulfill=warn step=email-send error=${err}`))

  return { ok: true, orderId }
}
```

- [ ] **Step 3:** Run the existing webhook tests.

```bash
npm test -- __tests__/api/webhooks/stripe.test.ts
```

Expected: PASS.

- [ ] **Step 4:** Run the full test suite to confirm no other tests broke.

```bash
npm test -- --silent
```

Expected: 304 tests pass (or whatever the current count is — confirm by comparing to the count before this PR).

- [ ] **Step 5:** Commit.

```bash
git add lib/stripe/webhook.ts
git commit -m "feat: add structured [webhook] logs to fulfillCheckoutSession

Logs each step of fulfillment with a consistent prefix so the Vercel
function log makes it obvious which step failed during diagnosis.
Steps logged: start, lookup-ok, order-ok, fulfill=fail step=<name>,
warn for non-fatal unit-update / email-send errors.

No behavior change. Existing tests pass unchanged.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 5: Write the runbook

**Files:**
- Create: `docs/runbooks/stripe-webhook.md`

The runbook the user will follow after merge. Self-contained — assumes nothing about prior knowledge.

- [ ] **Step 1:** Create the runbook directory if it doesn't already exist, and create the runbook file.

```bash
mkdir -p docs/runbooks
```

Write `docs/runbooks/stripe-webhook.md` with this exact content:

````markdown
# Stripe Webhook Diagnosis & Fix

> **When to use this runbook:** the production Stripe webhook is suspected to be silently failing — paying customers' reservations are stuck in `reserved_unpaid` (or being auto-cancelled by cron) instead of flipping to `reserved_paid` after payment.

## Background

The webhook handler at `app/api/webhooks/stripe/route.ts` verifies a signature on each incoming Stripe event using `STRIPE_WEBHOOK_SECRET` from the Vercel production environment. If verification fails, the function returns 400 and Stripe retries for up to 3 days, then gives up. The reservation row stays in `reserved_unpaid` and (with cron enabled) gets cancelled 24h after creation.

After the Phase 1 hotfix lands, the function logs every step with a `[webhook]` prefix. That log line is your primary diagnostic.

## The procedure

### 1. Open Stripe Dashboard → Developers → Webhooks

Confirm the production endpoint exists with these properties:
- **URL:** `https://navomarine.com/api/webhooks/stripe`
- **Status:** Enabled
- **Mode:** **Live** (not test)
- **Events sent:** at minimum, `checkout.session.completed`

If any of these are wrong, fix them. If no endpoint exists, create one with the URL above and subscribe to `checkout.session.completed`.

### 2. Copy the signing secret

Click the endpoint → "Signing secret" → reveal → copy the `whsec_...` value.

### 3. Open Vercel → Project → Settings → Environment Variables

Filter for `STRIPE_WEBHOOK_SECRET` in the Production scope. The value should match the secret you just copied.

If the value is empty, missing from production, or different from what Stripe shows: update it.

### 4. Redeploy

If you updated the env var, Vercel needs a redeploy for it to take effect. Either:
- Push any commit to `main` (triggers a deploy automatically), or
- In the Vercel project, click the latest production deploy → "..." → Redeploy.

### 5. Send a test event

In the Stripe Dashboard, on the webhook endpoint page, click "Send test event" → choose `checkout.session.completed` → Send.

### 6. Read the Vercel function log

Open the Vercel project → Logs → filter to function logs for `/api/webhooks/stripe` within the last 5 minutes.

You're looking for lines starting with `[webhook]`. Use this decision tree to interpret what you see:

```
[ Send test event from Stripe Dashboard ]
                │
                ▼
[ Open Vercel logs · filter /api/webhooks/stripe · last 5 min ]
                │
        ┌───────┼─────────────────────┬────────────────────┐
        ▼       ▼                     ▼                    ▼
  No [webhook]  [webhook] sig=fail   [webhook] sig=ok     [webhook] sig=ok
  lines at all   reason=...          fulfill=fail         fulfill=ok
        │           │                step=reservation-       │
        │           │                  lookup                │
        ▼           ▼                  │                     ▼
  Stripe isn't   Secret mismatch       ▼                ✓ Real customer
  reaching the   or rotated key      ✓ Webhook is        flow worked
  endpoint       (most common)         working
        │           │                (test event has
        ▼           ▼                no matching
  URL/DNS issue  Repeat from         reservation —
  or endpoint    step 2 (copy        that's expected)
  disabled       fresh secret)         │
        │           │                  ▼
        ▼           ▼              You're done.
  Repeat from    Confirm Vercel
  step 1         redeploy picked
  (verify URL    up the new env
  + enabled)     var
```

Same outcomes in table form for quick reference:

| Log line | What it means | Next step |
|---|---|---|
| `[webhook] sig=ok` followed by `[webhook] fulfill=fail step=reservation-lookup ...` | **Webhook is working.** The test event is synthetic and has no matching reservation in your DB, so the lookup correctly fails. The webhook would succeed for a real Checkout completion. | You're done. |
| `[webhook] sig=fail reason=No signatures found matching the expected signature for payload` | The signing secret in Vercel doesn't match Stripe's. | Repeat from step 2. |
| `[webhook] sig=fail reason=...` (any other reason) | Some other signature problem (clock skew, unusual character in secret, etc.). | Read the reason, fix accordingly. |
| **No `[webhook]` lines at all** | Stripe isn't reaching the function. URL is wrong, DNS is wrong, or the endpoint is disabled in Stripe. | Repeat from step 1. |

### 7. Verify with a real test (optional)

Once `[webhook] sig=ok` appears for a test event, you can verify with a real flow:
1. From an incognito browser, navigate to `/reserve` on production
2. Pick an event, fill the form, submit
3. Pay with a Stripe test card (use Stripe's "test mode" in the Vercel preview if you don't want to run a real charge)
4. Check the Vercel log within 30s for `[webhook] fulfill=ok orderId=...`
5. Check `/admin/reservations` — the new row should be `reserved_paid` with a Send Invoice button gone (replaced by trash-only) and stripe_payment_intent_id linked

### Common gotchas

- **Live vs test mode in Stripe Dashboard.** The two modes have separate webhook endpoints with separate signing secrets. Confirm the live-mode endpoint matches the live-mode secret in Vercel. If you're testing with a test-mode card on a live-mode endpoint, the webhook won't fire (different mode entirely).
- **Old preview deploys can have stale env vars.** Always test against production (`navomarine.com`), not a preview URL, when diagnosing the live webhook.
- **Stripe takes a few seconds to deliver test events.** If the log is empty, wait 30s and refresh before assuming nothing happened.
- **Vercel function log retention.** Logs older than ~1 hour may be evicted on lower plans. Test fresh after redeploy.

### After diagnosis is complete

Once `[webhook] sig=ok` is confirmed for live mode in production, you're ready for **Phase 2: backfill** of the affected customers. See `docs/plans/2026-04-29-reservation-webhook-recovery-design.md` § Phase 2.

## What this runbook does NOT cover

- Restoring already-cancelled customers — that's Phase 2 (backfill script).
- Re-enabling the cron job — that's Phase 3 (Vercel Cron route with self-healing Stripe verification).
- The full design rationale — see `docs/plans/2026-04-29-reservation-webhook-recovery-design.md`.
````

- [ ] **Step 2:** Commit.

```bash
git add docs/runbooks/stripe-webhook.md
git commit -m "docs: add Stripe webhook diagnosis runbook

Step-by-step procedure for confirming the production Stripe webhook
endpoint is configured correctly and diagnosing the [webhook] log lines
added in this PR.

Spec: docs/plans/2026-04-29-reservation-webhook-recovery-design.md"
```

---

## Task 6: Final verification before pushing

**Files:** none (read-only checks)

- [ ] **Step 1:** Confirm full test suite is green.

```bash
npm test -- --silent 2>&1 | tail -8
```

Expected: `Test Suites: 57 passed, 57 total` (or current count) and `Tests: <N> passed, <N> total`. No failures.

- [ ] **Step 2:** Review the diff vs main.

```bash
git diff main..HEAD --stat
```

Expected: 4 files changed:
- `supabase/migrations/011_pause_expire_unpaid_cron.sql` (new)
- `app/api/webhooks/stripe/route.ts` (modified)
- `lib/stripe/webhook.ts` (modified)
- `docs/runbooks/stripe-webhook.md` (new)

If any other files appear in the diff, investigate before pushing.

- [ ] **Step 3:** Re-confirm the cron is paused on prod.

```
Tool: mcp__supabase__execute_sql
project_id: fdjuhjadjqkpqnpxgmue
query: SELECT jobid, jobname FROM cron.job;
```

Expected: no row for the unpaid-expiry job.

---

## Task 7: Push and open PR

**Files:** none (git operations only)

- [ ] **Step 1:** Push the hotfix branch to origin.

```bash
git push -u origin hotfix/webhook-cron-pause
```

If SSH push fails (recurring issue in this environment), inform the user and pause for them to push manually.

- [ ] **Step 2:** Open a PR targeting main, not dev. This is a hotfix and should land directly on production.

```bash
gh pr create --base main --head hotfix/webhook-cron-pause \
  --title "hotfix: pause cron + structured webhook logs (Phase 1 of recovery)" \
  --body "$(cat <<'EOF'
## Summary

Phase 1 of the reservation webhook recovery plan. Stops new paid customers from being phantom-cancelled and adds the diagnostic visibility needed for the manual webhook config fix.

**Three components:**

1. **Migration `011_pause_expire_unpaid_cron.sql`** — unschedules the hourly pg_cron job that has been auto-cancelling reservations whose Stripe payment succeeded but whose status never flipped from `reserved_unpaid` to `reserved_paid` (because the production webhook has been silently failing signature verification). The function definition stays intact for reference.
2. **Structured `[webhook]` logs** in `app/api/webhooks/stripe/route.ts` and `lib/stripe/webhook.ts` — every major step of webhook handling now emits a single greppable line so the Vercel function log makes it obvious which step is failing.
3. **Runbook** at `docs/runbooks/stripe-webhook.md` — step-by-step Stripe Dashboard + Vercel env var verification, paired with the new log lines.

## Side effects to know

- **Cron is permanently off until Phase 3.** While paused, `reserved_unpaid` rows accumulate in admin. User has agreed to manually delete unpaid rows via the existing trash button until Phase 3 ships a Vercel Cron replacement with self-healing Stripe verification.
- **Affected customers are NOT restored in this PR.** That's Phase 2 (backfill script). Order: Phase 1 → user fixes webhook config via runbook → Phase 2 backfills.

## Test plan

- [x] Migration applied to production Supabase project `fdjuhjadjqkpqnpxgmue` and verified (`SELECT * FROM cron.job` shows no unpaid-expiry job)
- [x] `npm test` — full suite passes
- [x] Diff is exactly 4 files (new migration + new runbook + 2 modified handlers)
- [ ] After merge, user follows `docs/runbooks/stripe-webhook.md` to verify and fix Stripe Dashboard + Vercel env var
- [ ] User sends a test event from Stripe Dashboard and confirms `[webhook] sig=ok` appears in Vercel logs

## Spec

`docs/plans/2026-04-29-reservation-webhook-recovery-design.md` § Phase 1
EOF
)"
```

- [ ] **Step 3:** Note the PR URL returned. Surface it to the user.

---

## Acceptance criteria (recap from spec)

- [x] `npm test` passes
- [x] Migration applied and verified via `SELECT * FROM cron.job` (no unpaid-expiry job)
- [ ] After deploy, sending a test event from Stripe Dashboard produces visible `[webhook] sig=ok` line in Vercel logs (user-driven verification)

---

## Out of scope (deferred to subsequent phases)

| Item | Phase |
|---|---|
| Backfill of the 6 phantom-cancelled rows | 2 |
| Self-healing cron via Vercel Cron route | 3 |
| Sticky Actions column + CSV export | 4 |
| Playwright E2E + GHA scheduled probe + Resend alerts | 5 |

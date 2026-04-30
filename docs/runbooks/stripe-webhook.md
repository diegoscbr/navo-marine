
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

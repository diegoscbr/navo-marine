# TODOS

## P1 — Critical (do before or during implementation)

### [P1] Mandatory auth guard pattern in CLAUDE.md
**What:** Document that every new API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. Add a code review checklist item.
**Why:** The spec removes Supabase RLS entirely (NextAuth incompatibility with `auth.uid()`). The service role key bypasses all DB policies. If any API route skips the session check, the entire database is exposed with no fallback. This is a conscious tradeoff — not an oversight — and needs a permanent reminder for every future engineer.
**How to apply:** Update `CLAUDE.md` under Architecture → Auth System. Add: "CRITICAL: Every API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. There is no RLS fallback — the service role key is the only gate."
**Effort:** S | **Blocked by:** nothing

### [P1] Webhook state machine integration tests
**What:** Integration tests (Jest + Supabase test project) for the Stripe webhook handler: (a) `checkout.session.completed` → reservation `reserved_paid` + order created, (b) duplicate event is a no-op, (c) unknown `reservation_type` in metadata logs + returns 200, (d) partial transaction rolled back on failure.
**Why:** The webhook is the most critical codepath — it creates orders and confirms payments. Broken webhook = no revenue. E2E tests with a live Stripe account are slow and brittle for CI. Integration tests with a real test Supabase project catch the failure modes that matter.
**How to apply:** Write alongside Phase 4 webhook implementation. Use `stripe.webhooks.generateTestHeaderString` to construct mock signed webhook payloads.
**Effort:** M | **Blocked by:** Phase 4 webhook implementation

---

## P2 — Important (address before launch)

### [P2] Order number generation strategy
**What:** Pick and implement a non-sequential, human-readable order number format (e.g., `NM-20260316-A3K7` — date prefix + 4 random alphanumeric chars) and add a Postgres function or application-layer generator.
**Why:** Sequential integers (1, 2, 3) leak business volume and are guessable. Customers calling support need a short, readable reference — not a UUID.
**How to apply:** Add a Postgres function `generate_order_number()` called on `orders` INSERT, or generate in the Next.js API route before inserting. Add a unique index on `orders.order_number`. Document the format in the spec under Section 5.5.
**Effort:** S | **Blocked by:** Phase 3 (orders table creation)

### [P2] Gmail service account key rotation runbook
**What:** Document: (1) how to rotate the Gmail service account key, (2) how to update the `GMAIL_SERVICE_ACCOUNT_KEY` env var in Vercel without downtime, (3) how to verify email still works after rotation, (4) what to do if the key is leaked (revoke in Google Console → rotate → redeploy).
**Why:** The full JSON service account key is stored as an env var. If it leaks (error reporter, log aggregator, accidental commit), you need to rotate it quickly under pressure. Without a runbook, this becomes a chaotic incident.
**How to apply:** Write `docs/runbooks/gmail-key-rotation.md` alongside Phase 6 Gmail API setup.
**Effort:** S | **Blocked by:** Phase 6 (Gmail API setup)

### [P2] Add missing DB indexes to migrations
**What:** The following composite indexes are needed for production query performance but not specified in the schema:
- `reservations(event_id, product_id, status)` — availability count query
- `reservations(date_window_id, product_id, status)` — availability count query
- `reservations(user_id)` — customer dashboard listing
- `reservations(expires_at, status)` — pg_cron expiry query
- `notifications(user_id, read)` — bell icon unread count
- `unit_events(unit_id, created_at)` — audit log per unit
**Why:** The availability count query runs on every checkout. Without a composite index, it full-scans the reservations table.
**How to apply:** Add all indexes to the Phase 1 migration SQL.
**Effort:** S | **Blocked by:** Phase 1 (schema migration)

### [P2] `date_window_allocations` inventory_status parity
**What:** `rental_event_products` has `inventory_status` (in_stock / inventory_on_the_way / out_of_stock) for admin messaging. `date_window_allocations` does not. If admin wants to show "Inventory On the Way" for a custom date rental window, there's no mechanism.
**Why:** Inconsistency between the two rental types creates a maintenance trap — future engineers will expect parity and be confused by its absence.
**How to apply:** Either (a) add `inventory_status text check in ('in_stock','inventory_on_the_way','out_of_stock') not null default 'in_stock'` to `date_window_allocations`, or (b) explicitly document "date windows always show as in_stock" in the spec.
**Effort:** XS | **Blocked by:** Phase 1 (schema migration)

---

## P3 — Nice to have (post-launch)

### [P3] Notifications table cleanup job
**What:** A pg_cron job to delete `notifications` rows older than 90 days.
**Why:** The notifications table has no TTL or cleanup. At ~10 bookings/day × 5 notifications = ~18,000 rows/year. Not urgent for MVP but grows unboundedly.
**How to apply:** Add a third pg_cron job in Section 5.8. `DELETE FROM notifications WHERE created_at < now() - interval '90 days'`. Schedule weekly or daily.
**Effort:** XS | **Blocked by:** Phase 6 (pg_cron already set up)

### [P3] pg_cron job health monitoring
**What:** A way to alert if pg_cron jobs stop running (e.g., daily check that `expire_unpaid_reservations` ran within the last 2 hours). Options: query `cron.job_run_details` via admin dashboard KPI, or a Supabase alert.
**Why:** pg_cron fails silently. If it stops running, unpaid reservations never expire, fleet availability becomes incorrect, and the team has no idea until a customer complains.
**How to apply:** Add a KPI card to `/admin` dashboard: "Last expiry job ran: X minutes ago." Query `SELECT max(start_time) FROM cron.job_run_details WHERE jobname = 'expire-unpaid-reservations'`.
**Effort:** S | **Blocked by:** Phase 4 (pg_cron deployed)

### [P3] Stripe Tax integration
**What:** Enable Stripe Tax for automatic tax calculation on purchases (currently tax_included=true and tax_cents always 0).
**Why:** As sales volume grows, manual "tax included" pricing becomes legally complex across states. Stripe Tax handles this automatically with one Stripe dashboard config change.
**Effort:** M | **Blocked by:** Purchase flow stable, business decision on tax strategy

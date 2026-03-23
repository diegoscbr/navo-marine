# TODOS

## P1 — Critical (do before or during implementation)

~~### [P1] Mandatory auth guard pattern in CLAUDE.md~~
~~**Completed:** v1.0.1.0 (2026-03-23) — `requireAdmin()` added to `lib/auth-guard.ts`, CLAUDE.md updated with critical auth guard documentation.~~

### [P1] Webhook state machine integration tests
**What:** Integration tests (Jest + Supabase test project) for the Stripe webhook handler: (a) `checkout.session.completed` → reservation `reserved_paid` + order created, (b) duplicate event is a no-op, (c) unknown `reservation_type` in metadata logs + returns 200, (d) partial transaction rolled back on failure.
**Why:** The webhook is the most critical codepath — it creates orders and confirms payments. Broken webhook = no revenue. E2E tests with a live Stripe account are slow and brittle for CI. Integration tests with a real test Supabase project catch the failure modes that matter.
**How to apply:** Write alongside Phase 4 webhook implementation. Use `stripe.webhooks.generateTestHeaderString` to construct mock signed webhook payloads.
**Effort:** M | **Blocked by:** Phase 4 webhook implementation

---

## P2 — Important (address before launch)

~~### [P2] Checkout route integration tests~~
~~**Completed:** v1.0.1.0 (2026-03-23) — `__tests__/api/checkout/route.test.ts` added with 7 tests covering auth, type validation, quantity bounds, email validation, and purchase dispatch.~~

### [P2] Unique constraint on reservation_units(reservation_id, unit_id)
**What:** Add `UNIQUE(reservation_id, unit_id)` to `reservation_units`. Currently an admin can select the same unit for two atlas2 slots in `PackageUnitAssignment` — the RPC inserts duplicate rows silently.
**Why:** No DB-level guard prevents the same unit being assigned twice to the same reservation. Duplicate rows corrupt fleet tracking queries.
**How to apply:** Migration: `ALTER TABLE reservation_units ADD CONSTRAINT uq_reservation_unit UNIQUE (reservation_id, unit_id)`. Also add client-side filtering: in `PackageUnitAssignment`, filter sibling units out of each atlas2 dropdown's option list.
**Effort:** XS (human: ~30min) → ~10 min CC | **Priority:** P2 | **Blocked by:** nothing

### [P2] Status guard on assign-units route
**What:** `POST /api/admin/reservations/[id]/assign-units` allows any admin to overwrite unit assignments on any reservation regardless of status (cancelled, completed, etc.). Add a guard: fetch the reservation status and return 409 if it's not in `ACTIVE_STATUSES`.
**Why:** An admin could accidentally touch a completed or cancelled reservation. Low blast radius today (admin-only), but becomes a real bug as volume grows.
**How to apply:** Fetch `reservations.status` at the start of the route handler; return `{ error: 'Reservation is not active' }` with 409 if status not in `ACTIVE_STATUSES`.
**Effort:** XS | **Priority:** P2 | **Blocked by:** nothing

### [P2] Availability-aware filtering for package unit dropdowns
**What:** `PackageUnitAssignment` currently shows all non-retired units of each type. A unit already assigned to another active package via `reservation_units` still appears available. Admin could accidentally double-assign it.
**Why:** Double-booking is silent — no constraint prevents it at the API or DB level. Fleet tracking becomes unreliable.
**How to apply:** Extend CEO Amendment #2's `reservationUnits` check in `availableUnitsForReservation()` to also filter units shown in `PackageUnitAssignment`. Pass the fetched `reservationUnits` to the component and filter by `unit_type`. Add test cases.
**Effort:** S (human: ~2h) → ~15 min CC | **Priority:** P2 | **Blocked by:** multi-unit assignment (Task 2 of 2026-03-23-purchase-and-multi-unit-assignment.md)

### [P2] Admin KPI dashboard
**What:** Replace `/admin` redirect with a server component showing: total revenue (sum of `total_cents` on `reserved_paid` + `completed`), active bookings count, fleet utilization %, and last 5 reservations.
**Why:** Admin currently lands on the reservations list with no high-level signal. Revenue is only visible in the Stripe dashboard. As bookings grow, operators need a glanceable overview without logging into Stripe.
**How to apply:** Create `app/admin/AdminKPICards.tsx` (async server component, fetches from `supabaseAdmin`). Replace `app/admin/page.tsx` redirect with the KPI page. Watch the `.limit()` cap — use a proper revenue aggregation query (Supabase RPC or remove the limit and use server-side aggregation) instead of fetching all rows in JS. Fleet utilization should be computed from active reservations with assigned units, not from `unit.status` (which may not be kept in sync with reservation assignments).
**Effort:** S (human: ~2h) → ~15 min CC | **Priority:** P2 | **Blocked by:** nothing

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

~~### [P2] Add missing DB indexes to migrations~~
~~Moved to Phase 1 spec as a required deliverable (not a TODO). See Section 12, Phase 1.~~

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

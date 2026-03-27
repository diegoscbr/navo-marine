# Fix Stale reservation_units Blocking Package Availability

**Date:** 2026-03-26
**Status:** Approved
**Origin:** Codex codebase review — data integrity findings

---

## Problem

When a reservation is cancelled by the `expire_unpaid_reservations()` pg_cron job, the reservation's status flips to `cancelled` but its `reservation_units` rows are never deleted. The availability query in `lib/db/packages.ts` counts all `reservation_units` regardless of parent reservation status, so expired/cancelled reservations permanently block those units from being re-booked.

**Affected path:** pg_cron expiry only. The admin DELETE route (`app/api/admin/reservations/[id]/route.ts:60`) physically deletes the reservation row, and `reservation_units` cascades via `supabase/migrations/005_phase_4_5_schema.sql:40`.

**Not affected:** Race conditions in reservation creation. At 40 MAUs with 1-2 visits/month, concurrent checkout for the same product is astronomically unlikely. Deferred to post-launch scale review.

---

## Fix

### 1. Migration: Update `expire_unpaid_reservations()` cron function

Replace the function in `supabase/migrations/001_initial_schema.sql:337-368` with a new migration that:

- Deletes `reservation_units` for all reservations about to be cancelled
- Then updates reservation status to `cancelled`
- Both happen inside the same PL/pgSQL function transaction (ordering is for clarity, not correctness)
- Resets assigned `units.status` to `available` (existing behavior, preserved)

No new index needed — `reservation_units(reservation_id)` index already exists in `supabase/migrations/005_phase_4_5_schema.sql:49`.

### 2. Query fix: Make availability status-aware

In `lib/db/packages.ts` (around line 103), change the `reservation_units` count to join against `reservations` and filter to active statuses only:

**Active statuses:** `reserved_unpaid`, `reserved_authorized`, `reserved_paid`

**Critical constraint:** Do NOT filter by `expires_at < now()` on paid/authorized rows. In capture-mode package checkout (`lib/checkout/handlers/regatta-package.ts:168`), `expires_at` is set at creation but webhook fulfillment (`lib/stripe/webhook.ts:77`) does not clear it after payment. A paid package with `expires_at` in the past is still active — filtering it out would make a paid unit falsely available.

**Optional defense for `reserved_unpaid`:** Can additionally exclude `reserved_unpaid` rows where `expires_at IS NOT NULL AND expires_at < now()` — these are stale rows the cron hasn't cleaned up yet. This is belt-and-suspenders; the cron fix is the primary solution.

---

## What NOT to fix (and why)

| Finding | Severity | Decision | Rationale |
|---------|----------|----------|-----------|
| Reservation overselling race condition | Critical at scale | Deferred | Read-then-insert pattern in checkout handlers. At 40 MAUs, probability of two concurrent checkouts for same event is ~0. Fix when scale demands it (Postgres RPC with `FOR UPDATE` locking). |
| Webhook duplicate orders | Critical at scale | Deferred | `stripe_events` dedup already catches duplicates. Missing `UNIQUE(stripe_checkout_session_id)` on orders is belt-and-suspenders. Add when refactoring orders table. |
| Purchase pricing in hardcoded array | Medium | Deferred | `lib/commerce/products.ts` is the source of truth for purchase pricing, separate from DB products. Works correctly, just not unified. Consolidate when building dynamic storefront. |

---

## Tests Required

1. **Expired unpaid package no longer blocks future package booking** — create reservation_units for an unpaid reservation, run the cron function, verify units are freed
2. **Cancelled package no longer blocks future package booking** — verify availability query excludes cancelled reservation's units
3. **Paid package with old `expires_at` still blocks availability** — critical regression test: a paid reservation with `expires_at` in the past must NOT be excluded from availability counts
4. **Admin delete still cascades cleanly** — verify existing CASCADE behavior is preserved

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/010_fix_cron_reservation_units_cleanup.sql` | New migration: replace `expire_unpaid_reservations()` to delete reservation_units before cancelling |
| `lib/db/packages.ts` | Join reservation_units to reservations, filter by active statuses |
| `__tests__/lib/db/packages.test.ts` | Add tests for status-aware availability |

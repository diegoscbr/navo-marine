# V1 Hardening Plan

> Date: 2026-03-26
> Scope: harden checkout, inventory, webhook, and product-data correctness for launch-scale traffic without changing the hosting model.

## Goal

Make the current Next.js + Supabase + Stripe architecture safe to run across multiple app instances with low booking volume but real concurrency:

1. No inventory oversell from concurrent checkouts.
2. No duplicate orders or duplicate confirmation emails from replayed Stripe webhooks.
3. No stale package placeholder rows blocking future bookings after expiry/cancel.
4. No purchase-price drift between the product page and checkout.

## Non-Goals

- Do not change hosting providers or split the app into services.
- Do not introduce Redis, queues, or background workers beyond existing `pg_cron`.
- Do not do a full RLS migration in this pass.
- Do not roll unrelated admin UX backlog into this plan (`pagination`, `Save/Edit` pattern, KPI dashboard).
- Do not merge the existing rental-shipping blocker into this plan. That remains tracked separately in `TODOS.md` and `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md`.

## Step 0: Scope Challenge

### Existing code we keep

- Checkout still begins in the existing route: `app/api/checkout/route.ts`
- Stripe session creation stays in the current handlers:
  - `lib/checkout/handlers/rental-event.ts`
  - `lib/checkout/handlers/rental-custom.ts`
  - `lib/checkout/handlers/regatta-package.ts`
  - `lib/checkout/handlers/purchase.ts`
- Supabase remains the source of truth for reservations, orders, units, and package slots.
- `pg_cron` remains the cleanup mechanism for expiring unpaid reservations.

### Minimum change set

The smallest sane hardening diff is:

1. move inventory reservation from app-level read-then-insert logic into Postgres RPCs
2. add DB uniqueness to the Stripe/order path
3. clean up lifecycle leaks in `reservation_units`
4. unify purchase pricing onto the DB-backed catalog

Anything beyond that is scope creep for this pass.

### Complexity check

This work naturally wants to touch more than 8 files. That is a smell.

Scope reduction decision:

- **In scope now:** migrations, checkout handlers, webhook fulfillment, package availability logic, purchase pricing, targeted tests
- **Deferred:** caching, admin pagination, KPI dashboard, full RLS, deploy/process tooling changes

### TODOS cross-reference

This plan intentionally absorbs or aligns with these existing TODOs:

- `[P1] Bug: Package unit assignment "Failed to save assignment" error`
- `[P1] Webhook state machine integration tests`
- `[P2] Unique constraint on reservation_units(reservation_id, unit_id)`
- `[P2] Status guard on assign-units route`
- `[P2] Availability-aware filtering for package unit dropdowns`

This plan intentionally does **not** absorb:

- `[P1] Shipping address collection for rental flows`
- `[P2] Admin reservations pagination`
- `[P2] Admin unit assignment Save/Edit button pattern`

### Distribution check

Not applicable. This plan does not introduce a new distributable artifact.

## Current Failure Modes

1. Checkout handlers do a count/read and then insert later, so concurrent requests can both succeed.
2. Webhook idempotency depends on `stripe_events` being logged after fulfillment, so concurrent duplicate deliveries can create duplicate orders.
3. Package availability reads raw `reservation_units` rows and relies on deletion/cleanup discipline rather than active-reservation filtering.
4. Purchase checkout prices come from `lib/commerce/products.ts` while the storefront reads Supabase-backed product data.
5. Admin package assignment still trusts UI filtering more than DB invariants.

## Target Architecture

### 1. Checkout reservation path

```text
client
  |
  v
/api/checkout
  |
  +--> create Stripe Checkout session
  |
  +--> call Postgres RPC
        - lock relevant inventory row(s)
        - recompute availability inside transaction
        - insert reservation
        - insert package slot rows in same transaction
        - return reservation_id or sold_out
  |
  +--> 200 with Stripe URL
        or
        409 if capacity vanished during the race
```

### 2. Webhook fulfillment path

```text
Stripe webhook
  |
  v
/api/webhooks/stripe
  |
  +--> load reservation by checkout_session_id
  +--> if already paid and order exists: return success
  +--> else create order through unique DB keys
  +--> update reservation to reserved_paid
  +--> send confirmation email once
  +--> log stripe_events for audit
```

### 3. Package slot lifecycle

```text
package checkout created
  -> reservation inserted
  -> placeholder reservation_units inserted (one row per slot)

reservation expires or cancels
  -> reservation status changes
  -> placeholder reservation_units removed

admin assigns physical units
  -> RPC validates active status
  -> RPC rejects overlap conflicts
  -> RPC updates slot rows in place
```

## File Map

| File | Action | Why |
|------|--------|-----|
| `supabase/migrations/010_checkout_keys_and_indexes.sql` | Create | Stripe/order uniqueness + overlap indexes |
| `supabase/migrations/011_reservation_lifecycle_cleanup.sql` | Create | cleanup function + status-aware package safeguards |
| `supabase/migrations/012_atomic_reservation_rpcs.sql` | Create | atomic reservation creation in Postgres |
| `lib/db/availability.ts` | Modify | shift read-path helpers to match new active-status semantics |
| `lib/db/packages.ts` | Modify | status-aware overlap checks, slot helpers, assignment safety |
| `lib/checkout/handlers/rental-event.ts` | Modify | call atomic RPC instead of direct insert |
| `lib/checkout/handlers/rental-custom.ts` | Modify | call atomic RPC instead of direct insert |
| `lib/checkout/handlers/regatta-package.ts` | Modify | call atomic RPC and make slot insertion transactional |
| `lib/checkout/handlers/purchase.ts` | Modify | use DB-backed product/addon pricing |
| `lib/stripe/webhook.ts` | Modify | duplicate-safe fulfillment + single-send email logic |
| `app/api/webhooks/stripe/route.ts` | Modify | tighten duplicate handling semantics |
| `app/api/admin/reservations/[id]/assign-units/route.ts` | Modify | active-status guard + clearer error mapping |
| `app/admin/reservations/page.tsx` | Modify | keep filtered UI, but treat DB as source of truth |
| `__tests__/api/checkout*.test.ts` | Modify | atomic reservation behavior |
| `__tests__/api/webhooks/stripe.test.ts` | Modify | duplicate webhook behavior |
| `__tests__/lib/db/packages.test.ts` | Modify | status-aware overlap checks + cleanup |
| `__tests__/api/admin/assign-units.test.ts` | Modify | overlap conflict + inactive-reservation guard |
| `__tests__/lib/checkout/handlers/purchase.test.ts` | Modify | DB-backed pricing source of truth |

## Phase 1: Pre-Launch Hardening

### Task 1: Add DB invariants and indexes

**Migration:** `supabase/migrations/010_checkout_keys_and_indexes.sql`

- [ ] Add unique index on `reservations(stripe_checkout_session_id)` where not null
- [ ] Add unique index on `orders(reservation_id)` where not null
- [ ] Add unique index on `orders(stripe_checkout_session_id)` where not null
- [ ] Add index on `reservations(product_id, status, start_date, end_date)`
- [ ] Add index on `reservation_units(unit_type, start_date, end_date)`
- [ ] Add index on `reservation_units(unit_id, start_date, end_date)` where `unit_id IS NOT NULL`

**Why**

- Order uniqueness must be guaranteed by the DB, not by best-effort route logic.
- Overlap queries are low-volume today, but they should still have the right shape before launch.

### Task 2: Fix lifecycle cleanup and status-aware package accounting

**Migration:** `supabase/migrations/011_reservation_lifecycle_cleanup.sql`

- [ ] Add or replace a helper function `cancel_reservation_and_release_inventory(p_reservation_id uuid)`
- [ ] Update `expire_unpaid_reservations()` to call that helper instead of only flipping reservation status
- [ ] Ensure the helper:
  - sets `reservations.status = 'cancelled'`
  - clears single-unit `units.status` when relevant
  - deletes package `reservation_units` rows
  - preserves auditability through `notifications` / `unit_events`
- [ ] Update package availability logic in `lib/db/packages.ts` so overlap checks join to `reservations` and only count active statuses:
  - `reserved_unpaid`
  - `reserved_authorized`
  - `reserved_paid`

**Why**

- Cleanup must be correct even if an admin never manually deletes the reservation.
- Raw `reservation_units` should not be trusted without checking parent reservation state.

### Task 3: Make reservation creation atomic in Postgres

**Migration:** `supabase/migrations/012_atomic_reservation_rpcs.sql`

- [ ] Add `create_event_reservation(...)`
- [ ] Add `create_window_reservation(...)`
- [ ] Add `create_package_reservation(...)`

Each RPC should:

- [ ] accept the already-created Stripe session id and checkout payload
- [ ] lock the relevant inventory row(s) with `FOR UPDATE`
- [ ] recompute availability inside the transaction
- [ ] insert the reservation only if capacity still exists
- [ ] for packages, insert placeholder `reservation_units` rows in the same transaction
- [ ] return structured success or sold-out result

**Important**

- Do **not** create Stripe sessions inside the DB
- Do **not** introduce a generic "inventory engine" abstraction
- Keep one RPC per reservation type for explicitness

### Task 4: Rewire checkout handlers to use the RPCs

- [ ] `lib/checkout/handlers/rental-event.ts`
- [ ] `lib/checkout/handlers/rental-custom.ts`
- [ ] `lib/checkout/handlers/regatta-package.ts`

App flow:

1. validate request
2. create Stripe session
3. call the relevant reservation RPC
4. if RPC says sold out, return `409`
5. if RPC succeeds, send pending email and return Stripe URL

**Why**

- This preserves the current user flow while removing the oversell race window.

### Task 5: Harden webhook fulfillment

- [ ] Update `lib/stripe/webhook.ts` so `fulfillCheckoutSession()` first checks whether the reservation is already paid and whether an order already exists
- [ ] Insert the order through duplicate-safe logic backed by the new unique indexes
- [ ] Treat an existing order for the same reservation/session as success, not as failure
- [ ] Send booking-confirmed email only when a new order is created
- [ ] Keep `stripe_events` as audit history

**Deliberate choice**

- `stripe_events` is **not** the primary lock. The primary guard is the order/reservation uniqueness the DB enforces.
- This keeps the change reversible and avoids inventing a mini job-state machine for webhook processing.

### Task 6: Harden admin package assignment

- [ ] Add active-status guard in `app/api/admin/reservations/[id]/assign-units/route.ts`
- [ ] Update the `assign_reservation_units()` RPC so it rejects:
  - duplicate unit ids in the same payload
  - unit ids already assigned to overlapping active reservations
  - wrong `unit_type` for the selected unit
- [ ] Keep UI filtering in `app/admin/reservations/page.tsx`, but treat it as convenience only

**Why**

- UI filtering reduces mistakes.
- DB enforcement prevents silent data corruption.

## Phase 2: Post-Launch Cleanup

### Task 7: Unify purchase pricing onto Supabase

- [ ] Remove price calculation dependence on `lib/commerce/products.ts`
- [ ] Read product and addon pricing from the same Supabase-backed data used by the storefront
- [ ] Update tests so the purchase handler fails if the DB product/addon configuration is incomplete

**Why**

- One source of truth for price and addon state
- Lower risk during schema changes and merch updates

### Task 8: Reduce service-role blast radius

- [ ] Standardize admin routes on the shared `requireAdmin()` helper
- [ ] Keep service-role usage inside server-only helpers
- [ ] Defer a full RLS rollout, but document it as the next security hardening step

## Test Diagram

```text
                    +------------------------------+
                    | V1 hardening verification    |
                    +------------------------------+

checkout race
  A request ----------------------+
                                  +--> only 1 active reservation inserted
  B request ----------------------+

webhook replay
  delivery 1 ---------------------+
                                  +--> 1 order, 1 status flip, 1 email
  delivery 2 ---------------------+

package expiry
  unpaid package expires ---------+--> reservation_units removed

admin assignment
  overlapping unit chosen --------+--> 409 conflict

purchase pricing
  storefront + checkout ----------+--> same DB-backed price/addon data
```

## Verification

### Targeted automated checks

- [ ] `npx jest --testPathPatterns=__tests__/api/checkout`
- [ ] `npx jest --testPathPatterns=__tests__/api/webhooks/stripe.test.ts`
- [ ] `npx jest --testPathPatterns=__tests__/lib/db/packages.test.ts`
- [ ] `npx jest --testPathPatterns=__tests__/api/admin/assign-units.test.ts`
- [ ] `npx jest --testPathPatterns=__tests__/lib/checkout/handlers/purchase.test.ts`

### New cases that must exist before merge

- [ ] two concurrent reservation attempts cannot both create active rows beyond capacity
- [ ] duplicate webhook delivery returns success without creating a second order
- [ ] expired package reservations stop blocking future package bookings
- [ ] admin package assignment rejects overlapping active unit usage
- [ ] purchase handler charges the same product/addon price the storefront reads from Supabase

### Manual staging checks

- [ ] create one event rental checkout and confirm reservation insert + webhook fulfillment
- [ ] attempt two overlapping package bookings against limited capacity and confirm one fails cleanly
- [ ] replay the same Stripe webhook payload and confirm no duplicate order/email
- [ ] expire or cancel a package reservation and confirm the package becomes available again

## Rollout Order

1. Apply `010_checkout_keys_and_indexes.sql`
2. Apply `011_reservation_lifecycle_cleanup.sql`
3. Ship app code that can tolerate the new indexes but still uses old insert paths
4. Apply `012_atomic_reservation_rpcs.sql`
5. Ship checkout-handler + webhook + assignment hardening code
6. Run targeted tests
7. Run staging smoke tests
8. Only then implement Phase 2 purchase-source-of-truth cleanup if launch timing allows

## Success Criteria

- No two concurrent checkout requests can exceed package/event/date-window capacity
- Duplicate Stripe webhook deliveries produce one order and one confirmation email
- Package placeholder rows do not survive expiry/cancel and poison future availability
- Admin assignment rejects overlapping physical-unit conflicts server-side
- Purchase checkout uses the same DB-backed price source as the storefront

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 3 amendments folded in before clearance |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

**VERDICT:** ENG CLEARED - ready to implement after the existing rental-shipping blocker is either completed separately or explicitly deferred.

### Engineering Review Amendments Already Folded In

1. Keep Phase 1 limited to DB invariants and write-path hardening. Caching, pagination, KPI work, and full RLS stay out.
2. Do not make `stripe_events` the primary lock. Use DB uniqueness on `orders` / `reservations` and treat `stripe_events` as audit history.
3. Add server-side overlap validation for admin package assignment. UI filtering alone is not sufficient.

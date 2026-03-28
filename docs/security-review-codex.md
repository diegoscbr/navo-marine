# Security Review: NAVO Marine (Codex)

**Date:** 2026-03-28
**Scope:** Architecture and deep security review of the current application code
**Method:** Static review of auth, admin APIs, checkout, webhook, email, and data-layer flows. Tests were inspected but not executed.

## Findings

### High

#### 1. Stripe webhook idempotency is race-prone and not durable

**Risk:** Duplicate webhook deliveries can create duplicate orders or emails.

**Evidence:**

- `app/api/webhooks/stripe/route.ts:37` checks whether a Stripe event was already seen.
- `app/api/webhooks/stripe/route.ts:56` logs the event only after fulfillment succeeds.
- `lib/stripe/webhook.ts:23` and `lib/stripe/webhook.ts:34` implement those two steps as separate database operations with no atomic guard.
- `lib/stripe/webhook.ts:34` ignores errors from the `stripe_events` insert entirely.

If two deliveries of the same event arrive concurrently, both can pass the "not seen" check before either logs the event. If fulfillment succeeds and the logging insert fails, the next retry can fulfill the same checkout again.

**Test gap:** `__tests__/api/webhooks/stripe.test.ts:169` covers the simple "already seen" path, but not concurrent delivery or event-log write failure.

#### 2. Booking capacity checks are non-atomic and can oversell inventory

**Risk:** Two users racing the last remaining capacity can both pass availability checks and both create reservations.

**Evidence:**

- Event rentals:
  - `lib/db/availability.ts:14`
  - `lib/checkout/handlers/rental-event.ts:44`
  - `lib/checkout/handlers/rental-event.ts:106`
- Custom rentals:
  - `lib/db/availability.ts:42`
  - `lib/checkout/handlers/rental-custom.ts:41`
  - `lib/checkout/handlers/rental-custom.ts:120`
- Regatta packages:
  - `lib/db/packages.ts:36`
  - `lib/checkout/handlers/regatta-package.ts:74`
  - `lib/checkout/handlers/regatta-package.ts:170`

Each flow does a read-based availability check first and a reservation insert later, in a separate write. There is no transaction, lock, or RPC that reserves capacity atomically.

**Test gap:** `__tests__/api/checkout.test.ts:124` covers a sold-out response, but not concurrent competing reservations.

### Medium

#### 3. Regatta-package hardware allocation can fail silently and corrupt future availability

**Risk:** A booking can succeed while the hardware reservation rows fail to insert, causing later availability checks to think units are still free.

**Evidence:**

- `lib/db/packages.ts:148` documents `insertReservationUnits` as non-blocking.
- `lib/db/packages.ts:203` logs insert failures instead of throwing.
- `lib/checkout/handlers/regatta-package.ts:197` calls that helper without checking for failure.
- `lib/db/packages.ts:99` relies on `reservation_units` rows to subtract already-allocated Atlas 2/tablet hardware.

This can allow over-allocation of physical units after an earlier package checkout partially failed.

#### 4. Single-unit assignment integrity is enforced in the UI, not on the server

**Risk:** A stale tab or forged admin request can assign a unit that is already committed elsewhere.

**Evidence:**

- `app/admin/reservations/page.tsx:86` filters available units in server-rendered UI state.
- `lib/admin/unit-availability.ts:21` contains the availability logic.
- `app/admin/reservations/AssignUnitDropdown.tsx:24` posts the chosen `unit_id` directly.
- `app/api/admin/reservations/[id]/assign/route.ts:28` writes `reservations.unit_id` with no server-side conflict, unit-type, or product compatibility check.

The multi-unit package path is better because it uses an RPC (`app/api/admin/reservations/[id]/assign-units/route.ts:53`), but the single-unit path does not.

**Test gap:** `__tests__/api/admin/reservations-assign.test.ts:41` covers auth and the happy path, not conflicting assignments.

## Open Questions

- I did not find an outright missing admin check on `app/api/admin/**`; the larger issues are concurrency and integrity after authorization succeeds.
- This review assumes there is no database-level uniqueness or locking on `stripe_events`, `orders`, reservation capacity, or unit assignment. If those guarantees exist in Supabase SQL or RPCs outside this repo, findings 1 and 2 may be mitigated.
- Several `/admin` server components query via `supabaseAdmin` directly and rely on `middleware.ts` for protection. That is acceptable today, but fragile if matcher coverage changes.

## Architecture Summary

- The app is a Next.js App Router project with public pages, authenticated booking pages, and an `/admin` surface.
- The highest-sensitivity boundary is `lib/db/client.ts:7`, where `supabaseAdmin` is created with the service-role key and bypasses RLS.
- Checkout flows are dispatched through `app/api/checkout/route.ts:25` into:
  - `lib/checkout/handlers/rental-event.ts`
  - `lib/checkout/handlers/rental-custom.ts`
  - `lib/checkout/handlers/regatta-package.ts`
  - `lib/checkout/handlers/purchase.ts`
- Payment fulfillment is centralized in:
  - `app/api/webhooks/stripe/route.ts:11`
  - `lib/stripe/webhook.ts:59`
- Auth is mostly consistent across the app:
  - `middleware.ts`
  - `lib/auth.config.ts`
  - `lib/auth.ts`
  - `lib/auth-guard.ts`

The main weaknesses are not missing auth checks. They are non-atomic booking and fulfillment writes, plus server-side integrity gaps around inventory assignment.

## Test Gaps

1. No test covers concurrent duplicate delivery of the same Stripe event.
2. No test covers failure of `logStripeEvent` after successful fulfillment.
3. No test covers concurrent bookings competing for the last available inventory slot.
4. No test covers a forged or stale admin request assigning a unit already committed to another reservation.

## Suggested Remediation Order

1. Make webhook deduplication atomic at the database boundary.
2. Move capacity reservation into a transactional RPC or database-enforced workflow.
3. Make `insertReservationUnits` fail the package booking when hardware allocation cannot be recorded.
4. Add server-side conflict validation to the single-unit assignment route.

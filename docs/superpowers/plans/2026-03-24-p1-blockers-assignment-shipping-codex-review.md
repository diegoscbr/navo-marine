# Codex Review — 2026-03-24 P1 Blockers Assignment Shipping

Reviewed plan: `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md`

Tone: blunt, launch-focused, biased toward real failure modes over plan neatness.

---

## Verdict

Do not clear this plan as-is.

The `JSON.stringify()` fix looks real, but the plan still misses a more serious package-allocation architecture problem, assumes a root cause that has not been proven from logs, and quietly expands a rental-only blocker into a broader checkout-policy change.

---

## Findings

### 1. Critical: Task 1 fixes the transport bug but leaves package allocation logically broken

The route currently strips out every unassigned slot before calling the RPC:

- `app/api/admin/reservations/[id]/assign-units/route.ts:36-45`

The RPC then deletes all existing `reservation_units` rows for the reservation and recreates only the assigned rows, forcing `quantity = 1` and omitting `start_date` / `end_date`:

- `supabase/migrations/007_reservation_units_unit_id.sql:10-24`

That conflicts with how package reservations are initially represented. `insertReservationUnits()` creates placeholder `reservation_units` rows with date ranges and, for Atlas 2 bundles, `quantity > 1`:

- `lib/db/packages.ts:153-204`

The fleet-availability logic depends on those rows and their dates:

- `lib/db/packages.ts:98-142`

Consequence:

- Once admin assigns a subset of units, any remaining required-but-unassigned capacity disappears.
- Assigned rows lose their date range, so they no longer participate in overlap checks.
- A successful assignment can therefore weaken inventory protection and permit overbooking later.

This is worse than a simple serialization bug. The plan does not address it.

### 2. High: The plan is too confident about the assignment root cause

The draft declares the root cause is double-serialization:

- `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md:28-32`

But the current state doc says the live failure is only "likely a double-booking conflict" and explicitly calls out package dropdown double-booking as still unresolved:

- `docs/context/current-state.md:19-21`
- `docs/context/current-state.md:26-31`

Current package-assignment UI does not use the filtered availability helper. It passes raw unit lists:

- `app/admin/reservations/page.tsx:163-170`

And each package dropdown renders the full list with no prevention against selecting the same unit twice or selecting a unit already in use elsewhere:

- `app/admin/reservations/PackageUnitAssignment.tsx:62-111`

The RPC itself also has no conflict validation:

- `supabase/migrations/007_reservation_units_unit_id.sql:10-24`

So the plan is choosing a cause before verifying it from actual logs. That is weak engineering practice this close to launch.

### 3. High: Task 2 turns a rental blocker into a product-policy rewrite

The actual blocker is framed as rental shipping only:

- `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md:5-7`
- `docs/context/current-state.md:17-21`

But Task 2 expands that to all non-purchase checkout handlers, including `regatta_package`:

- `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md:107-115`

Task 3 then rewrites repo policy to say every checkout flow must collect shipping:

- `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md:368-380`

That directly contradicts the current documented rule and the existing purchase-handler comment:

- `docs/context/current-state.md:171`
- `docs/context/current-state.md:265`
- `lib/checkout/handlers/purchase.ts:80-89`

If the blocker is `/reserve`, fix `/reserve`. Do not smuggle in a new global business rule unless there is explicit product agreement.

### 4. Medium-high: Shipping collection is not the same as shipping support

If the business need is "collect the address so we can actually ship units," this plan is incomplete.

The webhook currently creates `orders` without storing shipping details and never reads Stripe shipping data at all:

- `lib/stripe/webhook.ts:76-137`

But the underlying spec expects `orders.shipping_address` to be stored on checkout completion:

- `docs/superpowers/specs/2026-03-16-commerce-rental-inventory-design.md:296-312`
- `docs/superpowers/specs/2026-03-16-commerce-rental-inventory-design.md:445-452`

So Task 2, as written, only adds UI collection on the Stripe page. It does not persist the address into your system.

### 5. Medium: The verification plan is too shallow for the real risks

The plan's manual verification covers:

- one package assignment success case
- one rental-event checkout showing an address form

Reference:

- `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md:395-405`

That misses the actual dangerous cases:

- partial package assignment preserving unassigned required slots
- assigned `reservation_units` retaining `start_date` / `end_date`
- duplicate same-unit selection within a single package booking
- assigning a unit already held by another active package reservation
- whether `regatta_package` really should collect shipping if you choose to touch it

The existing tests also mostly assert call shapes, not invariants:

- `__tests__/api/admin/assign-units.test.ts:41-78`
- `__tests__/components/admin/PackageUnitAssignment.test.tsx:52-96`
- `__tests__/lib/checkout/handlers/rental-event.test.ts:74-105`
- `__tests__/lib/db/packages.test.ts:124-170`

You need tests around state preservation and inventory correctness, not just "did this function get called with an array."

---

## Architecture Gaps The Plan Does Not Address

### Package assignment data model mismatch

Right now the system is mixing two meanings for `reservation_units`:

1. placeholder capacity tracking before admin assignment
2. actual assigned units after admin selection

The current RPC destroys placeholder rows and recreates assignment rows. That only works if the table is meant to store assignments only. But the availability code clearly uses it as capacity tracking too.

Pick one model:

- Model A: `reservation_units` means required capacity, always keep one row per required slot, and update rows in place.
- Model B: `reservation_units` means actual assignments only, and add a separate required-capacity representation elsewhere.

Right now it is half of both, which is unstable.

### No server-side uniqueness / conflict protection

Package assignment still trusts the client too much. Even if the UI is filtered later, the API/RPC path should reject:

- duplicate unit IDs within the same payload
- unit IDs assigned to overlapping active reservations
- unit IDs of the wrong `unit_type`

None of that is enforced in the current route or RPC.

### Plan ignores live-log verification

Before changing architecture based on a serialization theory, the plan should require checking the exact Vercel / DB error first. Otherwise you risk fixing one bug while missing the one users actually hit.

---

## Recommended Changes To The Plan

### Minimum acceptable revision

1. Verify the exact production/staging RPC error from logs first.
2. Keep the `JSON.stringify()` fix if the error confirms it.
3. Amend Task 1 to preserve package inventory semantics:
   - either update existing `reservation_units` rows in place
   - or rewrite the model so assignment rows do not destroy capacity-tracking rows
4. Add server-side conflict checks for package assignment.
5. Limit shipping scope to rental flows unless product explicitly approves broader policy.
6. If shipping is business-critical operational data, extend webhook fulfillment to persist Stripe shipping details.

### Tests that should exist before merge

- assign-units preserves date ranges or equivalent inventory-tracking state
- assign-units preserves outstanding required slots for partially assigned packages
- assign-units rejects duplicate unit IDs in the same request
- assign-units rejects units already allocated to overlapping active reservations
- rental-event includes `shipping_address_collection`
- rental-custom includes `shipping_address_collection`
- regatta-package test only if product explicitly wants that behavior
- webhook persists `shipping_address` if the business now cares about that data

---

## Open Questions For CEO Review

1. What is the exact `assign_reservation_units()` error in Vercel logs?
2. Is `reservation_units` supposed to represent required capacity before assignment, actual assignments after assignment, or both?
3. Do you explicitly want shipping capture on `regatta_package`, or is the blocker strictly `/reserve`?
4. If shipping is collected for rentals, where is that address meant to be stored and used operationally?

---

## Bottom Line

There is a legitimate bug in `assign-units`, but the plan is too narrow on package architecture and too broad on shipping policy.

If you ship exactly this plan, you may fix the visible RPC failure while leaving inventory integrity and business-scope confusion unresolved.

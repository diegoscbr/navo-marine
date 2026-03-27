# P1 Blockers: Package Assignment Integrity + Rental Shipping Address

> Corrected 2026-03-24 plan. This version matches `docs/context/current-state.md`, the 2026-03-23 reviewed assignment plan, and the Codex review artifact. It intentionally does **not** expand shipping scope to `regatta_package`, and it does **not** treat the visible `JSON.stringify()` bug as the whole assignment problem.

## Goal

Fix the two launch blockers that are still open on `dev`:

1. Package assignment is failing and can corrupt package inventory semantics.
2. Rental checkout flows on `/reserve` do not collect a ship-to address.

## Non-Goals

- Do **not** change `regatta_package` checkout to collect shipping.
- Do **not** rewrite the whole package reservation model.
- Do **not** mark the live blocker resolved in docs until local tests pass and staging is rechecked.

## Current Facts From The Repo

- `app/api/admin/reservations/[id]/assign-units/route.ts` still double-serializes the RPC payload with `JSON.stringify()`.
- `supabase/migrations/007_reservation_units_unit_id.sql` deletes and recreates `reservation_units` rows, which drops `start_date` / `end_date` and collapses unassigned required slots.
- `lib/db/packages.ts` inserts package placeholder rows with `quantity > 1`, but `checkMultiUnitAvailability()` counts rows, not `SUM(quantity)`.
- `app/admin/reservations/page.tsx` filters single-unit assignment with `availableUnitsForReservation()`, but package dropdowns still render raw unit lists.
- `current-state.md` says shipping scope is rentals only unless product explicitly approves more.
- `orders.shipping_address` already exists in schema, but the webhook does not persist Stripe shipping data.

## Corrected Architecture

### Package assignment

Treat `reservation_units` as **one slot per physical unit**, not one aggregated quantity row.

- Placeholder rows must keep `start_date` / `end_date`.
- Unassigned capacity must survive admin assignment.
- Assigning units should update existing slot rows, not delete and recreate them.
- The route should reject duplicate unit IDs in the same payload.
- The admin UI should stop offering obviously busy units for package assignment.

### Rental shipping

Shipping address collection is required for:

- `rental_event`
- `rental_custom`
- existing `purchase`

Shipping address collection is **not** added to:

- `regatta_package`

Webhook fulfillment should persist `session.shipping_details` into `orders.shipping_address` when present.

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md` | Rewrite | Correct plan scope and steps |
| `supabase/migrations/009_reservation_units_slot_integrity.sql` | Create | Normalize package slot rows and replace assignment RPC |
| `app/api/admin/reservations/[id]/assign-units/route.ts` | Modify | Pass array directly, validate duplicates, preserve slot model |
| `app/admin/reservations/page.tsx` | Modify | Filter package dropdown choices through availability helper |
| `app/admin/reservations/PackageUnitAssignment.tsx` | Modify | Prevent duplicate same-package unit selection client-side |
| `lib/db/packages.ts` | Modify | Insert one `reservation_units` row per required slot |
| `lib/checkout/handlers/rental-event.ts` | Modify | Add rental shipping address collection |
| `lib/checkout/handlers/rental-custom.ts` | Modify | Add rental shipping address collection |
| `lib/stripe/webhook.ts` | Modify | Persist Stripe shipping details into `orders.shipping_address` |
| `CLAUDE.md` | Modify | Update shipping rule from purchase-only to purchase + rentals |
| `__tests__/api/admin/assign-units.test.ts` | Modify | Assert array payload + duplicate guard |
| `__tests__/components/admin/PackageUnitAssignment.test.tsx` | Modify | Assert sibling filtering / save behavior |
| `__tests__/lib/db/packages.test.ts` | Modify | Assert slot-row insertion and multi-unit counting assumptions |
| `__tests__/lib/checkout/handlers/rental-event.test.ts` | Modify | Assert shipping address collection |
| `__tests__/lib/checkout/handlers/rental-custom.test.ts` | Create | Cover rental-custom shipping address collection |
| `__tests__/lib/stripe/webhook.test.ts` | Modify | Assert shipping address persistence |

## Task 1: Fix Assignment Transport Bug And Guardrails

### Why

There is a real transport bug: the route passes `JSON.stringify(toAssign)` into `.rpc()`.

That fix is necessary, but insufficient by itself.

### Steps

- [ ] Update `__tests__/api/admin/assign-units.test.ts` to assert `p_assignments` is an array, not a string.
- [ ] Add a route test that rejects duplicate unit IDs in the same request payload with `400`.
- [ ] In `app/api/admin/reservations/[id]/assign-units/route.ts`:
  - pass `p_assignments: toAssign`
  - reject duplicate non-null `unit_id` values before calling the RPC
- [ ] Run `npx jest --testPathPattern=assign-units.test.ts --no-coverage`

## Task 2: Preserve Package Slot Semantics

### Why

Current package assignment destroys the very rows that package fleet tracking depends on.

### Design

Normalize `reservation_units` to one row per unit slot:

- 5 Atlas 2 units required = 5 rows with `unit_type = 'atlas2'`, `quantity = 1`
- 1 tablet required = 1 row with `unit_type = 'tablet'`, `quantity = 1`

Assignment updates those rows in place by filling `unit_id` on the first available slot rows of the matching type. Unassigned slot rows remain in the table with their dates intact.

### Steps

- [ ] Create `supabase/migrations/009_reservation_units_slot_integrity.sql`
- [ ] Migration contents:
  - expand existing `reservation_units.quantity > 1` rows into multiple `quantity = 1` rows
  - reset legacy rows to `quantity = 1`
  - add a unique partial index on `(reservation_id, unit_id)` where `unit_id IS NOT NULL`
  - replace `assign_reservation_units()` so it:
    - clears `unit_id` on existing rows for the reservation
    - preserves `start_date`, `end_date`, and outstanding unassigned slots
    - raises if the payload asks for more units of a type than reserved slots exist
- [ ] Update `lib/db/packages.ts::insertReservationUnits()` to insert one row per slot instead of one aggregated quantity row
- [ ] Update `__tests__/lib/db/packages.test.ts` with slot-row expectations for `insertReservationUnits()`
- [ ] Run:
  - `npx jest --testPathPattern=packages.test.ts --no-coverage`
  - `npx jest --testPathPattern=assign-units.test.ts --no-coverage`

## Task 3: Filter Package Dropdowns Properly

### Why

Single-unit assignment already filters busy units. Package assignment should not bypass that safety net.

### Steps

- [ ] In `app/admin/reservations/page.tsx`, pass package unit choices through `availableUnitsForReservation()` before rendering `PackageUnitAssignment`
- [ ] In `PackageUnitAssignment.tsx`, filter sibling-selected Atlas 2 units out of each Atlas 2 dropdown so the same unit cannot be picked twice in one package locally
- [ ] Add component tests for:
  - duplicate sibling unit is not offered in another slot
  - save payload still includes explicit unassigned slots as `null` client state, but only assigned IDs are sent to the route
- [ ] Run `npx jest --testPathPattern=PackageUnitAssignment.test.tsx --no-coverage`

## Task 4: Add Shipping Address To Rental Flows Only

### Why

`/reserve` rentals need ship-to data. `regatta_package` is not part of the approved blocker scope.

### Steps

- [ ] Add `shipping_address_collection: { allowed_countries: ['US'] }` to:
  - `lib/checkout/handlers/rental-event.ts`
  - `lib/checkout/handlers/rental-custom.ts`
- [ ] Do **not** add it to `lib/checkout/handlers/regatta-package.ts`
- [ ] Add / update tests:
  - `__tests__/lib/checkout/handlers/rental-event.test.ts`
  - `__tests__/lib/checkout/handlers/rental-custom.test.ts`
- [ ] Run:
  - `npx jest --testPathPattern=rental-event.test.ts --no-coverage`
  - `npx jest --testPathPattern=rental-custom.test.ts --no-coverage`

## Task 5: Persist Shipping Data In Webhook Fulfillment

### Why

Collecting a shipping address is weaker than storing it. The schema already has `orders.shipping_address`.

### Steps

- [ ] In `lib/stripe/webhook.ts`, map `session.shipping_details` into `orders.shipping_address` when present
- [ ] Keep behavior generic so purchase and rental orders both persist shipping data if Stripe captured it
- [ ] Add webhook test coverage for order insert containing `shipping_address`
- [ ] Run:
  - `npx jest --testPathPattern=webhook.test.ts --no-coverage`
  - `npx jest --testPathPattern='api/webhooks/stripe.test.ts' --no-coverage`

## Task 6: Documentation Update

Only after code and tests are green:

- [ ] Update `CLAUDE.md` shipping rule to:
  - purchase flows require shipping collection
  - rental flows require shipping collection
  - `regatta_package` remains unchanged unless explicitly approved later
- [ ] Update `docs/context/current-state.md` to reflect the code changes and verification status

## Verification

- [ ] `npx jest --testPathPattern=assign-units.test.ts --no-coverage`
- [ ] `npx jest --testPathPattern=packages.test.ts --no-coverage`
- [ ] `npx jest --testPathPattern=PackageUnitAssignment.test.tsx --no-coverage`
- [ ] `npx jest --testPathPattern=rental-event.test.ts --no-coverage`
- [ ] `npx jest --testPathPattern=rental-custom.test.ts --no-coverage`
- [ ] `npx jest --testPathPattern=webhook.test.ts --no-coverage`
- [ ] `npm test`

## Success Criteria

- Package assignment no longer fails because of JSON double-serialization.
- Package assignment does not delete slot rows or drop package date ranges.
- Unassigned required package slots still exist after partial assignment.
- Package dropdowns do not offer obviously busy units or same-package duplicates.
- Rental checkout flows show a shipping address form on Stripe.
- `orders.shipping_address` is populated when Stripe collected shipping details.
- `regatta_package` behavior is unchanged.

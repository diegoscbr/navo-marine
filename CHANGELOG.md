# Changelog

All notable changes to navo-marine are documented here.

## [Unreleased]

### Notes
- **Event rental pricing is snapshotted at event creation**: `/api/admin/events` writes per-event pricing into `rental_event_products` from the product's current `price_per_day_cents`. Later product rental price edits do **not** retroactively change existing event checkout behavior.
- **Zero-dollar legacy events stay zero-dollar**: event checkout reads pricing from `rental_event_products`, so an event created when the Atlas 2 rental price was `$0` will keep using the direct-success/no-Stripe path until that event allocation row is manually changed.
- **Purchase pricing has a separate source of truth**: the Atlas 2 product detail page reads product content from Supabase, but `handlePurchase` still prices from `lib/commerce/products.ts`. Product DB/admin edits do not automatically change purchase checkout pricing unless that static catalog stays in sync.
- **Package inventory uses two assignment models**: single-unit reservations use `reservations.unit_id`, while regatta packages also use `reservation_units`. Availability and admin assignment logic need to account for both to avoid double-booking.
- **Playwright is production-targeted right now**: `playwright.config.ts` points at `https://navomarine.com`, so E2E runs validate production rather than local dev by default.

## [1.0.1.0] - 2026-03-23

### Added
- **Purchase checkout**: Buy Now flow on `/products/atlas-2` — quantity stepper, optional Vakaros Care warranty add-on, confirmation email pre-fill, redirects to Stripe Checkout with `shipping_address_collection` (US only)
- **Multi-unit assignment for package reservations**: Admin reservations page now shows N atlas2 dropdowns (matching `atlas2_units_required`) + optional tablet dropdown for `regatta_package` type; atomic `assign_reservation_units()` RPC prevents partial write failures
- **`handlePurchase` handler**: Server-side pricing from storefront products, Stripe session creation, reservation insert with `quantity`, fire-and-forget pending email
- **`requireAdmin()` helper**: Shared admin auth guard in `lib/auth-guard.ts`
- **`ACTIVE_STATUSES` export** from `lib/admin/unit-availability.ts` + 5th param `reservationUnits` to prevent double-booking across package-assigned units
- **Migration 007**: `unit_id` FK on `reservation_units` + `assign_reservation_units()` RPC
- **Migration 008**: `quantity INT DEFAULT 1` on `reservations`

### Changed
- Admin reservations page: conditional UI — `regatta_package` reservations show `PackageUnitAssignment`; other types show `AssignUnitDropdown`
- Checkout route: `purchase` type dispatches to `handlePurchase` (replaces 501)

## [1.0.0.0] - 2026-03-22

### Added
- Initial production release: rental event + rental custom + regatta package checkout flows
- Admin reservations, fleet, events, products management
- Google OAuth sign-in with post-login redirect (admin → `/admin`, user → `/`)
- Email confirmation (pending + confirmed) via Gmail API service account
- Payment success page at `/checkout/success`
- Unit assignment dropdown (single unit) on admin reservations

# Current State — Resume Context

> **For Claude:** Read this file at the start of any session to get full project context without re-explanation.
> Last updated: 2026-03-23 (session 8)

---

## Where We Are

**Active branch:** `dev` (staging on Vercel)
**Main is prod.** All feature work merges to `dev`, then `dev` → `main` when ready to ship.

**254 unit tests passing.** Build is green.

PR open: `dev` → `main`. Gates before merging: Track B email verification + staging E2E pass.

---

## What Was Built — Session 8 (2026-03-23) — Hydration + Reserve Checkout Fixes

| Change | Files | Status |
|--------|-------|--------|
| Navbar hydration mismatch fix: removed render-time `window.scrollY` read, initialize `scrolled` deterministically, then sync after mount | `components/layout/Navbar.tsx`, `__tests__/components/layout/Navbar.test.tsx` | ✅ done |
| Rental-event pricing query fix: `getEventPricing()` now selects only `start_date` + `end_date`; pricing comes from the event-product allocation when present | `lib/db/events.ts`, `lib/checkout/handlers/rental-event.ts`, `__tests__/lib/db/events.test.ts`, `__tests__/lib/checkout/handlers/rental-event.test.ts` | ✅ done |
| Reserve checkout 404 fix: reserve form now posts the selected event allocation `product_id` instead of blindly using the page-level fallback ID | `app/reserve/ReserveBookingUI.tsx`, `__tests__/components/reserve/ReserveBookingUI.test.tsx` | ✅ done |

### Session 8 notes
- The hydration warning on `/products/atlas-2` came from `Navbar` setting initial state from `window.scrollY` during the first client render. The fix keeps server HTML and first client render aligned.
- The live DB does **not** currently expose `rental_events.rental_price_per_day_cents`. Fetching that column caused the 500 in `/api/checkout`.
- For rental-event checkout, per-day pricing now comes from `rental_event_products.rental_price_per_day_cents` when present; otherwise fall back to `rental_price_cents`.
- The reserve page still receives `defaultProductId`, but checkout must prefer the selected event allocation's real `product_id` to avoid `Event product not found` 404s when the fallback ID is stale.

### Targeted verification run
- `npm test -- --runTestsByPath __tests__/components/layout/Navbar.test.tsx`
- `npm test -- --runTestsByPath __tests__/lib/db/events.test.ts __tests__/lib/checkout/handlers/rental-event.test.ts __tests__/components/reserve/ReserveBookingUI.test.tsx`
- `npm test -- --runTestsByPath __tests__/components/reserve/ReserveBookingUI.test.tsx __tests__/api/checkout.test.ts __tests__/lib/checkout/handlers/rental-event.test.ts`

---

## What Was Built — Session 7 (2026-03-23) — Track B Gmail

| Change | Files | Status |
|--------|-------|--------|
| Subject line encoding fix (RFC 2047 Base64) | `lib/email/gmail.ts` | ✅ done |
| Em dash → hyphen in subject lines | `lib/email/templates.ts` | ✅ done |
| "Reply to this email" → `info@navomarine.com` in both templates | `lib/email/templates.ts` | ✅ done |

### Gmail Setup Status
- ✅ Google Cloud project `navo-marine` created, Gmail API enabled
- ✅ Service account created, JSON key downloaded
- ✅ Org policy `iam.disableServiceAccountKeyCreation` overridden (legacy + managed)
- ✅ Domain-wide delegation authorized in Google Workspace Admin (`https://www.googleapis.com/auth/gmail.send`)
- ✅ `noreply@navomarine.com` created as real Workspace user (required for impersonation)
- ✅ `GMAIL_SERVICE_ACCOUNT_KEY` + `GMAIL_FROM_ADDRESS=noreply@navomarine.com` added to `.env.local`
- 🔄 Vercel env vars added + dev branch redeployed — **pending final verification**
- 🔄 Confirmed email (post-Stripe webhook) not yet tested

### Next steps this session
1. Test full purchase flow locally — verify pending email subject line is clean
2. Complete Stripe checkout → verify confirmed email arrives
3. Commit email fixes + push to dev
4. Update Vercel env vars with `GMAIL_FROM_ADDRESS=noreply@navomarine.com` (currently set to wrong address on Vercel)
5. Staging E2E pass
6. Merge PR `dev` → `main`

---

## What Was Built — Session 1 (2026-03-22)

All items came from the user's manual E2E feedback pass (`docs/context/feedback/feedback.md`).

| Feature | Files |
|---------|-------|
| Post-login redirect: non-admin → `/`, admin → `/admin` | `app/auth/redirect/page.tsx` (new), `app/login/GoogleSignInButton.tsx`, `app/login/page.tsx` |
| "Rent for an Event" 503 fix | `lib/db/events.ts` (removed bad column), `lib/checkout/handlers/rental-event.ts` |
| Custom Dates tab → Contact Us panel | `app/reserve/ReserveBookingUI.tsx` |
| "Reserve" → "Rental" rename on products page | `app/products/[slug]/ProductPurchasePanel.tsx` |
| "View Product" for packages → `/packages` | `app/products/page.tsx` |
| Phone number added to contact page | `components/sections/ContactSection.tsx` |
| Payment success page | `app/checkout/success/page.tsx` (new) |
| Admin event management (full CRUD) | `app/admin/events/page.tsx`, `app/admin/events/AddEventForm.tsx`, `app/api/admin/events/route.ts`, `app/api/admin/events/[id]/route.ts` |
| Email confirmation (pending + confirmed) | `lib/email/gmail.ts`, `lib/email/templates.ts`, wired into all 3 checkout handlers + webhook |
| Explicit confirmation email field at checkout | `app/reserve/ReserveBookingUI.tsx`, `app/packages/PackageReviewStep.tsx`, `app/api/checkout/route.ts` |

## What Was Built — Session 2 (2026-03-22)

| Feature | Files |
|---------|-------|
| Build fix (later superseded in session 8): attempted to read `rental_price_per_day_cents` from `RentalEvent` instead of `RentalEventProduct` | `lib/db/events.ts`, `lib/checkout/handlers/rental-event.ts`, `app/reserve/ReserveBookingUI.tsx` |
| Admin unit assignment | `app/api/admin/reservations/[id]/assign/route.ts` (new), `app/admin/reservations/AssignUnitDropdown.tsx` (new), `app/admin/reservations/page.tsx` |

## What Was Built — Session 4 (2026-03-23)

| Feature | Files |
|---------|-------|
| Unit dropdown filter — shows `navo_number`, excludes units assigned to other active reservations, filters retired units | `lib/admin/unit-availability.ts` (new), `app/admin/reservations/page.tsx`, `app/admin/reservations/AssignUnitDropdown.tsx` |
| Unit dropdown error feedback — shows error message on API failure instead of silent reset | `app/admin/reservations/AssignUnitDropdown.tsx` |
| Tests: filter logic (4 cases) + component (3 cases) | `__tests__/lib/admin/filtering.test.ts` (new), `__tests__/components/admin/AssignUnitDropdown.test.tsx` (new) |

### Architecture notes

- **Email:** Gmail API via service account JWT (`lib/email/gmail.ts`). Fire-and-forget — email failure never blocks checkout. Requires `GMAIL_SERVICE_ACCOUNT_KEY` + `GMAIL_FROM_ADDRESS` env vars.
- **Confirmation email:** User explicitly provides the address at checkout (pre-filled from Google session, editable). Passed as `confirmation_email` in checkout body → overrides `session.user.email` in route before dispatching to handlers.
- **Post-login redirect:** Dedicated `/auth/redirect` server page that reads session and redirects by domain. `callbackUrl` on Google sign-in points here.
- **Admin events:** `rental_events` table. CRUD via `/api/admin/events` and `/api/admin/events/[id]`. Events populate the "Rent for an Event" dropdown on `/reserve`.
- **Unit assignment:** `PATCH /api/admin/reservations/[id]/assign` — sets `unit_id` on a reservation (pass `null` to unassign). Dropdown filters to available units only via `availableUnitsForReservation()` in `lib/admin/unit-availability.ts`. Shows `navo_number` (e.g., "NAVO-001"). Retired units excluded via `.is('retired_at', null)`.
- **Rental-event pricing:** the live DB does not currently expose `rental_events.rental_price_per_day_cents`. `getEventPricing(eventId)` now fetches only `start_date` and `end_date`; per-day pricing comes from `rental_event_products.rental_price_per_day_cents` when present, else fall back to `rental_price_cents`.
- **Reserve checkout product selection:** on `/reserve`, always post the selected event allocation's `product_id`. Do not assume the page-level Atlas fallback ID matches the allocation row for every event.

---

## What Was Built — Session 5 (2026-03-23) — COMPLETE

**254 tests passing. Build green. Both tasks committed.**

| Feature | Files | Status |
|---------|-------|--------|
| requireAdmin() in auth-guard | `lib/auth-guard.ts` | ✅ committed |
| Export ACTIVE_STATUSES + 5th param (reservationUnits) | `lib/admin/unit-availability.ts` | ✅ committed |
| Migration 007: unit_id FK + assign_reservation_units() RPC | `supabase/migrations/007_reservation_units_unit_id.sql` | ✅ committed + applied |
| POST /api/admin/reservations/[id]/assign-units | `app/api/admin/reservations/[id]/assign-units/route.ts` | ✅ committed |
| PackageUnitAssignment (N atlas2 dropdowns) | `app/admin/reservations/PackageUnitAssignment.tsx` | ✅ committed |
| Reservations page: conditional UI, reservation_type in query | `app/admin/reservations/page.tsx` | ✅ committed |
| Migration 008: quantity INT DEFAULT 1 on reservations | `supabase/migrations/008_reservations_quantity.sql` | ✅ committed + applied |
| Purchase handler (shipping_address_collection, quantity stored) | `lib/checkout/handlers/purchase.ts` | ✅ committed |
| Checkout route wired (purchase replaces 501) | `app/api/checkout/route.ts` | ✅ committed |
| ProductPurchasePanel: Buy Now + confirmation_email | `app/products/[slug]/ProductPurchasePanel.tsx` | ✅ committed |
| Purchase handler tests (9) | `__tests__/lib/checkout/handlers/purchase.test.ts` | ✅ committed |
| Checkout route tests (7) | `__tests__/api/checkout/route.test.ts` | ✅ committed |

---

## What Was Planned — Session 5 (2026-03-23)

**No code written.** Session was a `/plan-ceo-review` on `docs/superpowers/plans/2026-03-23-purchase-and-multi-unit-assignment.md`.

### CEO Review Amendments (all written into the plan file)

| # | Gap Found | Resolution |
|---|-----------|------------|
| 1 | Non-atomic delete+insert in assign-units route | Fixed: Supabase RPC transaction in migration 007 |
| 2 | `availableUnitsForReservation()` misses package-assigned units → double-booking | Fixed: extend function with `reservationUnits` param |
| 3 | 1 atlas2 dropdown, packages need up to 5 | Fixed: N dropdowns matching `atlas2_units_required` |
| 4 | Purchase checkout captures no shipping address | Fixed: `shipping_address_collection` in Stripe session |
| 5 | No `confirmation_email` field in purchase panel | Fixed: `useSession()` pre-fill + editable input |
| 6 | 3 error-path tests missing (Stripe failure, DB failure, RPC failure) | Fixed: added to plan |
| 7 | `reservations.quantity` not stored | P1 TODO added to TODOS.md |
| 8 | Email copy "See event details" wrong for purchases | P2 TODO |
| 9 | Availability filter runs on capped list (`.limit(100)`) | P2 TODO |

**Shipping address rule added to CLAUDE.md:** All `reservation_type: 'purchase'` Stripe sessions MUST include `shipping_address_collection: { allowed_countries: ['US'] }`. Rental/package flows do not need it.

**Eng Review complete (2026-03-23):** 7 issues found, all resolved. Plan CLEARED for implementation. Eng amendments: export `ACTIVE_STATUSES`, add `reservation_type` to query, migration 008 for `quantity`, fix test mocks to use `.rpc()`, add checkout route test file.

---

## What's NOT Implemented Yet

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| 2 | **Admin KPI dashboard** | 🟡 P2 | `/admin` redirects to reservations. Replace with revenue/bookings/fleet KPI component. See TODOS.md. |
| 3 | **Webhook integration tests** | 🟢 P1 | Not user-facing. Real HMAC via `generateTestHeaderString`. See TODOS.md. |
| 2 | **Admin KPI dashboard** | 🟡 P2 | `/admin` redirects to reservations. Replace with revenue/bookings/fleet KPI component. See TODOS.md. |
| 3 | **Webhook integration tests** | 🟢 P1 | Not user-facing. Real HMAC via `generateTestHeaderString`. See TODOS.md. |

---

## Full Launch Checklist

### Track A — Code ✅ ALL COMPLETE (original scope)

| # | Task | Status |
|---|------|--------|
| A1 | Filter unit dropdown to available units | ✅ Done (session 4) |
| A2 | Fleet management — Create + Delete | ✅ Done (existed before session 4) |
| A3 | Payment double-submit guard | ✅ Done (existed before session 4) |
| A4 | Admin KPI dashboard | ⏩ Deferred to P2 post-launch |
| A5 | Webhook integration tests | ⏩ Deferred, remains P1 in TODOS.md |

### Track C — New Features (unblocked post-review)

| # | Task | Status |
|---|------|--------|
| C1 | Purchase checkout (Buy Now on `/products/atlas-2`) | ✅ Done (session 5) |
| C2 | Multi-unit assignment for package reservations | ✅ Done (session 5) |

### Track B — Gmail Setup (Manual — you do this)

Email code is fully built and wired. It silently no-ops until these env vars are set.

**Step 1 — Google Cloud Console**
1. Create/select a project → enable the **Gmail API**
2. Create a **Service Account** → download the JSON key file

**Step 2 — Google Workspace Admin**
1. Security → API Controls → Domain-wide Delegation
2. Add the service account's Client ID
3. Scope: `https://www.googleapis.com/auth/gmail.send`

**Step 3 — Vercel Environment Variables** (set on both `dev` and `main` branches)
- `GMAIL_SERVICE_ACCOUNT_KEY` — paste the entire JSON key file as a single string
- `GMAIL_FROM_ADDRESS` — e.g. `noreply@navomarine.com`

**Step 4 — Verify on staging**
- Pending email arrives after "Reserve & Pay"
- Confirmed email arrives after completing Stripe checkout (`4242 4242 4242 4242`)

### Final step
1. Complete Track B (Gmail env vars on Vercel)
2. Staging E2E pass (manual smoke test on dev.navomarine.com)
3. Merge PR `dev` → `main` (already open)

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `lib/admin/unit-availability.ts` | Pure function: filters units to those available for a given reservation |
| `docs/superpowers/plans/2026-03-23-track-a-final-blockers.md` | Track A implementation plan (Task 1 implemented, Tasks 2+3 deferred) |
| `docs/context/feedback/feedback.md` | User's manual E2E notes |
| `supabase/migrations/` | All DB migrations (005 + 006 are Phase 4.5) |
| `lib/checkout/handlers/` | Per-type checkout handlers (rental-event, rental-custom, regatta-package) |
| `lib/email/gmail.ts` | Gmail API sender (service account JWT) |
| `lib/email/templates.ts` | `bookingPending` + `bookingConfirmed` HTML email templates |
| `lib/stripe/webhook.ts` | `fulfillCheckoutSession` — updates reservation, creates order, sends confirmed email |
| `app/api/checkout/route.ts` | Checkout dispatch — auth + `confirmation_email` override, then dispatches by `reservation_type` |
| `app/admin/events/` | Admin event management UI |
| `app/admin/reservations/AssignUnitDropdown.tsx` | Unit assignment dropdown (client component) |
| `app/api/admin/reservations/[id]/assign/route.ts` | PATCH endpoint for unit assignment |
| `docs/superpowers/plans/2026-03-23-purchase-and-multi-unit-assignment.md` | CEO-reviewed plan for Track C (purchase + multi-unit) — includes all amendments |

---

## Architecture Reminders

- **Auth gate:** Every API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. No RLS fallback — service role key bypasses all policies.
- `supabaseAdmin` = service role (server-only). `supabase` = anon key (public reads only).
- Stripe is in **test mode** (`sk_test_...`). Use card `4242 4242 4242 4242` for testing.
- RaceSense requires **90-day advance booking** — test dates must be 90+ days out.
- `units` table uses `added_at` (not `created_at`) for the timestamp column.
- For rental-event checkout, `getEventPricing()` fetches only the event date range. Per-day pricing comes from `rental_event_products.rental_price_per_day_cents` when present; otherwise use `rental_price_cents`.
- On `/reserve`, submit the selected event allocation `product_id`, not just the `ATLAS2_PRODUCT_ID` fallback.
- Next.js 16 App Router: dynamic route `params` is a `Promise<{ id: string }>` — must be awaited.
- **Shipping address rule:** All `reservation_type: 'purchase'` Stripe sessions MUST include `shipping_address_collection: { allowed_countries: ['US'] }`. Rentals/packages do not need it.

# Current State — Resume Context

> **For Claude:** Read this file at the start of any session to get full project context without re-explanation.
> Last updated: 2026-03-26 (session 14 send-invoice feature + prod readiness)

---

## Where We Are

**Active branch:** `dev` (staging on Vercel)
**Main is prod.** All feature work merges to `dev`, then `dev` → `main` when ready to ship.

**Targeted blocker tests are passing locally.** Repo-wide `npm test` and `npm run lint` currently fail on unrelated `.agents/skills/gstack` and `everything-claude-code` files that are outside the NAVO blocker changes.

**Staging E2E: PASSED.** Both emails (pending + confirmed) arriving clean. Webhook firing — reservations flip to `reserved_paid`. Admin portal confirmed correct.

**PR open:** `dev` → `main` — still not clear to merge yet. The blocker patch has now been implemented locally, but staging verification has not been rerun yet. See `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md` for the corrected execution plan and `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping-codex-review.md` for the original critique.

### Remaining before launch
1. **[P1] Apply migration 009 + verify package assignment on staging** — local code now passes array payloads, preserves package slot rows in the new migration, and filters package dropdowns. `supabase` CLI and `psql` are installed locally, but `supabase link --project-ref fdjuhjadjqkpqnpxgmue` is currently blocked by Supabase platform access control on the logged-in account. Still need to apply `supabase/migrations/009_reservation_units_slot_integrity.sql` using either the correct Supabase org account, `supabase db push --db-url`, or the dashboard SQL editor, then deploy `dev` and re-test an actual package assignment in admin.
2. **[P1] Verify rental shipping capture on staging** — `rental_event` and `rental_custom` now request `shipping_address_collection`, and webhook fulfillment now stores `session.collected_information.shipping_details` into `orders.shipping_address`. Still need a live Stripe test on `/reserve` to verify the form appears and the order row captures the address.
3. **Set up production environment on Vercel** — see detailed checklist below
4. **Merge PR** `dev` → `main`
5. **Post-merge: switch Stripe to live mode** — replace test keys with live keys, update webhook endpoint, redeploy

### Production environment setup checklist

All env vars must be set on Vercel for the **Production** environment (`main` branch).

#### Auth
- [ ] `NEXTAUTH_SECRET` — random secret for JWT signing (generate with `openssl rand -base64 32`)
- [ ] `NEXTAUTH_URL` — `https://navomarine.com`
- [ ] `GOOGLE_CLIENT_ID` — Google OAuth client ID (same as staging)
- [ ] `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (same as staging)
- [ ] **Google OAuth redirect URI** — add `https://navomarine.com/api/auth/callback/google` as an authorized redirect URI in [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)

#### Supabase
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — same as staging (single DB for now)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same as staging
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — same as staging

#### Stripe (test mode for now — switch to live post-launch)
- [ ] `STRIPE_SECRET_KEY` — `sk_test_*` (same as staging for now)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_test_*` (same as staging for now)
- [ ] `STRIPE_WEBHOOK_SECRET` — **NEW production endpoint required:**
  1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/test/webhooks)
  2. Click **Add endpoint**
  3. URL: `https://navomarine.com/api/webhooks/stripe`
  4. Events: `checkout.session.completed`
  5. Copy the signing secret (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET`

#### Email
- [ ] `GMAIL_SERVICE_ACCOUNT_KEY` — paste entire JSON key file as single string (same as staging)
- [ ] `GMAIL_FROM_ADDRESS` — `noreply@navomarine.com`

#### Optional
- [ ] `ATLAS2_PRODUCT_ID` — falls back to hardcoded UUID `6f303d86-5763-4ece-aaad-b78d17852f8a` if unset

### Post-merge: switch Stripe to live mode

After merging `dev` → `main` and verifying prod works with test keys:

1. **Activate Stripe live mode** in Stripe Dashboard
2. **Create live webhook endpoint** — same URL (`https://navomarine.com/api/webhooks/stripe`), event `checkout.session.completed`, copy new `whsec_...`
3. **Update Vercel production env vars:**
   - `STRIPE_SECRET_KEY` → `sk_live_*`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_*`
   - `STRIPE_WEBHOOK_SECRET` → new live signing secret
4. **Redeploy** production on Vercel
5. **Test** — make a real $1 test purchase or use Stripe's live test card flow

### Post-launch: email deliverability

Emails from `noreply@navomarine.com` currently land in spam for new recipients. To fix:

- [ ] **SPF record** — add Google Workspace SPF to `navomarine.com` DNS
- [ ] **DKIM record** — generate in Google Workspace Admin > Apps > Google Workspace > Gmail > Authenticate email
- [ ] **DMARC record** — add `_dmarc.navomarine.com` TXT record (start with `p=none` to monitor)

### Session 13 implementation notes (2026-03-26) — Delete reservation feature

All five tasks are committed.

| Task | Status | Files |
|------|--------|-------|
| Task 1: Auto-link events to products on creation | ✅ committed | `app/api/admin/events/route.ts`, `__tests__/api/admin/events.test.ts` |
| Task 2: DELETE reservation API route | ✅ committed | `app/api/admin/reservations/[id]/route.ts`, `__tests__/api/admin/reservations/[id]/delete.test.ts` |
| Task 3: DeleteReservationButton component | ✅ committed | `app/admin/reservations/DeleteReservationButton.tsx`, `__tests__/components/admin/DeleteReservationButton.test.tsx` |
| Task 4: Wire delete button into reservations page | ✅ committed | `app/admin/reservations/page.tsx` |
| Task 5: Stripe refund instructions document | ✅ committed | `docs/admin/stripe-manual-refund.md` |

**Task 3 details:**
- `DeleteReservationButton` is a `'use client'` component with a confirmation dialog (modal overlay).
- Calls `DELETE /api/admin/reservations/[reservationId]` on confirm.
- On success: closes dialog and calls `router.refresh()`.
- On API failure: shows the error message from the response body inline in the dialog.
- Cancel closes the dialog without taking action.
- All 5 tests pass (render, dialog open, confirm+refresh, cancel, error display).

**All tasks complete.** Delete button is wired into the reservations table with eligibility gating. Manual Stripe refund guide at `docs/admin/stripe-manual-refund.md`.

### Session 14 implementation notes (2026-03-26) — Send Invoice + BCC + prod readiness

| Feature | Status | Files |
|---------|--------|-------|
| BCC all emails to info@navomarine.com | ✅ committed | `lib/email/gmail.ts` |
| `paymentRequest` email template | ✅ done | `lib/email/templates.ts`, `__tests__/lib/email/templates.test.ts` |
| `POST /api/admin/reservations/[id]/send-invoice` | ✅ done | `app/api/admin/reservations/[id]/send-invoice/route.ts`, `__tests__/api/admin/reservations/send-invoice.test.ts` |
| `SendInvoiceButton` component | ✅ done | `app/admin/reservations/SendInvoiceButton.tsx`, `__tests__/components/admin/SendInvoiceButton.test.tsx` |
| Wire invoice button into reservations page | ✅ done | `app/admin/reservations/page.tsx` |
| Manual invoice guide | ✅ done | `docs/admin/manual-invoice-guide.md` |

**How it works:**
- Unpaid reservations show a mail icon in the Actions column (next to delete trash icon)
- Clicking opens a confirmation dialog showing customer email, amount, and product
- On confirm: creates a new Stripe checkout session, updates `stripe_checkout_session_id` on the reservation, clears `expires_at` (prevents pg_cron auto-cancel), and emails the payment link via Gmail API
- When the customer pays through the link, the existing webhook handles everything (status flip, order creation, confirmation email)
- Re-sending is safe — each send creates a fresh Stripe session; old one simply expires unused
- **Staging verified:** BCC to info@navomarine.com confirmed working. Customer email arrived in spam (expected for new sender — SPF/DKIM/DMARC setup needed post-launch).

### Known issues / admin UX backlog (see TODOS.md for full details)
- **Email ordering:** Processing email occasionally arrives after the confirmation email — both are sent correctly but Gmail delivery is async/non-deterministic. Not a bug, just a UX quirk to be aware of.
- **Delete reservations:** ✅ Fully implemented. Admins can delete `reserved_unpaid`, `cancelled`, or past-date paid reservations from the dashboard via trash icon + confirmation dialog.
- **Pagination:** Reservations list loads all rows. Needs pagination before real booking volume.
- **Package assignment hardening:** Package dropdowns now filter busy units in the UI, but the RPC still does not enforce overlap conflicts against other active reservations at the database level. Current protection is UI + duplicate payload rejection + slot preservation.
- **Save/Edit button for unit assignment:** Dropdowns auto-save on change. Should require explicit Save to prevent misclick accidents.

### Session 10 review notes
- **Plan reviewed:** `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md`
- **Review artifact:** `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping-codex-review.md`
- **Status:** Not cleared as written.
- **Main finding 1:** `assign-units` does have a real double-serialization bug, but fixing only that is not enough.
- **Main finding 2:** package assignment currently destroys `reservation_units` placeholder rows and recreates assigned rows in a way that can drop date-based fleet accounting and unassigned required capacity.
- **Main finding 3:** the shipping blocker is rentals-only in current repo context; the draft plan expands it into an all-checkout policy change without explicit product sign-off.
- **Main finding 4:** if shipping data matters operationally, webhook fulfillment still does not persist Stripe shipping details to `orders.shipping_address`.

### Session 11 implementation notes
- **Plan corrected:** `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md` was rewritten to match `current-state`, the March 23 reviewed plan, and the Codex critique. Shipping scope stays limited to rentals; `regatta_package` remains unchanged.
- **Assignment route:** `app/api/admin/reservations/[id]/assign-units/route.ts` now passes the RPC payload as an array instead of `JSON.stringify(...)` and rejects duplicate unit IDs in the same payload.
- **Slot preservation:** `supabase/migrations/009_reservation_units_slot_integrity.sql` normalizes legacy `reservation_units.quantity > 1` rows to one row per physical slot and replaces `assign_reservation_units()` so assignment updates slot rows in place instead of deleting dates / outstanding capacity.
- **Package inventory writes:** `lib/db/packages.ts` now inserts one `reservation_units` row per physical slot, and availability sums `quantity` so legacy rows do not undercount before migration 009 is applied.
- **Package assignment UI:** `app/admin/reservations/page.tsx` now filters package units through `availableUnitsForReservation()`, and `PackageUnitAssignment.tsx` hides sibling-selected Atlas 2 units from the other Atlas 2 dropdowns.
- **Rental shipping:** `lib/checkout/handlers/rental-event.ts` and `lib/checkout/handlers/rental-custom.ts` now include `shipping_address_collection`. `regatta_package` was intentionally left alone.
- **Webhook shipping persistence:** `lib/stripe/webhook.ts` now maps `session.collected_information.shipping_details` into `orders.shipping_address`.
- **Local verification passed:**
  - `npx jest --runTestsByPath __tests__/api/admin/assign-units.test.ts --no-coverage`
  - `npx jest --runTestsByPath __tests__/lib/db/packages.test.ts --no-coverage`
  - `npx jest --runTestsByPath __tests__/components/admin/PackageUnitAssignment.test.tsx --no-coverage`
  - `npx jest --runTestsByPath __tests__/lib/checkout/handlers/rental-event.test.ts __tests__/lib/checkout/handlers/rental-custom.test.ts --no-coverage`
  - `npx jest --runTestsByPath __tests__/lib/stripe/webhook.test.ts __tests__/api/webhooks/stripe.test.ts --no-coverage`
  - `npx eslint 'app/api/admin/reservations/[id]/assign-units/route.ts' app/admin/reservations/page.tsx app/admin/reservations/PackageUnitAssignment.tsx lib/db/packages.ts lib/checkout/handlers/rental-event.ts lib/checkout/handlers/rental-custom.ts lib/stripe/webhook.ts __tests__/api/admin/assign-units.test.ts __tests__/components/admin/PackageUnitAssignment.test.tsx __tests__/lib/db/packages.test.ts __tests__/lib/checkout/handlers/rental-event.test.ts __tests__/lib/checkout/handlers/rental-custom.test.ts __tests__/lib/stripe/webhook.test.ts`
- **Repo-wide verification caveat:** `npm test` and `npm run lint` still fail because the repo contains unrelated `.agents/skills/gstack` Bun/ESM suites and external lint debt outside the NAVO app changes.
- **Migration handoff for next session:** `supabase` CLI is installed locally, and session 12 later confirmed both `supabase` and `psql` are available from repo root.
- **Direct-apply prerequisites:** before asking the next session to run migration 009 directly, ensure `supabase login` is complete, have the dev/staging DB password available, and either authenticate with the correct Supabase org account for `supabase link` or be ready to use `supabase db push --db-url`.
- **Do not duplicate apply paths:** if the next session is going to drive the migration via CLI, do not also paste `009_reservation_units_slot_integrity.sql` into the SQL editor manually.

### Session 12 migration-access notes
- **Local tooling confirmed:** on 2026-03-26, user confirmed `supabase --version` = `2.78.1` and `psql --version` = `18.3` from repo root.
- **Env parse issue found:** `supabase link` initially failed because `.env.local` contained a malformed `NOREPLY_PASSWORD` line with invalid single-quote syntax. User fixed the local env formatting outside this doc.
- **Current blocker:** `supabase link --project-ref fdjuhjadjqkpqnpxgmue` now fails with a Supabase platform access-control error: the currently authenticated CLI account does not have permission to retrieve remote project status for that project.
- **Recommended apply paths:** either re-authenticate the CLI with the correct Supabase owner/admin account and retry `supabase link`, or skip `link` and apply migration 009 via `supabase db push --db-url` or the dashboard SQL editor.
- **Still pending after DB apply:** re-run the two staging smokes: package assignment in admin and rental shipping capture on `/reserve`.

### Staging URL
`https://navo-marine-git-dev-diegoscbrs-projects.vercel.app`
Stripe sandbox webhook registered for staging. `STRIPE_WEBHOOK_SECRET` set on Vercel dev branch.

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
| `lib/email/templates.ts` | `bookingPending`, `bookingConfirmed`, `paymentRequest` HTML email templates |
| `lib/stripe/webhook.ts` | `fulfillCheckoutSession` — updates reservation, creates order, sends confirmed email |
| `app/api/checkout/route.ts` | Checkout dispatch — auth + `confirmation_email` override, then dispatches by `reservation_type` |
| `app/admin/events/` | Admin event management UI |
| `app/admin/reservations/AssignUnitDropdown.tsx` | Unit assignment dropdown (client component) |
| `app/admin/reservations/DeleteReservationButton.tsx` | Delete button with confirmation dialog (client component) |
| `app/admin/reservations/SendInvoiceButton.tsx` | Send invoice button — creates Stripe checkout session and emails payment link |
| `app/api/admin/reservations/[id]/send-invoice/route.ts` | POST endpoint for admin-initiated payment invoices |
| `app/api/admin/reservations/[id]/assign/route.ts` | PATCH endpoint for unit assignment |
| `app/api/admin/reservations/[id]/route.ts` | DELETE endpoint for removing a reservation and freeing units |
| `docs/superpowers/plans/2026-03-23-purchase-and-multi-unit-assignment.md` | CEO-reviewed plan for Track C (purchase + multi-unit) — includes all amendments |
| `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping.md` | Corrected execution plan for the current P1 blocker patch |
| `docs/superpowers/plans/2026-03-24-p1-blockers-assignment-shipping-codex-review.md` | Codex review of the original March 24 draft; explains why the first version was too narrow on assignment and too broad on shipping |
| `supabase/migrations/009_reservation_units_slot_integrity.sql` | Follow-up migration: split aggregated package slots, preserve dates, and replace the assignment RPC |

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
- **Shipping address rule:** `purchase`, `rental_event`, and `rental_custom` Stripe sessions MUST include `shipping_address_collection: { allowed_countries: ['US'] }`. `regatta_package` does not currently collect shipping.

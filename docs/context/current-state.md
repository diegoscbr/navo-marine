# Current State — Resume Context

> **For Claude:** Read this file at the start of any session to get full project context without re-explanation.
> Last updated: 2026-03-22

---

## Where We Are

**Active branch:** `dev` (staging on Vercel)
**Main is prod.** All feature work merges to `dev`, then `dev` → `main` when ready to ship.

Phase 4.5 (Product Restructure + Regatta Packages) is **complete and tested**. We are now deep into the **MVP launch readiness** phase — most UX blockers from the E2E feedback pass are resolved.

**217 unit tests passing.** Pushed to `origin/dev` — **Vercel build failed.** Error logs to be pasted next session for diagnosis.

---

## What Was Built This Session (2026-03-22)

All items below came from the user's manual E2E feedback pass (`docs/context/feedback/feedback.md`).

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

### Architecture notes from this session

- **Email:** Gmail API via service account JWT (`lib/email/gmail.ts`). Fire-and-forget pattern — email failure never blocks checkout. Requires `GMAIL_SERVICE_ACCOUNT_KEY` + `GMAIL_FROM_ADDRESS` env vars.
- **Confirmation email:** User explicitly provides the address at checkout (pre-filled from Google session, editable). Passed as `confirmation_email` in checkout body → overrides `session.user.email` in route before dispatching to handlers.
- **Post-login redirect:** Implemented as a dedicated `/auth/redirect` server page that reads session and redirects by domain. `callbackUrl` on Google sign-in points here.
- **Admin events:** `rental_events` table. CRUD via `/api/admin/events` and `/api/admin/events/[id]`. Events populate the "Rent for an Event" dropdown on `/reserve`.

---

## What's NOT Implemented Yet (Remaining MVP Blockers)

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| 1 | **Unit assignment** | 🔴 Critical | Admins can see reservations but can't assign a physical device. Plan: `AssignUnitDropdown` + `PATCH /api/admin/reservations/[id]/assign`. |
| 2 | **Payment atomicity** | 🟡 High | Double-submit not guarded — user could hit "Reserve & Pay" twice before redirect fires. Need optimistic disable + server-side idempotency check. |
| 3 | **Admin KPI dashboard** | 🟡 High | `/admin` currently redirects to reservations. Plan: replace with KPI server component (revenue, bookings, fleet utilization). |
| 4 | **Webhook integration tests** | 🟢 Low | Not user-facing. Plan: integration tests using `generateTestHeaderString`. |

---

## Agreed Next Step

Two parallel tracks before prod:

### Track A — Code (Claude, use `superpowers:executing-plans`)
1. **Unit assignment** — `AssignUnitDropdown` + `PATCH /api/admin/reservations/[id]/assign` (spec in MVP plan)
2. **Payment double-submit guard** — disable button optimistically + server-side idempotency check
3. **Admin KPI dashboard** — replace `/admin` redirect with revenue/bookings/fleet metrics
4. **Webhook integration tests** — real HMAC via `generateTestHeaderString` (low priority)

### Track B — Gmail Setup (Manual — you do this)

Email code is fully built and wired. It silently no-ops until these env vars are set.

**Step 1 — Google Cloud Console**
1. Create/select a project → enable the **Gmail API**
2. Create a **Service Account** → download the JSON key file

**Step 2 — Google Workspace Admin**
1. Security → API Controls → Domain-wide Delegation
2. Add the service account's Client ID
3. Scope: `https://www.googleapis.com/auth/gmail.send`
4. This lets the service account impersonate your sending address (e.g. `noreply@navomarine.com`)

**Step 3 — Vercel Environment Variables** (set on both `dev` and `main` branches)
- `GMAIL_SERVICE_ACCOUNT_KEY` — paste the entire JSON key file as a single string
- `GMAIL_FROM_ADDRESS` — e.g. `noreply@navomarine.com`

**Step 4 — Verify on staging**
After env vars set on `dev`, trigger a test booking and confirm:
- Pending email arrives after "Reserve & Pay" (before Stripe redirect)
- Confirmed email arrives after completing Stripe checkout (`4242 4242 4242 4242`)

### Final step
After both tracks complete + staging E2E passes: PR `dev` → `main`, use `/ship` skill.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `docs/superpowers/plans/2026-03-22-mvp-launch-readiness.md` | Full MVP implementation plan |
| `docs/context/feedback/feedback.md` | User's manual E2E notes |
| `docs/e2e-test-log.md` | Manual E2E test results |
| `supabase/migrations/` | All DB migrations (005 + 006 are Phase 4.5) |
| `lib/checkout/handlers/` | Per-type checkout handlers (rental-event, rental-custom, regatta-package) |
| `lib/email/gmail.ts` | Gmail API sender (service account JWT) |
| `lib/email/templates.ts` | `bookingPending` + `bookingConfirmed` HTML email templates |
| `lib/stripe/webhook.ts` | `fulfillCheckoutSession` — updates reservation, creates order, sends confirmed email |
| `app/api/checkout/route.ts` | Checkout dispatch — auth + `confirmation_email` override, then dispatches by `reservation_type` |
| `app/admin/events/` | Admin event management UI |

---

## Architecture Reminders

- **Auth gate:** Every API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. No RLS fallback — service role key bypasses all policies.
- `supabaseAdmin` = service role (server-only). `supabase` = anon key (public reads only).
- Stripe is in **test mode** (`sk_test_...`). Use card `4242 4242 4242 4242` for testing.
- RaceSense requires **90-day advance booking** — test dates must be 90+ days out.
- `units` table uses `added_at` (not `created_at`) for the timestamp column.
- `rental_events` table does NOT have `rental_price_per_day_cents` — that lives on `rental_event_products`.

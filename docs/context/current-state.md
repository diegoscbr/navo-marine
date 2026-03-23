# Current State — Resume Context

> **For Claude:** Read this file at the start of any session to get full project context without re-explanation.
> Last updated: 2026-03-22 (session 3)

---

## Where We Are

**Active branch:** `dev` (staging on Vercel)
**Main is prod.** All feature work merges to `dev`, then `dev` → `main` when ready to ship.

**220 unit tests passing.** Vercel build was broken (type error: `rental_price_per_day_cents` on wrong type) — fixed and re-deployed this session. Build is green.

Unit assignment (Blocker 1) is **complete**. 2 blockers remain before prod.

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
| Build fix: `rental_price_per_day_cents` on `RentalEvent` not `RentalEventProduct` | `lib/db/events.ts`, `lib/checkout/handlers/rental-event.ts`, `app/reserve/ReserveBookingUI.tsx` |
| Admin unit assignment | `app/api/admin/reservations/[id]/assign/route.ts` (new), `app/admin/reservations/AssignUnitDropdown.tsx` (new), `app/admin/reservations/page.tsx` |

### Architecture notes

- **Email:** Gmail API via service account JWT (`lib/email/gmail.ts`). Fire-and-forget — email failure never blocks checkout. Requires `GMAIL_SERVICE_ACCOUNT_KEY` + `GMAIL_FROM_ADDRESS` env vars.
- **Confirmation email:** User explicitly provides the address at checkout (pre-filled from Google session, editable). Passed as `confirmation_email` in checkout body → overrides `session.user.email` in route before dispatching to handlers.
- **Post-login redirect:** Dedicated `/auth/redirect` server page that reads session and redirects by domain. `callbackUrl` on Google sign-in points here.
- **Admin events:** `rental_events` table. CRUD via `/api/admin/events` and `/api/admin/events/[id]`. Events populate the "Rent for an Event" dropdown on `/reserve`.
- **Unit assignment:** `PATCH /api/admin/reservations/[id]/assign` — sets `unit_id` on a reservation (pass `null` to unassign). `AssignUnitDropdown` client component in reservations table, calls API + `router.refresh()`. Query fetches all units from `units` table with no status filter.
- **`rental_price_per_day_cents` lives on `rental_events` (the event row), NOT on `rental_event_products`.** Use `getEventPricing(eventId)` which now selects this field.

---

## What's NOT Implemented Yet (Remaining MVP Blockers)

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| 1 | **Payment atomicity** | 🟡 High | Double-submit not guarded — user could hit "Reserve & Pay" twice before redirect fires. Need optimistic disable + server-side idempotency check. |
| 2 | **Admin KPI dashboard** | 🟡 High | `/admin` currently redirects to reservations. Plan: replace with KPI server component (revenue, bookings, fleet utilization). |
| 3 | **Webhook integration tests** | 🟢 Low | Not user-facing. Plan: integration tests using `generateTestHeaderString`. |

### Known issues / tech debt

- **Unit dropdown only shows 2 units** — only 2 rows exist in `units` table. The dropdown fetches all units; it will show more once they exist.
- **Unit assignment dropdown needs two fixes (discussed end of session 3):**
  1. **Filter to available units only** — dropdown currently shows ALL units. It should exclude any unit already assigned to an active reservation (`reserved_unpaid`, `reserved_authorized`, `reserved_paid`). Fix: subquery or join on `reservations` to exclude `unit_id`s in use. The currently-assigned unit for THIS reservation should still appear (so it can be kept/changed).
  2. **Fleet is read-only** — `/admin/fleet` is currently a read-only list. Non-technical admins need to add/remove units there to control what appears in the dropdown. Fix: add Create + Delete to `/admin/fleet` (a unit needs at minimum `serial_number`; `status` defaults to `available`). The dropdown is already driven by the `units` table — once fleet is editable, the pool is admin-controlled with no code changes needed.

---

## Full Launch Checklist

### Track A — Code (Claude, use `superpowers:executing-plans`)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| A1 | **Filter unit dropdown to available units** | 🔴 Critical | Exclude units already assigned to active reservations. Keep current unit for this reservation in the list. |
| A2 | **Fleet management — add Create + Delete** | 🔴 Critical | `/admin/fleet` is read-only. Admins need to add/remove units to control the assignment pool. Minimum fields: `serial_number`, `status` (default `available`). |
| A3 | **Payment double-submit guard** | 🟡 High | Disable "Reserve & Pay" button optimistically after first click + server-side idempotency check. |
| A4 | **Admin KPI dashboard** | 🟡 High | Replace `/admin` redirect with KPI server component (revenue, bookings, fleet utilization). |
| A5 | **Webhook integration tests** | 🟢 Low | Real HMAC via `generateTestHeaderString`. Not user-facing. |

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
After all tracks complete + staging E2E passes: PR `dev` → `main`, use `/ship` skill.

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
| `app/admin/reservations/AssignUnitDropdown.tsx` | Unit assignment dropdown (client component) |
| `app/api/admin/reservations/[id]/assign/route.ts` | PATCH endpoint for unit assignment |

---

## Architecture Reminders

- **Auth gate:** Every API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. No RLS fallback — service role key bypasses all policies.
- `supabaseAdmin` = service role (server-only). `supabase` = anon key (public reads only).
- Stripe is in **test mode** (`sk_test_...`). Use card `4242 4242 4242 4242` for testing.
- RaceSense requires **90-day advance booking** — test dates must be 90+ days out.
- `units` table uses `added_at` (not `created_at`) for the timestamp column.
- `rental_price_per_day_cents` lives on `rental_events` (the event row), fetched via `getEventPricing()`. It does NOT live on `rental_event_products`.
- Next.js 16 App Router: dynamic route `params` is a `Promise<{ id: string }>` — must be awaited.

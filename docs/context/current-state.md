# Current State — Resume Context

> **For Claude:** Read this file at the start of any session to get full project context without re-explanation.
> Last updated: 2026-03-25

---

## Where We Are

**Active branch:** `dev` (staging on Vercel)
**Main is prod.** All feature work merges to `dev`, then `dev` → `main` when ready to ship.

Phase 4.5 (Product Restructure + Regatta Packages) is **complete and tested**. We are now in the **MVP launch readiness** phase.

---

## What Was Just Built (Phase 4.5)

- `/packages` — 3-step booking flow: choose package → date picker → review → Stripe checkout
- Three regatta management packages seeded in DB: Race Committee, R/C WL Course, RaceSense
- RaceSense uses `payment_mode: 'hold'` (Stripe authorize-only, not captured)
- `/reserve` — per-day pricing (`$35/day`) + extra days stepper (0–14)
- Regatta package checkout handler (`lib/checkout/handlers/regatta-package.ts`)
- Admin reservations page with HOLD badge (`/admin/reservations`)
- "Packages" nav link
- **195 unit tests passing, 91% coverage**
- E2E log: `docs/e2e-test-log.md`

### Bugs Fixed This Session (2026-03-25)

| Bug | File | Fix |
|-----|------|-----|
| Reserve & Pay → 503 | `lib/db/packages.ts` | `created_at` → `added_at` (wrong column name on `units` table) |
| Dashboard dead end after login | `app/dashboard/page.tsx` | Added `<Navbar />` + `<Footer />` |
| Stale "Atlas II" in 3 tests | `__tests__/app/reserve.test.tsx`, `CoreCapabilities.test.tsx`, `AuthorityStrip.test.tsx` | Updated to "Atlas 2" |

---

## What's NOT Implemented Yet (MVP Blockers)

These are the 5 items in `docs/superpowers/plans/2026-03-22-mvp-launch-readiness.md`:

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| 1 | **Email confirmation** | 🔴 Critical | No email on booking or payment. Plan: `lib/email/gmail.ts` + `lib/email/templates.ts` (Gmail service account). Wire into all 3 checkout handlers + webhook. |
| 2 | **Unit assignment** | 🔴 Critical | Reservations list shows bookings but no way to assign a physical device. Plan: `AssignUnitDropdown` + `PATCH /api/admin/reservations/[id]/assign`. |
| 3 | **Admin event management** | 🟡 High | `/admin/events` doesn't exist. Plan: full CRUD page + API routes. |
| 4 | **Admin KPI dashboard** | 🟡 High | `/admin` redirects to reservations. Plan: replace with KPI server component. |
| 5 | **Webhook integration tests** | 🟢 Low | Not user-facing. Plan: tests using `generateTestHeaderString`. |

---

## Agreed Next Step

User is doing a full manual E2E pass on the staging site and writing personal notes.
Then: cross-reference those notes against `docs/superpowers/plans/2026-03-22-mvp-launch-readiness.md` to triage:
- Launch blocker
- Polish
- Out of scope for MVP

**Before starting that session:** make sure staging is up to date — 3 commits were ahead of `origin/dev` as of 2026-03-25. Run `git push` if not done.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `docs/superpowers/plans/2026-03-22-mvp-launch-readiness.md` | Full MVP implementation plan |
| `docs/e2e-test-log.md` | Manual E2E test results — what passed, what failed, what's pending |
| `supabase/migrations/` | All DB migrations (005 + 006 are Phase 4.5) |
| `lib/checkout/handlers/` | Per-type checkout handlers (rental-event, rental-custom, regatta-package) |
| `lib/db/packages.ts` | Package availability repository |
| `app/packages/` | /packages booking page (all client components) |
| `app/api/checkout/route.ts` | Checkout dispatch shell — calls `requireAuth()` then dispatches by `reservation_type` |

---

## Architecture Reminders

- **Auth gate:** Every API route must call `requireAuth()` or `requireAdmin()` before any Supabase query. No RLS fallback — service role key bypasses all policies.
- `supabaseAdmin` = service role (server-only). `supabase` = anon key (public reads only).
- Stripe is in **test mode** (`sk_test_...`). Use card `4242 4242 4242 4242` for testing.
- RaceSense requires **90-day advance booking** — test dates must be 90+ days out.
- `units` table uses `added_at` (not `created_at`) for the timestamp column.

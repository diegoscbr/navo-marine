# MVP Launch Readiness

**Date:** 2026-03-20
**Branch:** `dev` (37 commits ahead of `main`)
**Status:** 5 launch blockers remaining before go-live

---

## Launch Criteria

A launch is successful when:

1. A customer can book an **Atlas 2 rental** or a **regatta management package**, pay via Stripe, and receive an **email confirmation**.
2. The admin can perform all day-to-day operations — managing events, assigning units, monitoring bookings and availability — **entirely within the app**. No Supabase dashboard access required.

---

## Section 1: Current Capability (Phase 1–4.5)

All of the following is implemented on `dev`, tested (189 tests, 91% coverage), and ready to deploy.

### Customer-Facing
| Feature | Route | Notes |
|---------|-------|-------|
| Landing page + storefront | `/`, `/products`, `/products/[slug]` | Public, hardcoded |
| Google OAuth login | `/login` | NextAuth v5 |
| Atlas 2 rental booking | `/reserve` | Event-based, date-window, and custom dates with extra-days stepper |
| Regatta package booking | `/packages` | 3-step flow: choose package → pick dates → review → Stripe checkout |
| Stripe Checkout | `POST /api/checkout` | Dispatches to per-type handlers (`rental_event`, `rental_custom`, `regatta_package`) |
| Payment confirmation | `POST /api/stripe/webhook` | Creates order, updates reservation status, handles HOLD vs. capture |
| Automatic expiry | pg_cron | Unpaid reservations expire; units return to available |

### Admin-Facing
| Feature | Route | Notes |
|---------|-------|-------|
| Reservations list | `/admin/reservations` | Status badges + HOLD indicator |
| Fleet / unit list | `/admin/fleet` | Unit detail + status override |
| Product CRUD | `/admin/products` | Full create/edit/delete |

### What Is NOT Built Yet
- Admin: add/edit rental events (races, regattas)
- Admin: assign a specific unit to a reservation
- Admin: availability vs. booked KPI dashboard
- Email: booking confirmation, payment confirmed
- Customer: order history, rental history, return form

---

## Section 2: Launch Blockers

These 5 gaps must be resolved before go-live. Each is a targeted slice of a larger planned phase — build only what's listed here.

---

### Blocker 1: Email Confirmation

**From:** Phase 6 (Gmail Notifications) — build this slice only.

**What to build:**
- `lib/email/gmail.ts` — Gmail API client: `sendEmail(to, subject, htmlBody)`
- `lib/email/templates.ts` — two templates only: `bookingPending()`, `bookingConfirmed()`
- Wire `bookingPending` into `POST /api/checkout` (fires after Stripe session created — "your booking is being processed, complete payment to confirm")
- Wire `bookingConfirmed` into `POST /api/stripe/webhook` (fires after order created — "payment received, your booking is confirmed")

**Important:** Do NOT send a confirmation email from the checkout route alone. The customer has not paid at that point. `bookingPending` is informational; `bookingConfirmed` is the authoritative confirmation.

**What to defer:** In-app notification bell, unit-assigned email, return reminder, damage report email — all Phase 6 post-launch.

**Env vars required:**
```
GMAIL_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GMAIL_FROM_ADDRESS=noreply@navomarine.com
ADMIN_NOTIFICATION_EMAIL=team@navomarine.com
```

---

### Blocker 2: Admin Event Management

**From:** Phase 7 (Admin Dashboard + Event Management) — build this slice only.

**What to build:**
- `app/admin/events/page.tsx` — list rental events with capacity
- `app/admin/events/[id]/page.tsx` — event detail with capacity editing
- `app/admin/events/AddEventForm.tsx` — client component: add event (name, date, product, capacity)
- `app/api/admin/events/route.ts` — GET/POST rental events
- `app/api/admin/events/[id]/route.ts` — PATCH/DELETE rental events
- Add Events link to `app/admin/layout.tsx` sidebar

**What to defer:** Orders view, admin KPI charts (KPI is Blocker 4 below, simpler scope).

---

### Blocker 3: Admin Unit Assignment

**From:** Phase 7 — extends the existing Phase 4.5 admin reservations page; build this slice only.

**What to build:**
- `app/api/admin/reservations/[id]/assign/route.ts` — PATCH: assign `unit_id` to a reservation
- Extend `/admin/reservations` page: add an "Assign Unit" dropdown per reservation row (lists available units, posts to assign route)

**What to defer:** Automated assignment suggestions, bulk assignment.

---

### Blocker 4: Admin KPI Dashboard

**From:** Phase 7 — build this slice only.

**What to build:**
- Extend `app/admin/page.tsx` with:
  - Units available vs. out on rental vs. damaged (count cards)
  - Reservations: pending (unpaid), confirmed, hold-authorized (count cards)
  - Recent bookings feed: last 10 reservations ordered by `created_at`

**What to defer:** pg_cron job health card, reconciliation tooling, purchase/order KPIs.

---

### Blocker 5: Webhook Integration Tests

**From:** TODOS P1 — highest-severity outstanding TODO. The Stripe webhook is the most critical codepath: it creates orders and confirms payments. Broken webhook = no revenue.

**What to build:**
- `__tests__/api/webhook.test.ts` — integration tests using `stripe.webhooks.generateTestHeaderString` to construct mock signed webhook payloads:
  - `checkout.session.completed` → reservation `reserved_paid` + order created
  - Duplicate event is a no-op (idempotent, no duplicate order)
  - Unknown `reservation_type` in metadata logs warning + returns 200
  - DB insert failure → webhook returns 500, Stripe retries

**What to defer:** Live Stripe test account E2E (covered by Section 3 manual protocol).

---

## Section 3: Stripe Sandbox Testing Protocol

Run this checklist against test keys before switching to live keys. All flows should be tested end-to-end in the deployed staging environment (`dev` → `main` preview or staging URL).

**Setup:**
- Stripe test keys active in Vercel env
- Stripe test webhook endpoint registered pointing at the staging URL
- **Verify `STRIPE_WEBHOOK_SECRET` in Vercel staging matches the signing secret shown in the Stripe Dashboard for the staging endpoint.** If this is wrong, all webhook events will be rejected and tests T5–T6 will pass vacuously.
- At least one rental event seeded with capacity ≥ 1
- All three regatta packages seeded (from migration 006)

### Test Cases

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| T1 | Atlas 2 rental — successful payment | Sign in → `/reserve` → select event → select product → checkout with test card `4242 4242 4242 4242` | Reservation status = `reserved_paid`; order created; booking confirmation email received |
| T2 | Regatta package — capture payment | Sign in → `/packages` → select package (non-RaceSense) → pick dates → review → checkout with `4242 4242 4242 4242` | Reservation status = `reserved_paid`; order created; email received |
| T3 | RaceSense package — hold/authorize | Sign in → `/packages` → select RaceSense → pick dates → review → checkout with `4242 4242 4242 4242` | Reservation status = `reserved_authorized`; HOLD badge in admin; no charge yet |
| T4 | Failed payment | Checkout with card `4000 0000 0000 0002` (declined) | Stripe shows decline; reservation stays `reserved_unpaid`; no order created |
| T5 | Duplicate webhook | Using Stripe CLI, replay the `checkout.session.completed` event from T1 | No duplicate order; webhook returns 200; idempotent |
| T6 | Unpaid reservation expiry | Create a booking, do NOT pay, wait for pg_cron expiry (or manually trigger) | Reservation status = `expired`; unit back to available |
| T7 | Admin assigns unit | After T1, go to `/admin/reservations` → assign a unit to the reservation | Reservation row shows assigned unit; unit status updated |
| T8 | Admin adds event | Go to `/admin/events` → add a new rental event | Event appears in event list; available on `/reserve` for new bookings |
| T9 | Over-capacity block | Seed a separate rental event with capacity = 1 and confirm it is fully booked (create a reservation for it manually in Supabase). Attempt to checkout for that event. | Checkout returns an availability error; no Stripe session created. **Note: do NOT reuse T1's event — seed a dedicated capacity-1 event for this test.** |
| T10 | Email confirmation received | From T1 and T2 | `bookingPending` email received after checkout; `bookingConfirmed` email received after webhook fires. Both contain: package name, dates, amount paid, reservation ID |
| T11 | 3DS card flow | Checkout with `4000 0025 0000 3155`, complete the 3DS challenge | Reservation status = `reserved_paid`; order created; `bookingConfirmed` email received |

**Stripe test cards reference:**
- `4242 4242 4242 4242` — successful charge
- `4000 0025 0000 3155` — 3D Secure required
- `4000 0000 0000 0002` — card declined

---

## Section 4: Production Go-Live Checklist

Run in this order. Each step is a hard gate — do not proceed past a failing step.

| # | Step | How | Verify |
|---|------|-----|--------|
| 1 | Apply Supabase migrations to prod | Run `005_phase_4_5_schema.sql` and `006_phase_4_5_seed.sql` via Supabase MCP `apply_migration` | Run `SELECT name FROM supabase_migrations ORDER BY executed_at DESC LIMIT 5` and confirm both migrations appear. **If either is missing, STOP — do not proceed to Step 2.** |
| 2 | PR: `dev` → `main` | Create PR, review diff, merge | Vercel triggers deploy |
| 3 | Set live Stripe keys in Vercel | `STRIPE_SECRET_KEY=sk_live_...`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...` | Vercel env vars |
| 4 | Register prod Stripe webhook | Stripe Dashboard → Webhooks → Add endpoint: `https://navomarine.com/api/stripe/webhook`, event: `checkout.session.completed` | Copy signing secret |
| 5 | Set `STRIPE_WEBHOOK_SECRET` in Vercel | Paste signing secret from step 4 | Vercel env vars |
| 6 | Set Gmail env vars in Vercel | `GMAIL_SERVICE_ACCOUNT_KEY`, `GMAIL_FROM_ADDRESS`, `ADMIN_NOTIFICATION_EMAIL` | Vercel env vars |
| 7 | Redeploy Vercel | Trigger redeploy to pick up new env vars | Deploy succeeds |
| 8 | Smoke test on prod | Complete one real Atlas 2 rental with a real card (refund after) | Reservation in DB, order created, email received |
| — | **If Step 8 fails** | Immediately set Stripe keys back to test mode in Vercel and redeploy. Refund the customer manually via Stripe Dashboard. Investigate before re-attempting go-live. | — |

---

## Section 5: Post-Launch Backlog

Prioritized by operational risk, not phase order.

| Priority | Item | Why | Original Phase |
|----------|------|-----|----------------|
| **P0 — do within 24h of first RaceSense booking** | Write RaceSense hold capture runbook | Stripe auth holds expire after 7 days. Missed window = lost revenue, no recourse. | TODOS P2 |
| **P1 — week 1** | Human-readable order numbers (`NM-20260320-A3K7`) | Sequential integers leak business volume and are unreadable for customer support calls. Deferred from launch because first few orders can be looked up by UUID — not sustainable beyond ~20 orders. | TODOS P2 |
| **P1 — week 1** | Customer dashboard: order history + rental history | Customers have no in-app view of their bookings. Stripe receipt is the only artifact. | Phase 5 |
| **P1 — week 2** | Remaining lifecycle emails: unit assigned, return reminder | Reduces manual admin coordination per booking | Phase 6 |
| **P2 — week 3** | Customer return form | Currently returns are logged manually by admin | Phase 5 |
| **P2 — month 1** | Admin returns list | Supports damage tracking as volume grows | Phase 5 |
| **P3 — month 2** | Purchase flow (direct product sales) | Only needed if selling units, not just renting | Phase 7 |
| **P3 — month 2** | Atomic availability check (Postgres RPC) | Eliminates TOCTOU oversell race at high volume | TODOS P3 |
| **Defer indefinitely** | In-app notification bell | Nice to have; email covers this | Phase 6 |
| **Defer indefinitely** | Stripe Tax integration | Business + volume decision | TODOS P3 |

---

## Comparison Against Phased Plan

| Phase | Original scope | MVP verdict | Rationale |
|-------|---------------|-------------|-----------|
| Phase 1–4.5 | Schema, storefront, rentals, packages | **Complete ✓** | Fully built and tested on `dev` |
| Phase 5 | Return form + customer dashboard | **Defer to post-launch** | Returns handled manually; customer dashboard is week-1 |
| Phase 6 | Gmail notifications + in-app bell | **Partial** — `bookingPending` + `bookingConfirmed` only at launch | Bell and lifecycle emails are week-2 |
| Phase 7 | Admin KPI + event mgmt + purchase flow | **Partial** — event mgmt (Blocker 2) + unit assign (Blocker 3) + KPI (Blocker 4) only | Purchase flow deferred; these 3 are launch blockers |
| TODOS P1 | Webhook integration tests | **Launch blocker (Blocker 5)** | Webhook is the most critical codepath — no revenue without it |
| TODOS P2 | RaceSense hold runbook, order numbers, reconciliation job | **Post-launch P0/P1** | Deferrable for first ~20 orders; see post-launch backlog |
| TODOS P3 | Atomic availability, Stripe Tax, pg_cron monitoring | **Defer** | Low volume at launch; revisit at scale |

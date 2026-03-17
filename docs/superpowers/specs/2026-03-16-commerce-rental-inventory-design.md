# Navo Marine — Commerce, Rental & Inventory System Design

**Date:** 2026-03-16
**Status:** Approved (CEO review complete 2026-03-16)
**Scope:** Direct sales and rentals via storefront, physical unit fleet tracking, Supabase + Stripe integration, admin/customer dashboards, Gmail notifications.

---

## 1. Goal

Enable Navo Marine to sell and rent Atlas 2 units (and future products) directly through the website. Give the operations team full visibility into where every physical unit is, who has it, and what its condition is at all times.

## 2. Architecture

**Approach:** Full Supabase Postgres (replaces SQLite/Prisma) + Stripe Checkout (hosted redirect) + Gmail API for email. Single database for all data — product catalog, unit fleet, reservations, orders, and notifications.

```
Customer Browser
      │
      ▼
Next.js App Router (existing)
      │
      ├── /products/*                  Storefront (DB-driven)
      ├── /reserve                     Rental booking flows
      ├── /dashboard/*                 Customer orders, rentals, return form
      ├── /admin/*                     Admin fleet, reservations, events, financials
      │
      ├── POST /api/checkout                        → Stripe Checkout session
      ├── POST /api/stripe/webhook                  → Order/reservation state machine
      ├── POST /api/return/[id]                     → Return form submission
      └── PATCH /api/admin/reservations/[id]/assign → Admin unit assignment
            │
            ▼
      Supabase Postgres (service role key — server-side only)
            │
            ├── pg_cron (hourly)   → expire unpaid reservations + send return form emails
            └── Row-level checks enforced in server API routes via NextAuth session
                (NOT via Supabase auth.uid() — see Section 4 note)

      Gmail API (Google Workspace service account + domain-wide delegation)
            └── transactional email: noreply@navomarine.com
```

**Auth note:** This project uses NextAuth v5 + Google OAuth, not Supabase Auth. Supabase `auth.uid()` RLS therefore cannot be used — it has no awareness of NextAuth sessions. All row-level access control is enforced server-side in API routes by checking `session.user.email` and `session.user.id` from NextAuth before any Supabase query. The Supabase **service role key** is used exclusively on the server; the anon key is used for public read-only data only (product catalog, event listings).

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (existing) |
| Database | Supabase Postgres (replaces SQLite/Prisma) |
| Auth | NextAuth v5 + Google OAuth (existing) |
| Payments | Stripe Checkout + Webhooks |
| Email | Gmail API — Google Workspace service account + domain-wide delegation |
| Scheduling | Supabase `pg_cron` — 24hr expiry + return form email trigger |
| DB client | Supabase JS client with service role key (server only) |
| Dev tooling | Stripe MCP + Supabase MCP |

## 4. Roles & Access

Two roles: `admin` and `customer`.

- **`admin`** — any `@navomarine.com` Google login. Automatically granted via existing middleware. Admin portal link visible in Navbar immediately after OAuth.
- **`customer`** — all other authenticated users.

**Access enforcement:** All protected API routes check `session.user.email` (NextAuth) server-side. No client-side role checks. Admin routes additionally verify `email.endsWith('@navomarine.com')`.

| Capability | customer | admin |
|---|---|---|
| Browse + book | ✓ | ✓ |
| View own orders/rentals | ✓ | ✓ |
| Submit return/condition form | ✓ | ✓ |
| View all reservations + unit statuses | — | ✓ |
| Manually update unit status | — | ✓ |
| Assign unit to reservation | — | ✓ |
| Manage events + date windows | — | ✓ |
| Add/retire units from fleet | — | ✓ |
| View financial data + Stripe links | — | ✓ |

Protected routes:
```
/dashboard/*   → any authenticated user (NextAuth session required)
/admin/*       → @navomarine.com only (middleware enforced)
```

## 5. Data Model

All money values stored as integer cents. Prices displayed as USD; tax is included in `base_price_cents` — no separate tax calculation needed (Atlas 2 is sold tax-included; `tax_cents` on orders is always 0 and retained for future non-included-tax products).

### 5.1 Products (multi-product ready)

**`products`** — top-level sellable items (Atlas 2 first, extensible)
```
id                    uuid pk
slug                  text unique not null        -- 'atlas-2'
name                  text not null
subtitle              text null
description_short     text
description_long_md   text
base_price_cents      integer not null
currency              text not null default 'usd'
tax_included          boolean not null default true
active                boolean not null default true
seo_title             text null
seo_description       text null
created_at            timestamptz default now()
updated_at            timestamptz default now()
```

**`product_media`** — gallery + hero media
```
id           uuid pk
product_id   uuid fk -> products.id
media_type   text check in ('image','video')
url          text not null
alt_text     text null
sort_order   integer default 0
```

**`product_sections`**, **`product_feature_bullets`**, **`product_spec_groups`**, **`product_specs`**, **`product_box_items`** — per March 2026 plan (product marketing content blocks, tech specs, in-the-box items).

**`addons`** — warranty, accessories, services (product-agnostic)
```
id           uuid pk
slug         text unique not null
name         text not null
description  text null
addon_type   text check in ('warranty','accessory','service')
price_cents  integer not null
currency     text default 'usd'
active       boolean default true
created_at   timestamptz default now()
updated_at   timestamptz default now()
```

**`product_addons`** — join: which addons attach to which product
```
product_id        uuid fk -> products.id
addon_id          uuid fk -> addons.id
default_selected  boolean default false
primary key (product_id, addon_id)
```

### 5.2 Physical Unit Fleet

**`units`** — one row per physical device
```
id            uuid pk
navo_number   text unique not null   -- '01' through '40', and beyond
serial_number text null              -- manufacturer serial if known
product_id    uuid fk -> products.id not null
status        text not null check in (
                'available',
                'reserved_unpaid',
                'reserved_paid',
                'in_transit',
                'at_event',
                'returned',
                'damaged',
                'lost',
                'sold'
              )
notes         text null              -- freeform admin notes
added_at      timestamptz default now()
retired_at    timestamptz null       -- set on sold/lost/written off
```

Status `returned` is a transient holding state after a customer submits a return form and before admin confirms the unit is back and available. Admin marks it `available` after physical inspection or from `/admin/returns`.

**`unit_events`** — immutable audit log, append-only
```
id           uuid pk
unit_id      uuid fk -> units.id
event_type   text not null   -- 'status_changed' | 'checked_in' | 'damage_reported' | 'sold' | 'assigned' | 'returned'
from_status  text null
to_status    text null
actor_type   text not null   -- 'admin' | 'customer' | 'system'
actor_id     text null       -- NextAuth user id or 'system'
notes        text null
metadata     jsonb default '{}'
created_at   timestamptz default now()
```

### 5.3 Events & Date Windows

**`rental_events`** — Navo-sponsored regattas/events
```
id          uuid pk
name        text not null
location    text null
event_url   text null
start_date  date not null
end_date    date not null
active      boolean default true
created_at  timestamptz default now()
```

**`rental_event_products`** — which products are rentable at each event, at what price.
`capacity` is the admin-set maximum units to send to this event for this product. Actual availability is computed at booking time as: `capacity - count(reservations WHERE event_id = X AND product_id = Y AND status IN ('reserved_unpaid','reserved_paid'))`. `inventory_status` is a manual admin-set flag for UI display (e.g. "Inventory On the Way") independent of capacity math.
```
event_id            uuid fk -> rental_events.id
product_id          uuid fk -> products.id
rental_price_cents  integer not null
late_fee_cents      integer not null default 3500
reserve_cutoff_days integer not null default 14
capacity            integer not null          -- max units admin is sending to this event
inventory_status    text not null default 'in_stock'
                    check in ('in_stock','inventory_on_the_way','out_of_stock')
primary key (event_id, product_id)
```

**`date_windows`** — admin-gated custom rental availability slots
```
id          uuid pk
label       text null        -- e.g. 'Spring practice block'
start_date  date not null
end_date    date not null
active      boolean default true
created_at  timestamptz default now()
```

**`date_window_allocations`** — which products/how many units per date window.
`capacity` same semantics as `rental_event_products.capacity` — admin-set cap, live availability computed from reservations.
```
date_window_id  uuid fk -> date_windows.id
product_id      uuid fk -> products.id
capacity        integer not null
primary key (date_window_id, product_id)
```

### 5.4 Reservations

**`reservations`** — covers all booking types (rental event, rental custom, purchase).

For purchases: `reservation_type = 'purchase'`, `sail_number` is null, `event_id` and `date_window_id` are null. `unit_id` is null until admin assigns post-payment.
For rentals: `sail_number` is required (enforced server-side before checkout session creation). `event_id` or `date_window_id` is set depending on rental type.

Checkout session type is disambiguated via Stripe session `metadata.reservation_type` set at creation time. Webhook handler reads this field to route to the correct state machine branch.

```
id                          uuid pk
reservation_type            text not null check in ('rental_event','rental_custom','purchase')
product_id                  uuid fk -> products.id not null
unit_id                     uuid fk -> units.id null          -- assigned post-payment by admin
event_id                    uuid fk -> rental_events.id null
date_window_id              uuid fk -> date_windows.id null
user_id                     text not null                     -- NextAuth session user id
customer_email              text not null
sail_number                 text null                         -- required for rentals, enforced in API
status                      text not null default 'reserved_unpaid' check in (
                              'reserved_unpaid',
                              'reserved_paid',
                              'cancelled',
                              'completed'
                            )
stripe_checkout_session_id  text null
stripe_payment_intent_id    text null
total_cents                 integer not null
late_fee_applied            boolean default false
late_fee_cents              integer not null default 0
expires_at                  timestamptz null                  -- set to now()+24h on creation
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

`draft` status is removed — reservations are created at the point the customer initiates checkout, never earlier.

### 5.5 Cart & Orders

**`carts`** — persistent cart for guest or authenticated users
```
id                          uuid pk
user_id                     text null
status                      text check in ('active','converted','abandoned') default 'active'
currency                    text not null default 'usd'
stripe_checkout_session_id  text null
expires_at                  timestamptz null
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

**`cart_items`** — line items (products, add-ons)
```
id                uuid pk
cart_id           uuid fk -> carts.id
item_type         text check in ('product_variant','addon')
reference_id      uuid not null
title_snapshot    text not null
unit_price_cents  integer not null
quantity          integer not null default 1
metadata          jsonb default '{}'
created_at        timestamptz default now()
```

**`orders`** — purchase ledger. One order is created per completed Stripe checkout session. For rentals, `reservation_id` links to the corresponding reservation row. For purchases, same.
```
id                          uuid pk
order_number                text unique not null
user_id                     text null
customer_email              text not null
reservation_id              uuid fk -> reservations.id null
shipping_address            jsonb null   -- { name, line1, line2, city, state, zip, country }
status                      text check in ('pending','paid','fulfilled','cancelled','refunded')
subtotal_cents              integer not null
tax_cents                   integer not null default 0
total_cents                 integer not null
currency                    text not null default 'usd'
stripe_customer_id          text null
stripe_checkout_session_id  text null
stripe_payment_intent_id    text null
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

**`order_items`** — immutable snapshot of purchased line items
```
id                  uuid pk
order_id            uuid fk -> orders.id
item_type           text not null
reference_id        uuid null
title_snapshot      text not null
unit_price_cents    integer not null
quantity            integer not null
metadata_snapshot   jsonb default '{}'
```

**`stripe_events`** — idempotent webhook processing ledger
```
id               uuid pk
stripe_event_id  text unique not null   -- prevents duplicate processing
event_type       text not null
payload          jsonb not null
processed_at     timestamptz default now()
```

### 5.6 Return Reports

**`return_reports`** — customer end-of-event condition form submission. One per reservation (enforced by unique constraint). Form is disabled in UI once submitted.
```
id              uuid pk
reservation_id  uuid fk -> reservations.id unique   -- one report per reservation
unit_id         uuid fk -> units.id null             -- nullable: unit may not be assigned yet at time of submission
submitted_by    text not null     -- NextAuth user id
condition       text not null check in ('good','minor_damage','major_damage')
notes           text null
damage_flagged  boolean not null default false   -- auto-true if condition != 'good'
created_at      timestamptz default now()
```

### 5.7 Notifications

**`notifications`** — in-app bell icon feed for both admin and customer
```
id          uuid pk
user_id     text not null
message     text not null
read        boolean not null default false
link        text null          -- optional deep-link to relevant page
created_at  timestamptz default now()
```

### 5.8 Scheduled Jobs (pg_cron)

Two `pg_cron` jobs, both implemented as Postgres stored procedures called by the scheduler.

**Job 1 — Expire unpaid reservations (runs hourly)**
```sql
CREATE OR REPLACE FUNCTION expire_unpaid_reservations()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, unit_id, customer_email, user_id
    FROM reservations
    WHERE status = 'reserved_unpaid' AND expires_at < now()
  LOOP
    -- Cancel reservation
    UPDATE reservations
    SET status = 'cancelled', updated_at = now()
    WHERE id = r.id;

    -- Free unit if one was tentatively linked
    IF r.unit_id IS NOT NULL THEN
      UPDATE units SET status = 'available' WHERE id = r.unit_id;
      INSERT INTO unit_events (unit_id, event_type, from_status, to_status, actor_type, notes)
      VALUES (r.unit_id, 'status_changed', 'reserved_unpaid', 'available', 'system',
              'Reservation expired after 24 hours');
    END IF;

    -- Create in-app notification for customer
    INSERT INTO notifications (user_id, message, link)
    VALUES (r.user_id, 'Your reservation expired. Book again anytime.',
            '/reserve');
  END LOOP;
END;
$$;

SELECT cron.schedule('expire-unpaid-reservations', '0 * * * *',
  'SELECT expire_unpaid_reservations()');
```
Email to customer is sent **directly from the calling API route or webhook handler** that triggers the cancellation — not via a polling mechanism. The `notifications` table is UI-only (bell icon feed); it is NOT an email queue. Gmail API calls are non-blocking: a failed send must be logged but must NOT cause the API handler to fail or retry.

**Job 2 — Send return form emails when events end (runs daily at 08:00 UTC)**
```sql
CREATE OR REPLACE FUNCTION send_return_form_reminders()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Insert notification rows for customers whose event ended yesterday
  -- NOTE: pg_cron only creates the in-app notification rows.
  -- Email sending is handled by a separate Vercel Cron job that calls
  -- POST /api/worker/send-return-reminders (or equivalent) once per day after this job runs.
  INSERT INTO notifications (user_id, message, link)
  SELECT r.user_id,
         'Your event has ended. Please submit your return form.',
         '/dashboard/rentals/' || r.id || '/return'
  FROM reservations r
  JOIN rental_events e ON e.id = r.event_id
  WHERE r.status = 'reserved_paid'
    AND e.end_date = current_date - 1
    AND NOT EXISTS (
      SELECT 1 FROM return_reports rr WHERE rr.reservation_id = r.id
    );
END;
$$;

SELECT cron.schedule('send-return-reminders', '0 8 * * *',
  'SELECT send_return_form_reminders()');
```

## 6. API Routes

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/checkout` | customer/admin | Create Stripe Checkout session. Sets `metadata.reservation_type`. Validates sail_number for rentals server-side. Checks live availability (count query) before creating session. |
| POST | `/api/stripe/webhook` | Stripe signature | State machine: routes on `metadata.reservation_type`. `checkout.session.completed` → creates order + sets reservation `reserved_paid`. Deduplicates via `stripe_events`. |
| POST | `/api/return/[id]` | customer (owns reservation) | Submit return form. Creates `return_reports` row. Updates unit status. Fires notifications. |
| PATCH | `/api/admin/reservations/[id]/assign` | admin | Assign a specific unit to a paid reservation. Validates unit is `available` or `reserved_paid` for same reservation. Updates `reservations.unit_id` + `units.status`. Appends `unit_events`. Fires "unit assigned" email to customer. |
| PATCH | `/api/admin/units/[id]/status` | admin | Manual unit status override. Validates target unit has no conflicting active paid reservation before allowing override to `available`. Requires notes. Appends `unit_events`. |

## 7. User Flows

### 7.1 Purchase
1. Customer lands on `/products/[slug]`, selects quantity + add-ons
2. Shipping address captured on checkout page before Stripe redirect
3. Adds to cart → `POST /api/checkout`:
   - **Step A:** Create Stripe Checkout session first (if Stripe fails here, return 503 — nothing written to DB)
   - **Step B:** Create reservation + cart converted rows with `stripe_checkout_session_id` already known
   - Returns Stripe session URL to redirect customer
4. Customer pays on Stripe hosted page
5. Webhook `checkout.session.completed` → order created (`paid`), reservation updated to `reserved_paid`, `shipping_address` stored on order. **All three DB writes in a single transaction (Supabase RPC).**
6. Admin assigns a specific unit via `PATCH /api/admin/reservations/[id]/assign` → unit status: `sold`, `retired_at` set, customer email sent

**Note: Cart is purchase-only.** The cart (`carts`/`cart_items`) is used exclusively for product purchases. Rentals bypass the cart and go directly to `POST /api/checkout` with rental-specific params.

### 7.2 Rental — Event-Based
1. Customer goes to `/reserve`, selects "Rent for an Event" tab
2. Selects product, then event from dropdown (only active events with `inventory_status != 'out_of_stock'` shown; live capacity shown per product)
3. Enters sail number (required — form blocks submission without it)
4. System shows price + late fee if booking is within `reserve_cutoff_days` of event start
5. `POST /api/checkout`: server validates sail_number present AND event_id present and active, runs live availability count, then creates Stripe session first (if Stripe fails, return 503 — nothing written to DB), then creates reservation with `stripe_checkout_session_id` set, `expires_at = now()+24h`, `metadata.reservation_type = 'rental_event'`
6. Webhook → reservation: `reserved_paid`
7. Admin assigns unit + advances status through `reserved_paid → in_transit → at_event`
8. `pg_cron` job fires next morning after `end_date` → return form notification to customer
9. Customer submits `/dashboard/rentals/[id]/return`
10. If damage: unit → `damaged`, admin alert fired. If clean: unit → `returned` (admin confirms → `available`)

### 7.3 Rental — Custom Dates
1. Customer selects "Custom Dates" tab on `/reserve`
2. Only admin-published date windows shown (live availability count per product per window)
3. Selects window, enters sail number → same checkout flow, `metadata.reservation_type = 'rental_custom'`
4. Reservation linked to `date_window_id` instead of `event_id`

### 7.4 Availability Check (no race condition)
Unit assignment is always manual — no unit is speculatively locked at booking time. Availability is enforced by capacity caps. At `POST /api/checkout`:
```
live_count = COUNT(reservations WHERE (event_id OR date_window_id) = X
             AND product_id = Y
             AND status IN ('reserved_unpaid', 'reserved_paid'))
IF live_count >= capacity → reject with "Sorry, this event is fully booked"
ELSE → create reservation + Stripe session
```
No SELECT FOR UPDATE needed. Two simultaneous requests that both pass the count check will both create reservations; if this pushes count over capacity, the next request will be rejected. At 50 max concurrent users this is an acceptable and rare edge case — over-booking by one unit is operationally manageable and the admin can cancel + refund one reservation manually.

### 7.5 Unpaid Expiry
- On reservation creation: `status = 'reserved_unpaid'`, `expires_at = now() + 24 hours`
- `pg_cron` fires hourly: expired reservations → `cancelled`, unit freed, in-app notification created
- Email to customer fired by Next.js email worker polling `notifications` table

## 8. Admin Dashboard — `/admin`

| Route | Purpose |
|---|---|
| `/admin` | KPI overview: units available, out on rental, unpaid expiring, open damage reports, recent activity feed |
| `/admin/fleet` | Full unit table (status, current reservation, location). Add/retire units. Click unit → audit log. Manual status override (blocked if active paid reservation exists — shows warning, requires confirmation) |
| `/admin/reservations` | All reservations filtered by status/type/event/date. Unpaid show countdown. Assign unit to paid reservation. Manual cancel + Stripe refund trigger |
| `/admin/events` | CRUD for rental events + `rental_event_products` allocations + `inventory_status`. CRUD for date windows + allocations |
| `/admin/returns` | All return form submissions. Damage-flagged surfaced first. Mark repaired → unit status `available` |
| `/admin/orders` | Financial view: all orders, Stripe payment intent links, manual status override |

Admin portal link in Navbar visible immediately after `@navomarine.com` OAuth.

## 9. Customer Dashboard — `/dashboard`

| Route | Purpose |
|---|---|
| `/dashboard` | Summary: recent order, active reservation, support links |
| `/dashboard/orders` | Purchase history with status badges |
| `/dashboard/orders/[id]` | Line-item snapshot, payment method, Stripe receipt link |
| `/dashboard/rentals` | Rental reservation history: event/dates/unit number/sail number/status |
| `/dashboard/rentals/[id]/return` | Return form: condition + notes. Disabled once submitted. |
| `/dashboard/warranty` | Purchased warranty add-ons by order |

## 10. Notifications

**Transport:** Gmail API via Google Workspace **service account with domain-wide delegation**. Uses a service account JSON key (not OAuth user credentials). Sends as `noreply@navomarine.com`. Service account key stored as env var `GMAIL_SERVICE_ACCOUNT_KEY` (JSON string).

**Email delivery pattern:** Emails are sent **directly and synchronously from the API route or webhook handler** that triggers each event (not via a background polling worker). Gmail API calls are **non-blocking** — a failed send must be caught, logged, and allowed to continue. It must never cause an API handler to fail, return 500, or prevent order/reservation state updates.

**In-app:** `notifications` table, bell icon in Navbar for both admin and customer. The `notifications` table is **UI-only** — it is NOT used as an email queue.

### Customer email triggers
| Trigger | Message |
|---|---|
| Reservation created (unpaid) | "Complete your booking within 24 hours" |
| Payment confirmed | "Booking confirmed — unit will be assigned shortly" |
| Unit assigned (`/api/admin/reservations/[id]/assign`) | "Your unit #07 is confirmed for [Event]" |
| Unit marked in transit | "Your unit is on its way to the event" |
| Reservation expired | "Your reservation expired — book again anytime" |
| Return form (event end date +1 day, via pg_cron) | "Please submit your return form" |
| Damage flagged | "Thanks for your report — our team will follow up" |

### Admin email triggers
| Trigger | Message |
|---|---|
| New paid reservation (webhook) | "New booking: [Customer] — [Product] — [Event]" |
| Reservation expired | "Unit freed: reservation expired for [Customer]" |
| Damage reported | "⚠️ Damage reported on unit #07 by [Customer]" |
| Unit returned (clean) | "Unit #07 returned — available for reassignment" |

## 11. MCP Dev Tooling Setup

**Stripe MCP** — already installed (`/plugin install stripe`). Enables Claude to create products, prices, and webhooks directly in Stripe during implementation.

**Supabase MCP** — to be installed:
```bash
claude mcp add supabase
```
Enables Claude to run migrations, inspect tables, and manage data directly.

**Stripe local webhook forwarding** (Phase 4 dev):
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Required `.env.local` keys:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
GMAIL_SERVICE_ACCOUNT_KEY=          # full JSON string of service account key file
GMAIL_FROM_ADDRESS=noreply@navomarine.com
```

## 12. Phased Delivery

Each phase ends with a **user E2E testing gate** — owner personally tests before the next phase begins.

### Phase 1 — Foundation

**Important:** Phase 1 must be done in a feature branch (not on `main`). Merge to main only after E2E gate passes. Phase 1 removes Prisma/SQLite — this is a one-way door. Keep `main` operational until the gate confirms Supabase is working.

- Install Supabase MCP, create Supabase project
- Enable `pg_cron` extension in Supabase project settings
- Write and run all migrations (full schema above, including all indexes from TODOS.md)
- Seed: Atlas 2 product, 40 units (01–40), sample rental event
- Migrate existing SQLite admin product data to Supabase (export from Prisma, import to Supabase)
- Remove Prisma/SQLite, swap in Supabase JS client

**E2E gate:** Supabase table editor shows all 40 units. Admin product pages still work. Visit `/admin/fleet` stub shows unit list. **Only merge to `main` after this gate passes.**

### Phase 2 — Storefront + Fleet Admin
- `/products/[slug]` renders from Supabase (all product data DB-driven)
- `/admin/fleet`: view, add, retire units; manual status override with validation; audit log per unit

**E2E gate:** Visit Atlas 2 product page — content renders from DB. Admin: add a test unit, change its status, verify audit log entry. Attempt to override a paid-reservation unit to `available` — confirm warning appears.

### Phase 3 — Reservation Flows + Stripe Checkout
- Install Stripe MCP, create Stripe account + products/prices
- `/reserve`: event-based and custom-date rental booking UI with live availability counts
- `POST /api/checkout` — session creation with sail_number validation, availability check, `expires_at` set, `metadata.reservation_type` embedded

**E2E gate:** Book a rental in Stripe test mode. Verify reservation row created with `reserved_unpaid` status and `expires_at` 24h out. Verify capacity count decrements on UI.

### Phase 4 — Webhooks + Expiry + Unit Assignment
- `POST /api/stripe/webhook` — full state machine, idempotency via `stripe_events`
- `stripe listen` local forwarding for dev
- `pg_cron` expiry job deployed
- `PATCH /api/admin/reservations/[id]/assign` — admin unit assignment endpoint
- `/admin/reservations` assign-unit UI

**E2E gate:** Pay for a rental, verify webhook transitions to `reserved_paid`. Let an unpaid reservation hit 24h, verify `pg_cron` cancels it and frees the unit. Admin assigns a unit — verify `unit_events` entry created.

### Phase 5 — Return Form + Damage Reporting + Customer Dashboard
- `/dashboard/rentals/[id]/return` — customer return form (condition + notes, disabled after submit)
- `POST /api/return/[id]` — condition report processing, unit status update
- `/admin/returns` — damage report review, mark repaired
- `/dashboard/orders`, `/dashboard/rentals`, `/dashboard/warranty` — customer history views

**E2E gate:** Submit return form with damage. Verify unit → `damaged`. Mark repaired in admin → `available`. Verify form is disabled on second visit. Customer views order and rental history.

### Phase 6 — Gmail Notifications + In-App Bell
- Google Workspace service account setup + domain-wide delegation
- Gmail API integration — all email triggers wired
- `pg_cron` return form reminder job deployed
- `notifications` table + bell icon in Navbar

**E2E gate:** Complete full booking → confirmation email arrives. Submit damage report → admin alert email arrives. Wait for daily cron or manually trigger return reminder → email arrives.

### Phase 7 — Admin Dashboard + Purchase Flow + QA
- `/admin/events`, `/admin/orders` full build-out
- Purchase flow with shipping address capture
- Admin assigns unit to purchase → unit `sold`
- Navbar admin portal link visibility after `@navomarine.com` login
- End-to-end QA pass across all flows

**E2E gate:** Full walkthrough — purchase (with shipping address), rental, pay, assign unit, transit, event end, return, damage, repair. Verify every status transition, every notification email, every audit log entry.

## 13. Key Implementation Rules

1. **Never trust client pricing** — all totals recalculated server-side before Stripe session creation
2. **Snapshot order items** — titles/prices frozen at purchase time; product edits don't affect past orders
3. **Webhook idempotency is mandatory** — `stripe_events.stripe_event_id` unique constraint prevents duplicate fulfillment. All three webhook writes (stripe_events + order + reservation update) must be wrapped in a Supabase DB transaction (RPC) — partial writes are not acceptable
4. **Unit assignment is always manual** — admin picks which physical unit fulfils each paid reservation; never auto-assign
5. **No Supabase RLS** — access control enforced in Next.js API routes via NextAuth session. Service role key is server-only, never exposed to client. **CRITICAL: every new API route must call `requireAuth()` or `requireAdmin()` before any Supabase query — there is no DB-level fallback**
6. **Audit log is append-only** — never update or delete `unit_events` rows
7. **pg_cron is source of truth for expiry** — do not rely on client-side timers
8. **Multi-product by default** — all event/window availability is per-product via join tables
9. **Gmail service account only** — no third-party email service; JSON key via env var, domain-wide delegation. Gmail calls are non-blocking: catch errors, log them, never throw
10. **sail_number enforced server-side** — validated in `POST /api/checkout` before session creation, not in DB constraint
11. **Admin unit override blocked on active paid reservations** — API returns 409 with explanation; admin must cancel reservation first
12. **Checkout session type embedded in Stripe metadata** — `metadata.reservation_type` routes webhook to correct handler branch
13. **Stripe session created before reservation row** — call Stripe API first; only write to DB once a valid session_id is obtained. If Stripe fails, return 503 with no DB writes
14. **Cart is purchase-only** — the `carts`/`cart_items` system handles product purchases only. Rentals bypass the cart and call `POST /api/checkout` directly with event/window params
15. **Admin assignment must verify reservation is still active** — before assigning a unit, verify `reservation.status = 'reserved_paid'` in the same DB transaction to prevent assigning to a pg_cron-cancelled reservation

## 14. Definition of Done (MVP)

- [ ] All 40 units visible and manageable in admin fleet view
- [ ] Atlas 2 product page rendered from Supabase
- [ ] Customer can book a rental (event + custom date) end-to-end in Stripe test mode
- [ ] Customer can purchase a unit end-to-end in Stripe test mode (with shipping address)
- [ ] Webhook transitions reservation and unit statuses correctly, idempotently
- [ ] Unpaid reservations auto-expire after 24 hours via pg_cron
- [ ] Admin can assign a unit to a paid reservation; customer receives "unit assigned" email
- [ ] Customer can submit return form; damage auto-flags unit; form disabled after submit
- [ ] Admin receives email on new booking and damage report
- [ ] Customer receives confirmation, "unit assigned", and return form reminder emails
- [ ] Admin portal visible in Navbar after `@navomarine.com` login
- [ ] Second product can be added with zero schema changes

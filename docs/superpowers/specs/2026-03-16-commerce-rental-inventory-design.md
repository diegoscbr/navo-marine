# Navo Marine — Commerce, Rental & Inventory System Design

**Date:** 2026-03-16
**Status:** Approved
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
      ├── /products/*          Storefront (DB-driven)
      ├── /reserve             Rental booking flows
      ├── /dashboard/*         Customer orders, rentals, return form
      ├── /admin/*             Admin fleet, reservations, events, financials
      │
      ├── POST /api/checkout           → Stripe Checkout session
      ├── POST /api/stripe/webhook     → Order/reservation state machine
      └── POST /api/return/[id]        → Return form submission
            │
            ▼
      Supabase Postgres
            │
            ├── pg_cron (hourly)   → expire unpaid reservations
            └── RLS policies       → customer data isolation

      Gmail API (Google Workspace service account)
            └── transactional email: noreply@navomarine.com
```

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (existing) |
| Database | Supabase Postgres (replaces SQLite/Prisma) |
| Auth | NextAuth v5 + Google OAuth (existing) |
| Payments | Stripe Checkout + Webhooks |
| Email | Gmail API — Google Workspace service account |
| Scheduling | Supabase `pg_cron` — 24hr unpaid reservation expiry |
| DB client | Supabase JS client (replaces Prisma) |
| Dev tooling | Stripe MCP + Supabase MCP |

## 4. Roles & Access

Two roles: `admin` and `customer`.

- **`admin`** — any `@navomarine.com` Google login. Automatically granted via existing middleware. Admin portal link visible in Navbar immediately after OAuth.
- **`customer`** — all other authenticated users.

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
/dashboard/*   → any authenticated user
/admin/*       → @navomarine.com only (middleware enforced)
```

## 5. Data Model

All money values stored as integer cents.

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

**`product_media`**, **`product_sections`**, **`product_feature_bullets`**, **`product_spec_groups`**, **`product_specs`**, **`product_box_items`** — unchanged from March 2026 plan.

**`addons`** — warranty, accessories, services (product-agnostic)
```
id           uuid pk
slug         text unique not null
name         text not null
addon_type   text check in ('warranty','accessory','service')
price_cents  integer not null
currency     text default 'usd'
active       boolean default true
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

**`unit_events`** — immutable audit log, append-only
```
id           uuid pk
unit_id      uuid fk -> units.id
event_type   text not null   -- 'status_changed' | 'checked_in' | 'damage_reported' | 'sold' | 'assigned' | 'returned'
from_status  text null
to_status    text null
actor_type   text not null   -- 'admin' | 'customer' | 'system'
actor_id     text null
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

**`rental_event_products`** — which products are rentable at each event, at what price
```
event_id            uuid fk -> rental_events.id
product_id          uuid fk -> products.id
rental_price_cents  integer not null
late_fee_cents      integer not null default 3500
reserve_cutoff_days integer not null default 14
units_available     integer not null
inventory_status    text check in ('in_stock','inventory_on_the_way','out_of_stock')
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

**`date_window_allocations`** — which products/how many units per date window
```
date_window_id  uuid fk -> date_windows.id
product_id      uuid fk -> products.id
units_available integer not null
primary key (date_window_id, product_id)
```

### 5.4 Reservations

**`reservations`** — covers all booking types (rental event, rental custom, purchase)
```
id                          uuid pk
reservation_type            text not null check in ('rental_event','rental_custom','purchase')
product_id                  uuid fk -> products.id not null
unit_id                     uuid fk -> units.id null          -- assigned post-payment by admin
event_id                    uuid fk -> rental_events.id null
date_window_id              uuid fk -> date_windows.id null
user_id                     text not null                     -- auth user id
customer_email              text not null
sail_number                 text null                         -- required for all rentals
status                      text not null default 'draft' check in (
                              'draft',
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
expires_at                  timestamptz null                  -- set to now()+24h when reserved_unpaid
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

### 5.5 Cart & Orders

**`carts`**, **`cart_items`** — unchanged from March 2026 plan.

**`orders`** — purchase ledger
```
id                          uuid pk
order_number                text unique not null
user_id                     text null
customer_email              text not null
reservation_id              uuid fk -> reservations.id null
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

**`order_items`**, **`stripe_events`** — unchanged from March 2026 plan.

### 5.6 Return Reports

**`return_reports`** — customer end-of-event condition form submission
```
id              uuid pk
reservation_id  uuid fk -> reservations.id
unit_id         uuid fk -> units.id
submitted_by    text not null     -- customer user_id
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

### 5.8 Scheduled Job

**`pg_cron`** — runs every hour:
```sql
SELECT id, unit_id FROM reservations
WHERE status = 'reserved_unpaid' AND expires_at < now();
-- For each: set status = 'cancelled', unit status = 'available', fire notification
```

## 6. User Flows

### 6.1 Purchase
1. Customer lands on `/products/[slug]`, selects quantity + add-ons
2. Adds to cart → `POST /api/checkout` creates Stripe Checkout session
3. Customer pays on Stripe hosted page
4. Webhook `checkout.session.completed` → order created (status: `paid`), reservation created (status: `reserved_paid`)
5. Admin assigns a specific unit in `/admin/reservations` → unit status: `sold`, `retired_at` set

### 6.2 Rental — Event-Based
1. Customer goes to `/reserve`, selects "Rent for an Event" tab
2. Selects product, then event from dropdown (only active events with `in_stock` status shown)
3. Enters sail number
4. System shows price + late fee if booking is within `reserve_cutoff_days` of event start
5. Checkout → Stripe → Webhook → reservation: `reserved_paid`, unit: `reserved_paid` (admin assigns specific unit)
6. Admin updates unit to `in_transit` → `at_event` as it moves
7. Event ends → customer receives return form email link
8. Customer submits `/dashboard/rentals/[id]/return` → condition report
9. If damage: unit → `damaged`, admin alert fired. If clean: unit → `returned` → `available`

### 6.3 Rental — Custom Dates
1. Customer selects "Custom Dates" tab on `/reserve`
2. Only admin-published date windows shown (with available unit counts per product)
3. Selects window, enters sail number → same checkout flow as event-based
4. Reservation linked to `date_window_id` instead of `event_id`

### 6.4 Unpaid Expiry
- On reservation creation: `status = 'reserved_unpaid'`, `expires_at = now() + 24 hours`
- `pg_cron` fires hourly: expired reservations → `cancelled`, unit freed, customer email sent

### 6.5 Race Condition Handling
- Unit assignment happens inside webhook handler using `SELECT FOR UPDATE` transaction
- If two payments land simultaneously and one unit remains: second transaction triggers automatic Stripe refund + customer notification

## 7. Admin Dashboard — `/admin`

| Route | Purpose |
|---|---|
| `/admin` | KPI overview: units available, out on rental, unpaid expiring, open damage reports, recent activity feed |
| `/admin/fleet` | Full unit table (status, current reservation, location). Add/retire units. Click unit → audit log. Manual status override |
| `/admin/reservations` | All reservations filtered by status/type/event/date. Assign unit to paid reservation. Manual cancel + refund trigger |
| `/admin/events` | CRUD for rental events + `rental_event_products` allocations. CRUD for date windows + allocations |
| `/admin/returns` | All return form submissions. Damage-flagged reports surfaced first. Mark unit repaired → available |
| `/admin/orders` | Financial view: all orders, Stripe payment intent links, manual status override |

Admin portal link in Navbar visible immediately after `@navomarine.com` OAuth.

## 8. Customer Dashboard — `/dashboard`

| Route | Purpose |
|---|---|
| `/dashboard` | Summary: recent order, active reservation, support links |
| `/dashboard/orders` | Purchase history with status badges |
| `/dashboard/orders/[id]` | Line-item snapshot, payment method, Stripe receipt link |
| `/dashboard/rentals` | Rental reservation history: event/dates/unit number/sail number/status |
| `/dashboard/rentals/[id]/return` | Return form: condition (good / minor damage / major damage) + notes |
| `/dashboard/warranty` | Purchased warranty add-ons by order |

## 9. Notifications

**Transport:** Gmail API via Google Workspace service account, sent from `noreply@navomarine.com`.
**In-app:** `notifications` table, bell icon in Navbar for both admin and customer.

### Customer email triggers
| Trigger | Message |
|---|---|
| Reservation created (unpaid) | "Complete your booking within 24 hours" |
| Payment confirmed | "Booking confirmed — unit will be assigned shortly" |
| Unit assigned | "Your unit #07 is confirmed for [Event]" |
| Unit marked in transit | "Your unit is on its way to the event" |
| Reservation expired | "Your reservation expired — book again anytime" |
| Return form (event ending) | "Please submit your return form" |
| Damage flagged | "Thanks for your report — our team will follow up" |

### Admin email triggers
| Trigger | Message |
|---|---|
| New paid reservation | "New booking: [Customer] — [Product] — [Event]" |
| Reservation expired | "Unit freed: reservation expired for [Customer]" |
| Damage reported | "⚠️ Damage reported on unit #07 by [Customer]" |
| Unit returned (clean) | "Unit #07 returned — available for reassignment" |

## 10. MCP Dev Tooling Setup

Two MCP servers configured for development:

**Stripe MCP** — already installed (`/plugin install stripe`). Enables Claude to create products, prices, and webhooks directly in Stripe during implementation.

**Supabase MCP** — to be installed:
```bash
claude mcp add supabase
```
Enables Claude to run migrations, inspect tables, and configure RLS policies directly.

Required `.env.local` keys:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_FROM_ADDRESS=noreply@navomarine.com
```

## 11. Phased Delivery

Each phase ends with a **user E2E testing gate** — owner personally tests before the next phase begins.

### Phase 1 — Foundation
- Install Supabase MCP, create Supabase project
- Write and run all migrations (full schema above)
- Seed: Atlas 2 product, 40 units (01–40), sample event
- Migrate existing SQLite admin product data to Supabase
- Remove Prisma/SQLite, swap in Supabase JS client

**E2E gate:** Supabase table editor shows all 40 units. Admin product pages still work.

### Phase 2 — Storefront + Fleet Admin
- `/products/[slug]` renders from Supabase (all product data DB-driven)
- `/admin/fleet`: view, add, retire units; manual status override; audit log per unit

**E2E gate:** Visit Atlas 2 product page. Admin: add a test unit, change its status, verify audit log.

### Phase 3 — Reservation Flows + Stripe Checkout
- Install Stripe MCP, create Stripe account + products/prices
- `/reserve`: event-based and custom-date rental booking UI
- `POST /api/checkout` — Stripe Checkout session creation
- Late fee logic, sail number capture, 24hr expiry set on reservation creation

**E2E gate:** Complete a rental booking end-to-end in Stripe test mode. Verify reservation row created, unit status updated, expiry set.

### Phase 4 — Webhooks + Expiry + Unit Assignment
- `POST /api/stripe/webhook` — state machine for checkout.session.completed, refunds
- `pg_cron` hourly expiry job
- Admin: assign specific unit to paid reservation in `/admin/reservations`

**E2E gate:** Pay for a rental, verify webhook transitions reservation to `reserved_paid`. Let an unpaid reservation expire, verify unit freed.

### Phase 5 — Return Form + Damage Reporting
- `/dashboard/rentals/[id]/return` — customer return form
- Condition report → auto-flag unit as damaged if needed
- Admin `/admin/returns` — review and mark repaired

**E2E gate:** Submit return form with damage. Verify unit status → `damaged`. Mark repaired in admin, verify unit → `available`.

### Phase 6 — Gmail Notifications
- Google Workspace service account + Gmail API setup
- All customer + admin email triggers wired up
- In-app `notifications` table + bell icon in Navbar

**E2E gate:** Complete a booking end-to-end, verify confirmation email received. Submit return form, verify admin damage alert email.

### Phase 7 — Customer Dashboard
- `/dashboard/orders`, `/dashboard/rentals`, `/dashboard/warranty`
- Order and rental history views

**E2E gate:** Log in as customer. Verify past bookings visible. Verify return form accessible from rental detail.

### Phase 8 — Admin Dashboard + QA
- `/admin/events`, `/admin/orders`, `/admin/reservations` full build-out
- Navbar admin portal link post-OAuth
- End-to-end QA pass across all flows

**E2E gate:** Full walkthrough — book, pay, assign unit, transit, event, return, damage, repair. Verify every status transition and notification.

## 12. Key Implementation Rules

1. **Never trust client pricing** — all totals recalculated server-side before Stripe session creation
2. **Snapshot order items** — titles/prices frozen at purchase time; product edits don't affect past orders
3. **Webhook idempotency is mandatory** — `stripe_events.stripe_event_id` unique constraint prevents duplicate fulfillment
4. **Unit assignment is manual** — admin picks which physical unit to fulfil each paid reservation; never auto-assign
5. **Race condition protection** — unit availability check at webhook time uses `SELECT FOR UPDATE`; loser gets automatic refund
6. **Audit log is append-only** — never update or delete `unit_events` rows
7. **RLS on customer data** — `reservations`, `orders`, `notifications` scoped to `auth.uid()` via Supabase RLS
8. **pg_cron expiry is the source of truth** — do not rely on client-side timers for expiry
9. **Multi-product by default** — all event/window availability is per-product, never a single inventory count
10. **Gmail API only** — no third-party email service; all transactional email via Google Workspace service account

## 13. Definition of Done (MVP)

- [ ] All 40 units visible and manageable in admin fleet view
- [ ] Atlas 2 product page rendered from Supabase
- [ ] Customer can book a rental (event + custom date) end-to-end in Stripe test mode
- [ ] Customer can purchase a unit end-to-end in Stripe test mode
- [ ] Webhook transitions reservation and unit statuses correctly
- [ ] Unpaid reservations auto-expire after 24 hours
- [ ] Admin can assign a unit to a paid reservation
- [ ] Customer can submit return form; damage auto-flags unit
- [ ] Admin receives email on new booking and damage report
- [ ] Customer receives confirmation and return form emails
- [ ] Admin portal visible in Navbar after `@navomarine.com` login
- [ ] Second product can be added with zero schema changes

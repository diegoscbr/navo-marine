# Atlas 2 Storefront Data, Database, Stripe, and Dashboard Implementation Plan

**Date:** 2026-03-03  
**Scope:** Define the Atlas 2 commerce object schema for a Supabase (Postgres) backend, plus implementation plans for storefront UX, Stripe integration, admin dashboard, and customer dashboard.

---

## 1) Source Product Context (from `business_info/Atlas_2_Product_Info.md`)

The Atlas 2 business document establishes the key commerce requirements:

- Atlas 2 purchase flow with base price **$1,249**, tax included.
- Optional/related upsell behavior:
  - Qi charger note (not in box, suggested add-on).
  - Vakaros Care Warranty at **$200**.
- Rich merchandising content:
  - “In the box” list.
  - Multi-section marketing content and tech specifications.
- Rental flow requirements:
  - Atlas 2 rental at **$245**.
  - Event dropdown selection.
  - Inventory status states:
    - In Stock
    - Inventory On the Way
    - Out of Stock
  - Sail Number input.
  - Late fee rule ($35) if reservation is too close to event date.

This plan models all of those requirements in a way that supports immediate storefront rendering and later Stripe checkout + fulfillment automation.

---

## 2) Recommended Architecture

- **Frontend:** Next.js App Router (existing project structure).
- **Auth:** Existing Auth.js flow (already present in repo) for user accounts and protected dashboards.
- **Database:** **Supabase Postgres** as primary source of truth for product catalog, cart, order ledger, rentals, and dashboard data.
- **Payments:** **Stripe Checkout** (initial implementation) with webhook-driven order state sync.
- **Row-level security:** Supabase RLS for customer-owned resources.

### Why Supabase here

- Postgres flexibility for normalized commerce entities and JSON metadata fields.
- Built-in auth compatibility (even if you keep Auth.js as the auth layer).
- Great fit for dashboards with role-based access patterns and SQL views.
- Easy local/prod path while preserving type-safe server access from Next.js.

---

## 3) Core Object Schema (Supabase/Postgres)

Use integer cents for all money values.

### 3.1 Catalog and merchandising tables

#### `products`
Represents top-level sellable products (Atlas 2 as first entry).

- `id uuid pk`
- `slug text unique not null` (e.g. `atlas-2`)
- `name text not null`
- `subtitle text null`
- `description_short text`
- `description_long_markdown text`
- `base_price_cents integer not null`
- `currency text not null default 'usd'`
- `tax_included boolean not null default true`
- `brand text`
- `active boolean not null default true`
- `seo_title text`
- `seo_description text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### `product_media`
Gallery + hero media.

- `id uuid pk`
- `product_id uuid fk -> products.id`
- `media_type text check in ('image','video')`
- `url text not null`
- `alt_text text`
- `sort_order integer default 0`

#### `product_sections`
For marketing content blocks (ABOUT, ACCURACY, COMPASS, STARTING, BATTERY).

- `id uuid pk`
- `product_id uuid fk`
- `section_key text not null` (e.g. `accuracy`, `compass`)
- `heading text not null`
- `body_markdown text`
- `sort_order integer default 0`

#### `product_feature_bullets`
Bullets attached to each section.

- `id uuid pk`
- `section_id uuid fk -> product_sections.id`
- `bullet_text text not null`
- `sort_order integer default 0`

#### `product_spec_groups`
Tech spec group names (Sensors, Core Measurements, Display, Battery, Data Logging, Functions).

- `id uuid pk`
- `product_id uuid fk`
- `group_name text not null`
- `sort_order integer default 0`

#### `product_specs`
Label/value spec pairs.

- `id uuid pk`
- `group_id uuid fk -> product_spec_groups.id`
- `label text not null`
- `value text not null`
- `sort_order integer default 0`

#### `product_box_items`
“In the box” list.

- `id uuid pk`
- `product_id uuid fk`
- `item_name text not null`
- `sort_order integer default 0`

### 3.2 Variants and add-ons

#### `product_variants`
Future-proofing for SKU-level sale options.

- `id uuid pk`
- `product_id uuid fk`
- `sku text unique not null`
- `title text not null`
- `price_cents integer not null`
- `currency text not null default 'usd'`
- `active boolean default true`

#### `addons`
Warranty, Qi charger, and future accessories.

- `id uuid pk`
- `slug text unique not null` (e.g. `vakaros-care-warranty`)
- `name text not null`
- `description text`
- `addon_type text check in ('warranty','accessory','service')`
- `price_cents integer not null`
- `currency text not null default 'usd'`
- `active boolean default true`

#### `product_addons`
Join table to associate add-ons to Atlas 2.

- `product_id uuid fk`
- `addon_id uuid fk`
- `default_selected boolean default false`
- `primary key (product_id, addon_id)`

### 3.3 Rental-specific tables

#### `rental_events`
Event dropdown source + inventory status.

- `id uuid pk`
- `name text not null`
- `location text`
- `start_date date not null`
- `end_date date not null`
- `inventory_status text check in ('in_stock','inventory_on_the_way','out_of_stock')`
- `rental_price_cents integer not null default 24500`
- `late_fee_cents integer not null default 3500`
- `reserve_cutoff_days integer not null default 14`
- `active boolean default true`

#### `rental_reservations`
Captures rental selections and sail number.

- `id uuid pk`
- `event_id uuid fk -> rental_events.id`
- `user_id text null` (auth user id)
- `customer_email text not null`
- `sail_number text not null`
- `status text check in ('draft','submitted','paid','cancelled')`
- `base_price_cents integer not null`
- `late_fee_applied boolean default false`
- `late_fee_cents integer not null default 0`
- `total_cents integer not null`
- `currency text default 'usd'`
- `created_at timestamptz default now()`

### 3.4 Cart and checkout tables

#### `carts`
Persistent cart for guest or authenticated users.

- `id uuid pk`
- `user_id text null`
- `status text check in ('active','converted','abandoned') default 'active'`
- `currency text not null default 'usd'`
- `stripe_checkout_session_id text null`
- `expires_at timestamptz`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### `cart_items`
Flexible line items across products/add-ons/rentals.

- `id uuid pk`
- `cart_id uuid fk -> carts.id`
- `item_type text check in ('product_variant','addon','rental_reservation')`
- `reference_id uuid not null`
- `title_snapshot text not null`
- `unit_price_cents integer not null`
- `quantity integer not null default 1`
- `metadata jsonb default '{}'::jsonb`
- `created_at timestamptz default now()`

### 3.5 Orders and payment reconciliation

#### `orders`
Order ledger record for every checkout.

- `id uuid pk`
- `order_number text unique not null`
- `user_id text null`
- `customer_email text not null`
- `status text check in ('pending','paid','fulfilled','cancelled','refunded') default 'pending'`
- `subtotal_cents integer not null`
- `tax_cents integer not null default 0`
- `shipping_cents integer not null default 0`
- `total_cents integer not null`
- `currency text not null default 'usd'`
- `stripe_customer_id text null`
- `stripe_checkout_session_id text null`
- `stripe_payment_intent_id text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

#### `order_items`
Immutable snapshot of purchased line items.

- `id uuid pk`
- `order_id uuid fk -> orders.id`
- `item_type text not null`
- `reference_id uuid null`
- `title_snapshot text not null`
- `unit_price_cents integer not null`
- `quantity integer not null`
- `metadata_snapshot jsonb default '{}'::jsonb`

#### `stripe_events`
Idempotent webhook processing ledger.

- `id uuid pk`
- `stripe_event_id text unique not null`
- `event_type text not null`
- `payload jsonb not null`
- `processed_at timestamptz default now()`

### 3.6 User roles for dashboard control

#### `user_roles`
Route authorization foundation.

- `user_id text pk`
- `role text check in ('admin','staff','customer') not null`
- `created_at timestamptz default now()`

---

## 4) Storefront-Oriented Product View Model

Create a server-side mapper that returns one normalized object per product detail page.

```ts
export type StorefrontProduct = {
  id: string
  slug: string
  name: string
  subtitle?: string
  pricing: {
    amountCents: number
    currency: 'usd'
    taxIncluded: boolean
  }
  inTheBox: string[]
  sections: Array<{
    key: string
    heading: string
    bodyMarkdown: string
    bullets: string[]
  }>
  techSpecs: Array<{
    group: string
    rows: Array<{ label: string; value: string }>
  }>
  addOns: Array<{
    id: string
    slug: string
    name: string
    description?: string
    priceCents: number
    addonType: 'warranty' | 'accessory' | 'service'
  }>
  rentalPolicy?: {
    rentalPriceCents: number
    lateFeeCents: number
    reserveCutoffDays: number
    statuses: Array<'in_stock' | 'inventory_on_the_way' | 'out_of_stock'>
    requiresEventSelection: true
    requiresSailNumber: true
  }
  support: {
    manualUrl: string
  }
}
```

This gives the UI everything needed for:
- product rendering,
- add-on toggles,
- cart composition,
- and eventual checkout payload creation.

---

## 5) User Interaction Flows

### 5.1 Product purchase flow

1. User lands on Atlas 2 page.
2. UI loads `StorefrontProduct`.
3. User selects quantity and optional add-ons (e.g., warranty).
4. User adds to cart.
5. Cart is persisted in DB (`carts` + `cart_items`) and cart id cookie.
6. On checkout, server recalculates totals from DB data and creates Stripe Checkout session.
7. Stripe webhook updates order status to paid.
8. Customer dashboard reflects order and line-item snapshots.

### 5.2 Rental flow

1. User selects Atlas rental option.
2. Chooses event from `rental_events`.
3. Inputs sail number.
4. System computes whether late fee applies by event date and `reserve_cutoff_days`.
5. Reservation is represented as rental line item (or linked `rental_reservations` record).
6. Checkout includes rental amount + late fee when applicable.

### 5.3 Dashboard flow

- Authenticated users can view only their orders/reservations.
- Admin/staff users can manage catalog, events, and order statuses.

---

## 6) Stripe Integration Plan (Database-first)

### 6.1 Checkout creation endpoint

Create `POST /api/checkout` server route:

- Input: `cartId`.
- Steps:
  1. Load active cart and cart items.
  2. Validate references exist and are active.
  3. Recalculate totals server-side.
  4. Build Stripe Checkout `line_items` from trusted DB snapshot.
  5. Create or attach Stripe customer.
  6. Persist `stripe_checkout_session_id` to cart/order.
  7. Return redirect URL.

### 6.2 Webhook endpoint

Create `POST /api/stripe/webhook`:

- Verify Stripe signature.
- Deduplicate by `stripe_event_id` (store in `stripe_events`).
- Handle at minimum:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `charge.refunded` / refund lifecycle event
- Update order status transitions accordingly.

### 6.3 Idempotency and consistency

- Every webhook event is processed transactionally.
- Event insert + order update happen in one transaction.
- Repeated events no-op due to unique `stripe_event_id`.

---

## 7) Supabase Integration Considerations

### 7.1 RLS policies

- `orders`: customers can read rows where `orders.user_id = auth.uid()` or matched account mapping.
- `carts`: users can only read/write own cart; guest carts only via server routes.
- `rental_reservations`: same ownership restrictions.
- Admin write access should be mediated by server-side checks against `user_roles`.

### 7.2 Server-only sensitive operations

Keep these strictly server-side:
- checkout session creation,
- order status mutation,
- webhook processing,
- pricing/tax recomputation.

### 7.3 Auditability

- Add `created_by` / `updated_by` columns for admin-managed entities as phase 2.
- Optional `admin_activity_logs` for critical changes (price updates, status overrides).

---

## 8) Admin Dashboard Implementation Plan

Create route group: `app/admin/*`.

### 8.1 Access and layout

- Middleware: protect `/admin` routes.
- Only users with `user_roles.role in ('admin','staff')` can access.
- Shared admin shell with left nav and KPI summary cards.

### 8.2 Admin modules

#### A) Catalog Management (`/admin/products`)

- Product list with status, price, last updated.
- Product editor tabs:
  - Overview (name, slug, short description, SEO)
  - Merchandising sections
  - In-the-box items
  - Tech specs
  - Media
  - Add-ons
- Draft/publish toggle (`active`).

#### B) Add-on Management (`/admin/addons`)

- Create/edit warranty and accessories.
- Attach/detach add-ons from products.
- Set default selection behavior.

#### C) Rental Event Management (`/admin/rentals/events`)

- CRUD for events.
- Set inventory status (In Stock, Inventory On the Way, Out of Stock).
- Set rental price/late fee/cutoff days.

#### D) Order Operations (`/admin/orders`)

- Filter by status/date/customer.
- Open order details with line item snapshots.
- Payment timeline from Stripe references.
- Manual status override controls for support workflows (restricted role).

### 8.3 Suggested admin API contracts

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/rentals/events`
- `POST /api/admin/rentals/events`

All admin endpoints must enforce role checks server-side.

---

## 9) Customer Dashboard Implementation Plan

Use existing authenticated `/dashboard` as entry, expand into modules.

### 9.1 Customer modules

#### A) Account Home (`/dashboard`)

- Greeting + summary cards:
  - recent order
  - active reservation
  - support quick links (manual/help)

#### B) Orders (`/dashboard/orders`)

- Paginated order history.
- Status badge (`pending`, `paid`, `fulfilled`, `refunded`).
- Totals and purchase date.

#### C) Order Detail (`/dashboard/orders/[orderId]`)

- Immutable line-item snapshot view.
- Payment method + Stripe receipt link (if available).
- Shipment/fulfillment placeholder if not implemented yet.

#### D) Rentals (`/dashboard/rentals`)

- List rental reservations.
- Event/date/status/sail number display.
- Late-fee transparency in totals.

#### E) Warranty Coverage (`/dashboard/warranty`)

- Show purchased warranty add-ons by order.
- Coverage period details and terms link.

### 9.2 Customer UX priorities

- Clarity of “what was purchased” (Atlas base + add-ons).
- Clear payment state and next action.
- Frictionless access to support resources.

---

## 10) Phased Execution Roadmap

### Phase 1: Data foundation

1. Create Supabase schema + indexes + constraints.
2. Seed Atlas 2 product, sections, specs, box items, warranty add-on.
3. Build server data access layer and mappers.

### Phase 2: Storefront rendering

1. Add `/products/[slug]` route.
2. Render Atlas data-driven page from DB.
3. Add add-on selection controls.

### Phase 3: Cart + checkout

1. Implement carts/cart_items server actions or API routes.
2. Implement Stripe checkout endpoint.
3. Add webhook endpoint with idempotency table.
4. Confirm order row creation + updates.

### Phase 4: Dashboard MVP

1. Expand customer dashboard with orders and rentals pages.
2. Build admin read-only order list.
3. Build admin catalog editor MVP.

### Phase 5: Hardening

1. RLS policy tests.
2. Observability/logging for checkout + webhook.
3. Refund workflow and status reconciliation.
4. Performance pass (indexes/materialized views where needed).

---

## 11) Key Implementation Considerations

1. **Do not trust client pricing** — all totals recalculated server-side.
2. **Snapshot order items** — titles/prices/metadata must remain stable even if product changes later.
3. **Webhook idempotency is mandatory** — prevent duplicate fulfillment and order state corruption.
4. **Rental inventory is event-scoped** — do not model with single global product stock field.
5. **Tax model must be explicit** — product copy says tax included; align Stripe config and legal display.
6. **Auth ownership boundaries** — customer-only data visibility via RLS + server checks.
7. **Role-based admin control** — never rely on client-only role checks.
8. **Future-proof add-on architecture** — warranty and accessories should share a flexible line-item model.

---

## 12) Suggested Initial File Targets (when implementation begins)

- `docs/plans/2026-03-03-atlas2-storefront-supabase-stripe-implementation-plan.md` (this document)
- `lib/db/` (Supabase query layer)
- `lib/commerce/types.ts` (storefront object types)
- `app/products/[slug]/page.tsx`
- `app/api/cart/*` or `app/cart/actions.ts`
- `app/api/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/admin/*`
- `app/dashboard/orders/*`
- `app/dashboard/rentals/*`

---

## 13) Definition of Done for MVP

- Atlas 2 product page rendered entirely from DB-backed objects.
- Add-ons selectable and reflected in cart totals.
- Stripe checkout session created from server-side validated cart.
- Successful Stripe webhook transitions order from pending -> paid.
- Customer can see order history in dashboard.
- Admin can update product content and rental event inventory status.

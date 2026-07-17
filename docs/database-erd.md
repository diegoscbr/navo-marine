# NAVO Marine — Database ERD

Generated 2026-07-17 from the live Supabase schema (`public`, project `fdjuhjadjqkpqnpxgmue`). 26 tables, grouped into three domains: **Catalog**, **Rentals & Inventory**, and **Commerce**.

There is no `users` table — auth is JWT-only (NextAuth), so `user_id` / `customer_email` columns are plain `text` references to the session identity, not foreign keys.

## Big picture

```mermaid
flowchart LR
  subgraph Catalog
    products
    addons
  end
  subgraph Rentals["Rentals & Inventory"]
    rental_events
    date_windows
    units
    reservations
  end
  subgraph Commerce
    carts
    orders
    stripe_events
  end
  rental_events -- "priced per product via rental_event_products" --> products
  date_windows -- "capacity per product via date_window_allocations" --> products
  reservations --> products
  reservations -. "event bookings" .-> rental_events
  reservations -. "custom-date bookings" .-> date_windows
  reservations -- "assigned hardware" --> units
  units --> products
  orders -. "rental checkouts" .-> reservations
  carts -- "checkout" --> orders
```

## Rentals & Inventory (the /reserve flow)

```mermaid
erDiagram
  rental_events ||--o{ rental_event_products : "priced per product"
  products ||--o{ rental_event_products : ""
  date_windows ||--o{ date_window_allocations : "capacity per product"
  products ||--o{ date_window_allocations : ""

  products ||--o{ reservations : "booked as"
  rental_events |o--o{ reservations : "event bookings (event_id nullable)"
  date_windows |o--o{ reservations : "custom bookings (date_window_id nullable)"
  units |o--o{ reservations : "legacy single-unit assignment"

  reservations ||--o{ reservation_units : "assigned hardware"
  units |o--o{ reservation_units : ""
  reservations ||--o{ return_reports : "post-rental condition"
  units |o--o{ return_reports : ""
  products ||--o{ units : "physical inventory"
  units ||--o{ unit_events : "status audit log"

  rental_events {
    uuid id PK
    text name
    text location
    text event_url
    date start_date
    date end_date
    boolean active
  }
  rental_event_products {
    uuid event_id PK, FK
    uuid product_id PK, FK
    int rental_price_cents
    int rental_price_per_day_cents
    int late_fee_cents
    int reserve_cutoff_days
    int capacity
    text inventory_status
  }
  date_windows {
    uuid id PK
    text label
    date start_date
    date end_date
    boolean active
  }
  date_window_allocations {
    uuid date_window_id PK, FK
    uuid product_id PK, FK
    int capacity
    text inventory_status
  }
  reservations {
    uuid id PK
    text reservation_type
    uuid product_id FK
    uuid event_id FK "nullable"
    uuid date_window_id FK "nullable"
    uuid unit_id FK "nullable"
    text user_id
    text customer_email
    text sail_number
    text status
    date start_date "nullable - see note"
    date end_date "nullable - see note"
    int extra_days
    int quantity
    int total_cents
    boolean late_fee_applied
    text stripe_checkout_session_id
    text stripe_payment_intent_id
    timestamptz expires_at
  }
  reservation_units {
    uuid id PK
    uuid reservation_id FK
    uuid unit_id FK "nullable until assigned"
    text unit_type
    int quantity
    date start_date
    date end_date
  }
  units {
    uuid id PK
    text navo_number
    text serial_number
    uuid product_id FK
    text unit_type
    text status
    timestamptz retired_at
  }
  unit_events {
    uuid id PK
    uuid unit_id FK
    text event_type
    text from_status
    text to_status
    text actor_type
  }
  return_reports {
    uuid id PK
    uuid reservation_id FK
    uuid unit_id FK "nullable"
    text condition
    boolean damage_flagged
  }
```

> **Date semantics gotcha (bit us in PR #24):** `reservations.start_date`/`end_date` are only populated for some reservation types. For event bookings the dates live on `rental_events`; for date-window bookings they live on `date_windows`. Always coalesce: `coalesce(reservations.end_date, rental_events.end_date, date_windows.end_date)`.

## Catalog (products & merchandising)

```mermaid
erDiagram
  products ||--o{ product_media : "images/video"
  products ||--o{ product_sections : "marketing sections"
  product_sections ||--o{ product_feature_bullets : ""
  products ||--o{ product_spec_groups : "tech specs"
  product_spec_groups ||--o{ product_specs : ""
  products ||--o{ product_options : "variants"
  product_options ||--o{ product_option_values : ""
  products ||--o{ product_box_items : "what's in the box"
  products ||--o{ product_addons : ""
  addons ||--o{ product_addons : ""

  products {
    uuid id PK
    text slug
    text name
    text category
    text status
    boolean active
    int base_price_cents
    boolean rental_enabled
    int rental_price_cents
    int price_per_day_cents
    int late_fee_cents
    int reserve_cutoff_days
    text payment_mode
    boolean requires_event_selection
    boolean requires_sail_number
    int atlas2_units_required
    boolean tablet_required
    int capacity
  }
  addons {
    uuid id PK
    text slug
    text name
    text addon_type
    int price_cents
    boolean active
  }
  product_addons {
    uuid product_id PK, FK
    uuid addon_id PK, FK
    boolean default_selected
    int sort_order
  }
```

## Commerce (carts, orders, Stripe)

```mermaid
erDiagram
  carts ||--o{ cart_items : ""
  orders ||--o{ order_items : ""
  reservations |o--o{ orders : "rental checkouts link back"

  carts {
    uuid id PK
    text user_id "nullable - guest carts"
    text status
    text stripe_checkout_session_id
    timestamptz expires_at
  }
  cart_items {
    uuid id PK
    uuid cart_id FK
    text item_type
    uuid reference_id "polymorphic - no FK"
    text title_snapshot
    int unit_price_cents
    int quantity
    jsonb metadata
  }
  orders {
    uuid id PK
    text order_number
    text user_id "nullable"
    text customer_email
    uuid reservation_id FK "nullable"
    jsonb shipping_address
    text status
    int subtotal_cents
    int tax_cents
    int total_cents
    text stripe_customer_id
    text stripe_checkout_session_id
    text stripe_payment_intent_id
  }
  order_items {
    uuid id PK
    uuid order_id FK
    text item_type
    uuid reference_id "polymorphic - no FK"
    text title_snapshot
    int unit_price_cents
    int quantity
    jsonb metadata_snapshot
  }
  stripe_events {
    uuid id PK
    text stripe_event_id "webhook idempotency"
    text event_type
    jsonb payload
    timestamptz processed_at
  }
  notifications {
    uuid id PK
    text user_id
    text message
    boolean read
    text link
  }
```

## Notes on soft links

- `cart_items.reference_id` / `order_items.reference_id` are **polymorphic** — they point at a product, addon, or reservation depending on `item_type`, with no DB-level foreign key.
- `stripe_events` and `notifications` are standalone (no FKs) — the former is the webhook idempotency ledger, keyed by `stripe_event_id`.
- `reservations.unit_id` is a legacy single-unit pointer; multi-unit assignment now goes through `reservation_units`.

-- ============================================================
-- Navo Marine — Initial Schema
-- Phase 1: Commerce, Rental & Inventory System
-- ============================================================

-- Enable pg_cron (must be enabled in Supabase dashboard first)
-- Extensions are enabled via Supabase dashboard, not SQL

-- ============================================================
-- 1. PRODUCTS
-- ============================================================

CREATE TABLE products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text UNIQUE NOT NULL,
  name                text NOT NULL,
  subtitle            text,
  description_short   text,
  description_long_md text,
  base_price_cents    integer NOT NULL,
  currency            text NOT NULL DEFAULT 'usd',
  tax_included        boolean NOT NULL DEFAULT true,
  active              boolean NOT NULL DEFAULT true,
  seo_title           text,
  seo_description     text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE product_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_type  text NOT NULL CHECK (media_type IN ('image', 'video')),
  url         text NOT NULL,
  alt_text    text,
  sort_order  integer DEFAULT 0
);

CREATE TABLE product_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section_key   text NOT NULL,
  heading       text NOT NULL,
  body_markdown text,
  sort_order    integer DEFAULT 0
);

CREATE TABLE product_feature_bullets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES product_sections(id) ON DELETE CASCADE,
  bullet_text text NOT NULL,
  sort_order  integer DEFAULT 0
);

CREATE TABLE product_spec_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_name  text NOT NULL,
  sort_order  integer DEFAULT 0
);

CREATE TABLE product_specs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES product_spec_groups(id) ON DELETE CASCADE,
  label       text NOT NULL,
  value       text NOT NULL,
  sort_order  integer DEFAULT 0
);

CREATE TABLE product_box_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_name   text NOT NULL,
  sort_order  integer DEFAULT 0
);

-- ============================================================
-- 2. ADD-ONS
-- ============================================================

CREATE TABLE addons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  addon_type  text NOT NULL CHECK (addon_type IN ('warranty', 'accessory', 'service')),
  price_cents integer NOT NULL,
  currency    text NOT NULL DEFAULT 'usd',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE product_addons (
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_id          uuid NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  default_selected  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, addon_id)
);

-- ============================================================
-- 3. PHYSICAL UNIT FLEET
-- ============================================================

CREATE TABLE units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navo_number   text UNIQUE NOT NULL,
  serial_number text,
  product_id    uuid NOT NULL REFERENCES products(id),
  status        text NOT NULL DEFAULT 'available' CHECK (status IN (
                  'available',
                  'reserved_unpaid',
                  'reserved_paid',
                  'in_transit',
                  'at_event',
                  'returned',
                  'damaged',
                  'lost',
                  'sold'
                )),
  notes         text,
  added_at      timestamptz DEFAULT now(),
  retired_at    timestamptz
);

CREATE TABLE unit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     uuid NOT NULL REFERENCES units(id),
  event_type  text NOT NULL,
  from_status text,
  to_status   text,
  actor_type  text NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id    text,
  notes       text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 4. RENTAL EVENTS & DATE WINDOWS
-- ============================================================

CREATE TABLE rental_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  location    text,
  event_url   text,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE rental_event_products (
  event_id              uuid NOT NULL REFERENCES rental_events(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rental_price_cents    integer NOT NULL,
  late_fee_cents        integer NOT NULL DEFAULT 3500,
  reserve_cutoff_days   integer NOT NULL DEFAULT 14,
  capacity              integer NOT NULL,
  inventory_status      text NOT NULL DEFAULT 'in_stock' CHECK (inventory_status IN (
                          'in_stock', 'inventory_on_the_way', 'out_of_stock'
                        )),
  PRIMARY KEY (event_id, product_id)
);

CREATE TABLE date_windows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE date_window_allocations (
  date_window_id  uuid NOT NULL REFERENCES date_windows(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  capacity        integer NOT NULL,
  inventory_status text NOT NULL DEFAULT 'in_stock' CHECK (inventory_status IN (
                    'in_stock', 'inventory_on_the_way', 'out_of_stock'
                  )),
  PRIMARY KEY (date_window_id, product_id)
);

-- ============================================================
-- 5. RESERVATIONS
-- ============================================================

CREATE TABLE reservations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_type           text NOT NULL CHECK (reservation_type IN (
                               'rental_event', 'rental_custom', 'purchase'
                             )),
  product_id                 uuid NOT NULL REFERENCES products(id),
  unit_id                    uuid REFERENCES units(id),
  event_id                   uuid REFERENCES rental_events(id),
  date_window_id             uuid REFERENCES date_windows(id),
  user_id                    text NOT NULL,
  customer_email             text NOT NULL,
  sail_number                text,
  status                     text NOT NULL DEFAULT 'reserved_unpaid' CHECK (status IN (
                               'reserved_unpaid', 'reserved_paid', 'cancelled', 'completed'
                             )),
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  total_cents                integer NOT NULL,
  late_fee_applied           boolean NOT NULL DEFAULT false,
  late_fee_cents             integer NOT NULL DEFAULT 0,
  expires_at                 timestamptz,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

-- ============================================================
-- 6. CART & ORDERS (purchase flow)
-- ============================================================

CREATE TABLE carts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    text,
  status                     text NOT NULL DEFAULT 'active' CHECK (status IN (
                               'active', 'converted', 'abandoned'
                             )),
  currency                   text NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id text,
  expires_at                 timestamptz,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

CREATE TABLE cart_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id           uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  item_type         text NOT NULL CHECK (item_type IN ('product_variant', 'addon')),
  reference_id      uuid NOT NULL,
  title_snapshot    text NOT NULL,
  unit_price_cents  integer NOT NULL,
  quantity          integer NOT NULL DEFAULT 1,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE orders (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number               text UNIQUE NOT NULL,
  user_id                    text,
  customer_email             text NOT NULL,
  reservation_id             uuid REFERENCES reservations(id),
  shipping_address           jsonb,
  status                     text NOT NULL DEFAULT 'pending' CHECK (status IN (
                               'pending', 'paid', 'fulfilled', 'cancelled', 'refunded'
                             )),
  subtotal_cents             integer NOT NULL,
  tax_cents                  integer NOT NULL DEFAULT 0,
  total_cents                integer NOT NULL,
  currency                   text NOT NULL DEFAULT 'usd',
  stripe_customer_id         text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type         text NOT NULL,
  reference_id      uuid,
  title_snapshot    text NOT NULL,
  unit_price_cents  integer NOT NULL,
  quantity          integer NOT NULL,
  metadata_snapshot jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE stripe_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  processed_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 7. RETURN REPORTS
-- ============================================================

CREATE TABLE return_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) UNIQUE,
  unit_id        uuid REFERENCES units(id),  -- nullable: unit may not be assigned yet
  submitted_by   text NOT NULL,
  condition      text NOT NULL CHECK (condition IN ('good', 'minor_damage', 'major_damage')),
  notes          text,
  damage_flagged boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- ============================================================
-- 8. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  message    text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  link       text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 9. INDEXES (required for performance)
-- ============================================================

-- Availability count queries (run on every checkout)
CREATE INDEX ON reservations (event_id, product_id, status);
CREATE INDEX ON reservations (date_window_id, product_id, status);

-- Customer dashboard
CREATE INDEX ON reservations (user_id);

-- pg_cron expiry query
CREATE INDEX ON reservations (expires_at, status);

-- Notifications bell icon
CREATE INDEX ON notifications (user_id, read);

-- Unit audit log
CREATE INDEX ON unit_events (unit_id, created_at);

-- ============================================================
-- 10. pg_cron JOBS
-- ============================================================

-- Job 1: Expire unpaid reservations (runs hourly)
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
    UPDATE reservations
    SET status = 'cancelled', updated_at = now()
    WHERE id = r.id;

    IF r.unit_id IS NOT NULL THEN
      UPDATE units SET status = 'available' WHERE id = r.unit_id;
      INSERT INTO unit_events (unit_id, event_type, from_status, to_status, actor_type, notes)
      VALUES (r.unit_id, 'status_changed', 'reserved_unpaid', 'available', 'system',
              'Reservation expired after 24 hours');
    END IF;

    INSERT INTO notifications (user_id, message, link)
    VALUES (r.user_id, 'Your reservation expired. Book again anytime.', '/reserve');
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'expire-unpaid-reservations',
  '0 * * * *',
  'SELECT expire_unpaid_reservations()'
);

-- Job 2: Send return form reminders (runs daily at 08:00 UTC)
CREATE OR REPLACE FUNCTION send_return_form_reminders()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
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

SELECT cron.schedule(
  'send-return-reminders',
  '0 8 * * *',
  'SELECT send_return_form_reminders()'
);

-- 005_phase_4_5_schema.sql
-- Phase 4.5: Product restructure + Regatta Management Packages
-- All changes are ADDITIVE. No columns dropped, no tables removed.

-- ── units table ─────────────────────────────────────────────────────────────
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'atlas2'
    CHECK (unit_type IN ('atlas2', 'tablet'));

-- ── products table ───────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'individual_rental'
    CHECK (category IN ('individual_rental', 'regatta_management')),
  ADD COLUMN IF NOT EXISTS price_per_day_cents INT,
  ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'capture'
    CHECK (payment_mode IN ('capture', 'hold')),
  ADD COLUMN IF NOT EXISTS min_advance_booking_days INT,
  ADD COLUMN IF NOT EXISTS atlas2_units_required INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tablet_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 1;

-- ── rental_event_products table ──────────────────────────────────────────────
ALTER TABLE rental_event_products
  ADD COLUMN IF NOT EXISTS rental_price_per_day_cents INT;

-- Backfill: existing Atlas 2 event products → $35/day
UPDATE rental_event_products
SET rental_price_per_day_cents = 3500
WHERE rental_price_per_day_cents IS NULL;

-- ── reservations table ───────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS extra_days INT NOT NULL DEFAULT 0;

-- ── reservation_units table (new) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('atlas2', 'tablet')),
  quantity INT NOT NULL DEFAULT 1,
  start_date DATE,
  end_date DATE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservation_units_reservation
  ON reservation_units(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservations_dates
  ON reservations(product_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_units_type
  ON units(unit_type);

-- ── Update reservation_type CHECK to include regatta_package ─────────────────
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_reservation_type_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_reservation_type_check
    CHECK (reservation_type IN (
      'rental_event', 'rental_custom', 'purchase', 'regatta_package'
    ));

-- ── Update status CHECK to include reserved_authorized ───────────────────────
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status IN (
      'reserved_unpaid', 'reserved_authorized', 'reserved_paid',
      'cancelled', 'completed'
    ));

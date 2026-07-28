-- 006_phase_4_5_seed.sql
-- Phase 4.5: Seed regatta management products + tablet units + update Atlas 2

-- ── Update Atlas 2 (existing product) ────────────────────────────────────────
UPDATE products
SET
  category = 'individual_rental',
  price_per_day_cents = 3500,
  atlas2_units_required = 1,
  tablet_required = FALSE,
  capacity = 10
WHERE slug = 'atlas-2';

-- ── Insert regatta management products ───────────────────────────────────────
INSERT INTO products (
  name, slug, category, price_per_day_cents, payment_mode,
  min_advance_booking_days, atlas2_units_required, tablet_required,
  capacity, base_price_cents
)
VALUES
  (
    'Race Committee Package',
    'race-committee-package',
    'regatta_management',
    10500,
    'capture',
    NULL,
    0,
    TRUE,
    3,
    10500
  ),
  (
    'R/C Windward Leeward Course Package',
    'rc-wl-course-package',
    'regatta_management',
    17000,
    'capture',
    NULL,
    5,
    TRUE,
    2,
    17000
  ),
  (
    'RaceSense Management Services',
    'racesense-management-services',
    'regatta_management',
    40000,
    'capture',
    90,
    0,
    FALSE,
    1,
    40000
  )
ON CONFLICT (slug) DO UPDATE SET
  price_per_day_cents      = EXCLUDED.price_per_day_cents,
  payment_mode             = EXCLUDED.payment_mode,
  min_advance_booking_days = EXCLUDED.min_advance_booking_days,
  atlas2_units_required    = EXCLUDED.atlas2_units_required,
  tablet_required          = EXCLUDED.tablet_required,
  capacity                 = EXCLUDED.capacity,
  base_price_cents         = EXCLUDED.base_price_cents;

-- ── Seed tablet product (internal FK anchor only) ─────────────────────────────
INSERT INTO products (id, name, slug, category, base_price_cents, active, price_per_day_cents, atlas2_units_required, tablet_required, capacity)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Tablet (Internal)',
  'tablet-internal',
  'individual_rental',
  0,
  false,
  NULL,
  0,
  FALSE,
  0
)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed tablet units ─────────────────────────────────────────────────────────
INSERT INTO units (navo_number, serial_number, product_id, status, unit_type)
VALUES
  ('NAVO-TAB-001', 'NAVO-TAB-001',
   (SELECT id FROM products WHERE slug = 'tablet-internal'),
   'available', 'tablet'),
  ('NAVO-TAB-002', 'NAVO-TAB-002',
   (SELECT id FROM products WHERE slug = 'tablet-internal'),
   'available', 'tablet')
ON CONFLICT (navo_number) DO NOTHING;

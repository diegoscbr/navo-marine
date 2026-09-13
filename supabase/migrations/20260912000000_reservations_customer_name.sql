-- Add customer_name so admin doesn't have to open Stripe (or squint at an
-- email) to know who a reservation belongs to. Nullable: history predates
-- this column, and an abandoned checkout may have nothing to recover.
ALTER TABLE reservations ADD COLUMN customer_name text;

-- One-shot backfill, free tier: every reserved_paid reservation already has
-- this name sitting in orders.shipping_address (collected by the existing
-- Stripe webhook). No Stripe calls needed for these rows.
UPDATE reservations r
SET customer_name = o.shipping_address ->> 'name'
FROM orders o
WHERE o.reservation_id = r.id
  AND o.shipping_address ->> 'name' IS NOT NULL
  AND r.customer_name IS NULL;

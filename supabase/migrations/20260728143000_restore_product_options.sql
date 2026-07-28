-- HOTFIX: restore product_options and product_option_values.
--
-- 20260728120000_fleet_derived_capacity.sql dropped these two as "dead". They are
-- not dead. lib/db/products.ts uses them in the WITH_RELATIONS nested select and
-- writes them directly, so dropping them broke listProducts() and took the
-- products page down with:
--
--   Error: listProducts: Could not find a relationship between 'products' and
--   'product_options' in the schema cache
--
-- Why the audit missed it: the dead-table sweep grepped for .from('table') with
-- single quotes, and products.ts is written with double quotes — .from("product_options").
-- lib/db/products.ts is also excluded from jest coverage, so no test caught it.
--
-- Definitions reproduced exactly from 002_extend_products.sql. Both tables were
-- empty, so no data was lost — only the relationship the schema cache needs.
--
-- The other four tables from that migration (carts, cart_items, order_items,
-- product_media) have no code references under either quote style and stay dropped.

CREATE TABLE IF NOT EXISTS product_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       text NOT NULL,
  required   boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_option_values (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id         uuid NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label             text NOT NULL,
  price_delta_cents integer NOT NULL DEFAULT 0,
  sort_order        integer NOT NULL DEFAULT 0
);

-- Match the RLS posture of every other table in this schema.
ALTER TABLE product_options       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_values ENABLE ROW LEVEL SECURITY;

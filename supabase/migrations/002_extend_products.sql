-- Extend products table with admin-specific fields
ALTER TABLE products
  ADD COLUMN description        text,
  ADD COLUMN status             text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'archived')),
  ADD COLUMN manual_url         text,
  ADD COLUMN rental_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN rental_price_cents integer,
  ADD COLUMN late_fee_cents     integer,
  ADD COLUMN reserve_cutoff_days integer,
  ADD COLUMN requires_event_selection boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_sail_number     boolean NOT NULL DEFAULT false,
  ADD COLUMN in_the_box         jsonb NOT NULL DEFAULT '[]';

-- Product options (e.g., Color, Bundle variants)
CREATE TABLE product_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       text NOT NULL,
  required   boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE product_option_values (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id         uuid NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label             text NOT NULL,
  price_delta_cents integer NOT NULL DEFAULT 0,
  sort_order        integer NOT NULL DEFAULT 0
);

-- Add sort_order to product_addons join table
ALTER TABLE product_addons
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Store quantity on reservations for purchase orders
-- DEFAULT 1 is backward-compatible with all existing rental/package reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

-- Add unit_id FK to reservation_units for per-role package assignment
ALTER TABLE reservation_units
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_units_unit_id
  ON reservation_units(unit_id)
  WHERE unit_id IS NOT NULL;

-- Atomic delete+insert for assign-units route (avoids partial-write failure)
CREATE OR REPLACE FUNCTION assign_reservation_units(
  p_reservation_id UUID,
  p_assignments JSONB
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM reservation_units WHERE reservation_id = p_reservation_id;
  INSERT INTO reservation_units (reservation_id, unit_type, unit_id, quantity)
  SELECT
    p_reservation_id,
    (item->>'unit_type')::text,
    (item->>'unit_id')::uuid,
    1
  FROM jsonb_array_elements(p_assignments) AS item
  WHERE item->>'unit_id' IS NOT NULL;
END;
$$;

-- Normalize package reservation_units rows to one row per physical slot.
-- Legacy rows may use quantity > 1, which breaks row-count based availability checks
-- and makes in-place assignment impossible.

INSERT INTO reservation_units (
  reservation_id,
  unit_type,
  quantity,
  start_date,
  end_date,
  assigned_at
)
SELECT
  ru.reservation_id,
  ru.unit_type,
  1,
  ru.start_date,
  ru.end_date,
  ru.assigned_at
FROM reservation_units ru
JOIN generate_series(2, ru.quantity) AS extra_slot(slot_number)
  ON ru.quantity > 1;

UPDATE reservation_units
SET quantity = 1
WHERE quantity > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_units_reservation_unit
  ON reservation_units (reservation_id, unit_id)
  WHERE unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assign_reservation_units(
  p_reservation_id UUID,
  p_assignments JSONB
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (item->>'unit_id')::uuid AS unit_id
      FROM jsonb_array_elements(p_assignments) AS item
      WHERE item->>'unit_id' IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate unit assignment in payload';
  END IF;

  IF EXISTS (
    WITH requested AS (
      SELECT
        (item->>'unit_type')::text AS unit_type,
        COUNT(*) AS requested_count
      FROM jsonb_array_elements(p_assignments) AS item
      WHERE item->>'unit_id' IS NOT NULL
      GROUP BY 1
    ),
    reserved_slots AS (
      SELECT unit_type, COUNT(*) AS slot_count
      FROM reservation_units
      WHERE reservation_id = p_reservation_id
      GROUP BY 1
    )
    SELECT 1
    FROM requested r
    LEFT JOIN reserved_slots s USING (unit_type)
    WHERE COALESCE(s.slot_count, 0) < r.requested_count
  ) THEN
    RAISE EXCEPTION 'Assignment payload exceeds reserved slot count';
  END IF;

  UPDATE reservation_units
  SET unit_id = NULL
  WHERE reservation_id = p_reservation_id;

  WITH requested AS (
    SELECT
      (item->>'unit_type')::text AS unit_type,
      (item->>'unit_id')::uuid AS unit_id,
      ROW_NUMBER() OVER (
        PARTITION BY (item->>'unit_type')::text
        ORDER BY (item->>'unit_id')::uuid
      ) AS slot_position
    FROM jsonb_array_elements(p_assignments) AS item
    WHERE item->>'unit_id' IS NOT NULL
  ),
  slots AS (
    SELECT
      id,
      unit_type,
      ROW_NUMBER() OVER (
        PARTITION BY unit_type
        ORDER BY start_date NULLS LAST, end_date NULLS LAST, assigned_at, id
      ) AS slot_position
    FROM reservation_units
    WHERE reservation_id = p_reservation_id
  )
  UPDATE reservation_units ru
  SET unit_id = requested.unit_id
  FROM slots
  JOIN requested
    ON requested.unit_type = slots.unit_type
   AND requested.slot_position = slots.slot_position
  WHERE ru.id = slots.id;
END;
$$;

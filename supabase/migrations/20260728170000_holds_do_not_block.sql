-- Only assigned units block. Holds inform, they do not gate.
--
-- Previous behaviour: fleet_availability() counted every overlapping hold
-- (reserved_unpaid / reserved_authorized / reserved_paid) against fleet size, so
-- a booking nobody had allocated hardware to could still turn away the next
-- customer. That does not match how the business runs — the owner deliberately
-- takes more bookings than units, then allocates physical devices before the
-- event.
--
-- New split:
--   assigned -> distinct physical units committed to overlapping reservations.
--               This is the ONLY thing that can make a checkout fail.
--   booked   -> overlapping holds, units-equivalent. Informational: drives the
--               admin over-subscription warning. Never gates anything.
--
-- A reservation with no unit assigned therefore blocks nobody.

DROP FUNCTION IF EXISTS public.fleet_availability(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.fleet_availability(
  p_product_id UUID,
  p_start      DATE,
  p_end        DATE
)
RETURNS TABLE (
  capacity  INT,
  assigned  INT,
  booked    INT,
  remaining INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH fleet AS (
    SELECT COUNT(*)::INT AS n
    FROM units
    WHERE product_id = p_product_id
      AND retired_at IS NULL
      AND status NOT IN ('damaged', 'lost', 'sold')
  ),
  target_is_atlas2 AS (
    SELECT EXISTS (
      SELECT 1 FROM products WHERE id = p_product_id AND slug = 'atlas-2'
    ) AS v
  ),
  -- Every unit committed to a reservation overlapping the window, via either
  -- assignment mechanism: reservations.unit_id for single-unit rentals, and
  -- reservation_units.unit_id for per-slot package allocation.
  committed AS (
    SELECT DISTINCT link.unit_id
    FROM (
      SELECT r.id AS reservation_id, r.unit_id
      FROM reservations r
      WHERE r.unit_id IS NOT NULL
      UNION ALL
      SELECT ru.reservation_id, ru.unit_id
      FROM reservation_units ru
      WHERE ru.unit_id IS NOT NULL
    ) link
    JOIN reservations r ON r.id = link.reservation_id
    JOIN units un       ON un.id = link.unit_id
    LEFT JOIN rental_events e ON e.id = r.event_id
    LEFT JOIN date_windows  w ON w.id = r.date_window_id
    WHERE un.product_id = p_product_id
      AND r.status IN ('reserved_unpaid', 'reserved_authorized', 'reserved_paid')
      AND COALESCE(e.start_date, w.start_date, r.start_date) IS NOT NULL
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   IS NOT NULL
      AND COALESCE(e.start_date, w.start_date, r.start_date) <= p_end
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   >= p_start
  ),
  assigned AS (
    SELECT COUNT(*)::INT AS n FROM committed
  ),
  -- Holds overlapping the window, in units-equivalent terms. A package
  -- contributes products.atlas2_units_required rather than one row.
  booked AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN r.product_id = p_product_id THEN GREATEST(COALESCE(r.quantity, 1), 1)
        ELSE GREATEST(COALESCE(pr.atlas2_units_required, 0), 0)
      END
    ), 0)::INT AS n
    FROM reservations r
    JOIN products pr ON pr.id = r.product_id
    LEFT JOIN rental_events e ON e.id = r.event_id
    LEFT JOIN date_windows  w ON w.id = r.date_window_id
    CROSS JOIN target_is_atlas2 t
    WHERE r.status IN ('reserved_unpaid', 'reserved_authorized', 'reserved_paid')
      AND (
        r.product_id = p_product_id
        OR (t.v AND COALESCE(pr.atlas2_units_required, 0) > 0)
      )
      AND COALESCE(e.start_date, w.start_date, r.start_date) IS NOT NULL
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   IS NOT NULL
      AND COALESCE(e.start_date, w.start_date, r.start_date) <= p_end
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   >= p_start
  )
  SELECT
    fleet.n,
    assigned.n,
    booked.n,
    -- Headroom against physical hardware. Deliberately ignores `booked`.
    GREATEST(0, fleet.n - assigned.n)
  FROM fleet, assigned, booked;
$$;

COMMENT ON FUNCTION public.fleet_availability(UUID, DATE, DATE) IS
  'Fleet availability. `remaining` = capacity - assigned units and is the only '
  'gate on checkout; an unassigned hold blocks nobody. `booked` counts '
  'overlapping holds for the admin over-subscription warning and gates nothing.';

REVOKE ALL ON FUNCTION public.fleet_availability(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_availability(UUID, DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.fleet_availability(UUID, DATE, DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_availability(UUID, DATE, DATE) TO service_role;

-- Supports the committed-units scan.
CREATE INDEX IF NOT EXISTS idx_reservations_unit_id
  ON reservations (unit_id)
  WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_units_unit_id
  ON reservation_units (unit_id)
  WHERE unit_id IS NOT NULL;

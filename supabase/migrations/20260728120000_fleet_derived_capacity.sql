-- Fleet-derived capacity + dead table cleanup.
--
-- Problem this fixes: rental availability compared a reservation count against a
-- hand-typed integer (rental_event_products.capacity, hardcoded to 40 on event
-- creation). The physical fleet in `units` was never consulted, so the Add Unit
-- button had no effect on what could be sold, and two events overlapping in time
-- could each sell the whole fleet independently.
--
-- After this migration capacity is the fleet, and holds are counted across every
-- flow that overlaps the requested dates.

-- ── fleet_availability ───────────────────────────────────────────────────────
--
-- Returns (capacity, reserved, remaining) for one product over one date range.
--
-- capacity : serviceable, non-retired rows in `units` for the product.
-- reserved : units committed by overlapping holds, where a hold contributes
--            - its own quantity when the reservation is for this product, or
--            - products.atlas2_units_required when a package consumes Atlas 2
--              units without being the Atlas 2 product itself.
--
-- Effective dates per reservation type, since reservations.start_date/end_date are
-- NULL for rental_event and rental_custom (dates live on the parent row):
--   rental_event   -> rental_events.start_date .. end_date
--   rental_custom  -> date_windows.start_date .. end_date
--   package/other  -> reservations.start_date .. end_date

CREATE OR REPLACE FUNCTION public.fleet_availability(
  p_product_id UUID,
  p_start      DATE,
  p_end        DATE
)
RETURNS TABLE (capacity INT, reserved INT, remaining INT)
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
      SELECT 1 FROM products
      WHERE id = p_product_id AND slug = 'atlas-2'
    ) AS v
  ),
  holds AS (
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
      -- Half-open overlap on inclusive date ranges: starts on or before our end,
      -- and ends on or after our start. NULL ranges cannot be placed, so skip.
      AND COALESCE(e.start_date, w.start_date, r.start_date) IS NOT NULL
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   IS NOT NULL
      AND COALESCE(e.start_date, w.start_date, r.start_date) <= p_end
      AND COALESCE(e.end_date,   w.end_date,   r.end_date)   >= p_start
  )
  SELECT
    fleet.n,
    holds.n,
    GREATEST(0, fleet.n - holds.n)
  FROM fleet, holds;
$$;

COMMENT ON FUNCTION public.fleet_availability(UUID, DATE, DATE) IS
  'Fleet-derived availability. Capacity comes from serviceable units, never from '
  'the display-only capacity columns. Counts overlapping holds across events, '
  'date windows and multi-unit packages.';

-- Availability is read with the service role from server-side handlers only.
REVOKE ALL ON FUNCTION public.fleet_availability(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_availability(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.fleet_availability(UUID, DATE, DATE) TO service_role;

-- Supports the fleet count and the per-product hold scan.
CREATE INDEX IF NOT EXISTS idx_units_product_serviceable
  ON units (product_id)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_product_status
  ON reservations (product_id, status);

-- ── Document the demoted columns ─────────────────────────────────────────────
--
-- Kept (NOT NULL, populated from the live fleet size on event creation) so admin
-- reads and exports keep working. No availability decision reads them any more.

COMMENT ON COLUMN rental_event_products.capacity IS
  'DISPLAY ONLY. Availability derives from fleet_availability(); this is a '
  'snapshot of fleet size when the event was created and may be stale.';

COMMENT ON COLUMN date_window_allocations.capacity IS
  'DISPLAY ONLY. Availability derives from fleet_availability().';

-- ── Drop dead tables ─────────────────────────────────────────────────────────
--
-- All six are empty and unreferenced by any application code path: no .from()
-- call, no nested PostgREST select, no database function.
--
-- Deliberately NOT dropped, despite reading as unused in a code grep:
--   notifications  - 28 live rows, written by expire_unpaid_reservations() and
--                    send_return_form_reminders(); the latter is an active cron.
--   return_reports - read by send_return_form_reminders(); dropping it breaks
--                    that job even though the table is empty.

DROP TABLE IF EXISTS cart_items;            -- FK child of carts, drop first
DROP TABLE IF EXISTS carts;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS product_option_values; -- FK child of product_options
DROP TABLE IF EXISTS product_options;
DROP TABLE IF EXISTS product_media;

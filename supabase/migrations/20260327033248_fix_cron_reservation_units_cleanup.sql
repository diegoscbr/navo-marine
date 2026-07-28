-- Fix: expire_unpaid_reservations() now deletes reservation_units rows
-- for expiring reservations before cancelling them.
--
-- Without this, expired unpaid reservations leave stale reservation_units
-- rows that permanently block package unit availability in
-- checkMultiUnitAvailability().
--
-- The reservation_units table also has ON DELETE CASCADE from
-- migrations/005, so admin DELETE already works. This fix addresses
-- the cron expiry path only.

CREATE OR REPLACE FUNCTION expire_unpaid_reservations()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, unit_id, customer_email, user_id
    FROM reservations
    WHERE status = 'reserved_unpaid' AND expires_at < now()
  LOOP
    -- Delete reservation_units rows so they no longer block availability
    DELETE FROM reservation_units WHERE reservation_id = r.id;

    UPDATE reservations
    SET status = 'cancelled', updated_at = now()
    WHERE id = r.id;

    IF r.unit_id IS NOT NULL THEN
      UPDATE units SET status = 'available' WHERE id = r.unit_id;
      INSERT INTO unit_events (unit_id, event_type, from_status, to_status, actor_type, notes)
      VALUES (r.unit_id, 'status_changed', 'reserved_unpaid', 'available', 'system',
              'Reservation expired after 24 hours');
    END IF;

    INSERT INTO notifications (user_id, message, link)
    VALUES (r.user_id, 'Your reservation expired. Book again anytime.', '/reserve');
  END LOOP;
END;
$$;

-- Pauses the unpaid-reservation expiry job until Phase 3 replaces it
-- with a Vercel Cron route that verifies with Stripe before cancelling.
-- The function expire_unpaid_reservations() remains defined for reference;
-- only the schedule is removed.
--
-- Background: the webhook handler in production has been silently failing
-- signature verification, leaving paid reservations in `reserved_unpaid`
-- state until this cron flipped them to `cancelled`. With the cron paused,
-- new paid customers can no longer be phantom-cancelled. Phase 3 introduces
-- a Vercel Cron route that consults Stripe before cancelling, providing
-- defense-in-depth so this bug class cannot recur.

SELECT cron.unschedule('expire-unpaid-reservations');

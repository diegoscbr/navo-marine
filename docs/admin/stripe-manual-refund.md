# Manual Stripe Refund Guide

When deleting a paid reservation from the admin dashboard, no automatic refund is issued. Follow these steps to process a refund through Stripe.

## Steps

1. **Go to Stripe Dashboard**
   - Production: https://dashboard.stripe.com/payments
   - Test mode: https://dashboard.stripe.com/test/payments

2. **Find the payment**
   - Search by customer email or the reservation's `stripe_payment_intent_id`
   - Or browse recent payments and match by amount/date

3. **Issue the refund**
   - Click the payment to open details
   - Click **"Refund"** in the top-right
   - Choose **Full refund** or enter a **Partial refund** amount
   - Select a reason (e.g., "Requested by customer")
   - Click **"Refund"**

4. **Verify**
   - Payment status changes to **"Refunded"** (full) or **"Partially refunded"**
   - Customer receives a refund confirmation email from Stripe
   - Refund typically takes 5-10 business days to appear on the customer's statement

## Notes

- Stripe refunds can only be issued within **180 days** of the original charge
- Stripe fees on the original charge are **not** returned on refund
- For held payments (`reserved_authorized`), use **"Cancel payment"** instead of refund -- this releases the hold without charging

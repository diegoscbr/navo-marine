# Invoice Guide for Admin

## Using the Send Invoice Button

When a customer has a `reserved_unpaid` reservation (started checkout but didn't complete payment), you can send them a payment link directly from the admin dashboard.

1. Go to **Admin > Reservations**
2. Find the unpaid reservation row -- it will have a **mail icon** in the Actions column
3. Click the mail icon
4. Review the confirmation dialog (customer email, amount, product)
5. Click **Send Invoice**
6. The customer receives an email with a "Complete Your Payment" button linking to Stripe checkout

## What Happens After Payment

Once the customer clicks the link and completes payment:

- Reservation status automatically updates to `reserved_paid`
- An order record is created
- A booking confirmation email is sent to the customer
- Both emails (invoice + confirmation) are BCC'd to `info@navomarine.com`

No manual action required after sending the invoice.

## Re-sending

Stripe checkout links expire after **24 hours**. If the customer doesn't pay in time:

- The reservation stays `reserved_unpaid`
- The Send Invoice button remains available
- Click it again to generate a fresh payment link

Each re-send creates a new Stripe checkout session and replaces the old one.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Customer email is wrong | Update it in the Supabase dashboard (`reservations` table), then send the invoice |
| Amount is wrong | Cannot change the amount on an existing reservation. Create a new reservation with the correct amount, delete the old one |
| Customer says they didn't get the email | Check `info@navomarine.com` for the BCC copy. Re-send the invoice. Check spam folder |
| Button doesn't appear | Only shows for `reserved_unpaid` reservations. Paid/cancelled/completed reservations can't be invoiced |

## Manual Fallback via Stripe Dashboard

If the Send Invoice button isn't working (e.g., Stripe is down, deploy issue):

1. Go to [Stripe Dashboard > Payment Links](https://dashboard.stripe.com/payment-links) (or [test mode](https://dashboard.stripe.com/test/payment-links))
2. Click **+ New** to create a payment link
3. Add a product with the correct name and price
4. Copy the generated link and email it to the customer manually

**Important:** Payment links created directly in Stripe will NOT automatically update the reservation status in the admin dashboard. You will need to manually update the reservation in Supabase after confirming payment.

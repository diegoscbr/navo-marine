# E2E Testing Notes & Requirements

## Sign-In Flow

### Non-Admin Users
- **Current state:** Sign-in works — user clicks sign-in button, redirects to Google OAuth, lands on `/` (dashboard) with a top nav bar for navigation.
- **Change needed:** After sign-in, redirect non-admin users to the **home page** immediately (not the current default route).

### Admin Users
- **Change needed:** After sign-in, redirect admin users to `/admin` dashboard immediately.
- **Admin identification:** Users with the `@nabomarine.com` email suffix are admins.

## Authorization / Access Control

- **Verified working:** Non-admin users who manually navigate to `/admin` get a **403 Access Restricted** page.
- **Verified working:** No clickable elements on the 403 page that could leak admin access — clicking anything redirects to home. ✅

## New Pages Needed

- **Payment success page** — needs to be built and integrated into the flow.

## Admin Dashboard Features

### Admin Home Page — Calendar View (Priority)
- First thing admins should see on login.
- Purpose: give admins a quick mental model of operations at a glance.
- Should show:
  - What products and services are being offered.
  - What events are being served.
  - How many units are assigned to each event.

### Fleet Page (`/admin/fleet`)
- **Current state:** Already handles showing how many units are reserved, available, and not available. ✅
- This is separate from the calendar home view — fleet is the inventory lens, calendar is the scheduling lens.

### Event Management (Admin Portal)
- **Change needed:** Admins need a way to **pre-populate/create events** that the company is servicing.
- These events feed into the customer-facing "Rent for an event" dropdown (see below).

---

## Data Handling & Payment Safety

- **User data isolation:** Verify that one user cannot access another user's data.
- **Payment atomicity:** Payments must be strictly locked and atomic — a user should **not** be able to accidentally pay twice (e.g., panic double-clicking checkout).
- **Current reservation flow:** When payment comes in → Vakros unit is marked as reserved. Moving units through other statuses is manual for now, and that's acceptable for MVP.
- **Goal:** Make the reservation flow as streamlined as possible for the user.

---

## Main Page / Products

### "View Product" Button
- For all packages → should redirect to the **packages page**.
- Exception: **Vakros Atlas 2** products → current behavior is correct. ✅

### Checkout Button
- **Change needed:** Currently says "Checkout coming soon — contact sales." This should now be a **real checkout button**.

### Naming: "Reserve" → "Rental"
- **Change needed:** The tab currently labeled "Reserve" (for Atlas 2) should be renamed to **"Rental"**.
- Need to clearly distinguish between:
  - **Rental** — renting an Atlas 2 unit (individual service/product).
  - **Purchase** — buying the product outright.

### "Rent for an Event" Flow
- **Change needed:** When user clicks "Rent for an event," they should see a **dropdown of available events** to select from.
- These events are populated from the admin portal (see Admin Event Management above).
- **Bug:** Currently getting a **network error** when attempting "Rent for an event." Needs to be investigated and fixed.

### "Custom Dates" Option
- Should redirect to the **contact page**. (Currently a bug in purchase stream. Should redirect to contact and payment handled as a custom invoice.) 
- Question: If the client has no lnowledge of how to use stripe how do we make custom invoices? 

---

## Contact Page

- **Change needed:** Add a phone number to the contact page.
- **Phone number:** `619-288-9746`

---

## E2E Testing Scope

All of the above flows need end-to-end tests:

1. Non-admin sign-in → redirects to home page.
2. Admin sign-in (`@nabomarine.com`) → redirects to `/admin`.
3. Non-admin user manually navigating to `/admin` → receives 403.
4. Payment success page renders correctly after payment flow.
5. Admin calendar view loads and displays event/unit rental data.
6. User data isolation — user A cannot see user B's data.
7. Payment atomicity — double-submit does not create duplicate charges.
8. "Rent for an event" dropdown populates with admin-created events.
9. "Rent for an event" flow completes without network errors.
10. Checkout button works end-to-end (replaces "coming soon" copy).
11. Admin can create/manage events in the admin portal.

# E2E Test Log

Manual browser testing results for critical user flows.
Last updated: 2026-03-25

---

## /packages Booking Flow

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Unauthenticated → redirects to `/login` | ✅ PASS | |
| 2 | Three package cards render (Race Committee, R/C WL Course, RaceSense) | ✅ PASS | |
| 3 | RaceSense card shows payment hold disclosure + 90-day advance notice | ✅ PASS | |
| 4 | Click package → advances to Step 2 (date picker) | ✅ PASS | |
| 5 | Pick date range → advances to Step 3 (review + pricing) | ⬜ NOT TESTED | Blocked by bug #1 below |
| 6 | Reserve & Pay → redirects to Stripe checkout | ❌ FAIL | **Bug #1:** `checkMultiUnitAvailability` 503 — `created_at` column doesn't exist on `units` table (it's `added_at`). **Fixed in commit below.** |

---

## /reserve Page

| # | Test | Status | Notes |
|---|------|--------|-------|
| 7 | Shows `$35/day` pricing | ✅ PASS | |
| 8 | Extra days stepper present (0–14) | ✅ PASS | |

---

## Admin

| # | Test | Status | Notes |
|---|------|--------|-------|
| 9 | `/admin/reservations` loads reservation list | ✅ PASS | |
| 10 | Regatta package reservation shows HOLD badge | ⬜ NOT TESTED | No regatta reservation in DB yet |

---

## Navigation

| # | Test | Status | Notes |
|---|------|--------|-------|
| 11 | "Packages" link visible in Navbar | ✅ PASS | |
| 12 | Post-login `/dashboard` has nav links back to site | ❌ FAIL | **Bug #2:** Dashboard had no `<Navbar />` — dead end after login. **Fixed in commit below.** |

---

## Bugs Found & Fixed

### Bug #1 — `checkMultiUnitAvailability` 503
- **Symptom:** Reserve & Pay returns 503 with `Error: checkMultiUnitAvailability:`
- **Root cause:** `lib/db/packages.ts` queried `.gte('created_at', ...)` but the `units` table column is `added_at`. Supabase returned a silent error object with an empty message string.
- **Fix:** Changed `created_at` → `added_at` in both sentinel filters (`lib/db/packages.ts`)
- **Status:** ✅ Fixed

### Bug #2 — Dashboard is a dead end after login
- **Symptom:** After Google OAuth login, user lands on `/dashboard` with no navigation — only a sign out button.
- **Root cause:** `app/dashboard/page.tsx` had no `<Navbar />` or `<Footer />`.
- **Fix:** Added `<Navbar />` and `<Footer />` to dashboard layout.
- **Status:** ✅ Fixed

---

## Remaining / Re-test After Fixes

- [ ] Test 5: Pick date range → Step 3 review
- [ ] Test 6: Reserve & Pay → Stripe checkout (re-test after Bug #1 fix)
- [ ] Test 10: HOLD badge (needs a regatta package reservation in DB)
- [ ] Test 12: Dashboard nav (re-test after Bug #2 fix)

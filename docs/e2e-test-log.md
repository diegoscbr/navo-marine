# E2E Test Log

Manual browser testing results for critical user flows.
Last updated: 2026-03-23

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

---

## Session 4 Findings (2026-03-23)

### Admin — Unit Assignment

| # | Test | Status | Notes |
|---|------|--------|-------|
| 13 | Unit dropdown shows `navo_number` and filters to available units | ✅ PASS | Fixed this session |
| 14 | Package reservations support multi-unit assignment | ❌ FAIL | **Bug #3** — see below |

---

### Bug #3 — Unit assignment is single-unit only; packages require multiple units

**Symptom:** The unit assignment dropdown on `/admin/reservations` allows assigning exactly one unit per reservation. This works for individual Atlas 2 rentals but is wrong for package reservations.

**Expected behavior by reservation/package type:**

| Type | Units to assign |
|------|----------------|
| Individual Atlas 2 rental (`/reserve`) | 1 × Atlas 2 unit |
| Race Committee Package | 1 × tablet + up to 5 × Atlas 2 units |
| R/C W/L Course (Win-Win) Package | 1 × tablet only |
| RaceSense Management Package | 1 × tablet only |

**Root cause:** `reservations.unit_id` is a single FK column — it can only hold one unit. Packages that bundle multiple physical units (Race Committee: tablet + fleet of Atlas 2s) have no place to record each assignment.

**Impact:** Admin cannot record which physical devices are deployed for a package booking. Race Committee is the most complex case: it requires one tablet and potentially 5 Atlas 2 units all assigned to the same reservation.

**Fix required:**
- A `reservation_units` join table (`reservation_id`, `unit_id`, `unit_role` e.g. `tablet` / `atlas`) to support multi-unit assignment
- UI update on `/admin/reservations`: replace single dropdown with per-role assignment UI, gated by `reservation_type`
- Individual rentals keep the existing single-unit pattern (can migrate `unit_id` → `reservation_units` or keep as-is)

**Status:** ❌ Not fixed — needs design + schema migration

---

## Remaining / Re-test After Fixes

- [ ] Test 5: Pick date range → Step 3 review
- [ ] Test 6: Reserve & Pay → Stripe checkout (re-test after Bug #1 fix)
- [ ] Test 10: HOLD badge (needs a regatta package reservation in DB)
- [ ] Test 12: Dashboard nav (re-test after Bug #2 fix)
- [ ] Test 14: Multi-unit assignment for package reservations (after Bug #3 fix)

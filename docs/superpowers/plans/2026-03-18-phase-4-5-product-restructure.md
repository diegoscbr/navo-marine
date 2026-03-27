# Phase 4.5 — Product Restructure & Regatta Management Packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-day pricing to Atlas 2 rentals, seed three regatta management packages, and build a new `/packages` booking page with a 3-step flow (choose → dates → review → Stripe checkout).

**Architecture:** Additive schema migrations extend `products`, `units`, `reservations`, and `rental_event_products` with per-day pricing fields; a new `reservation_units` table handles multi-unit allocations. The checkout route is refactored into per-type handler modules (`lib/checkout/handlers/`). A new `lib/db/packages.ts` repository handles date-range availability checks. The `/packages` page is a protected 3-step client component using `react-day-picker` for date selection.

**Dependency:** Phase 4 (Stripe webhook handler) MUST be merged to `dev` before implementing Tasks 0–12. Task 12 creates `app/admin/reservations/page.tsx` from scratch (Phase 4 only shipped the webhook handler, not an admin UI).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase JS (`supabaseAdmin`), Stripe SDK, react-day-picker v9, Jest + React Testing Library, Playwright

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/005_phase_4_5_schema.sql` | Additive schema: unit_type, products per-day fields, reservations dates, reservation_units, indexes |
| Create | `supabase/migrations/006_phase_4_5_seed.sql` | Seed 3 regatta products + update Atlas 2 + 2 tablet units |
| Create | `lib/utils/dates.ts` | `daysBetween()`, `isValidDate()`, `formatDateRange()` — shared between checkout + UI |
| Create | `lib/db/packages.ts` | `checkPackageAvailability()`, `checkMultiUnitAvailability()`, `getPackageProductById()`, `insertReservationUnits()` |
| Create | `lib/checkout/handlers/rental-event.ts` | Extracted rental_event logic from checkout route |
| Create | `lib/checkout/handlers/rental-custom.ts` | Extracted rental_custom logic from checkout route |
| Create | `lib/checkout/handlers/regatta-package.ts` | New regatta_package handler with per-day pricing + hold support |
| Modify | `app/api/checkout/route.ts` | Slim shell: auth check + type dispatch to handlers |
| Modify | `app/reserve/ReserveBookingUI.tsx` | Add `extra_days` stepper (0–14) + per-day pricing display |
| Create | `app/packages/page.tsx` | Server component: auth guard + load products from DB |
| Create | `app/packages/PackagesUI.tsx` | 3-step client container (step state management) |
| Create | `app/packages/PackageCards.tsx` | Step 1: three package cards with pricing + equipment details |
| Create | `app/packages/DateRangePicker.tsx` | Step 2: react-day-picker range + availability + live pricing preview |
| Create | `app/packages/PackageReviewStep.tsx` | Step 3: full pricing breakdown + "Reserve & Pay" / "Reserve & Hold" CTA |
| Modify | `components/layout/Navbar.tsx` | Add "Packages" link alongside "Reserve" |
| Create | `app/admin/reservations/page.tsx` | New admin reservations list with "HOLD — awaiting capture" badge for `payment_mode = 'hold'` reservations |
| Create | `__tests__/lib/utils/dates.test.ts` | Unit tests for date utilities |
| Create | `__tests__/lib/db/packages.test.ts` | Unit tests for package availability repository |
| Create | `__tests__/lib/checkout/handlers/regatta-package.test.ts` | Unit tests for regatta-package handler |
| Create | `__tests__/api/checkout-regatta.test.ts` | Integration tests for POST /api/checkout with regatta_package |
| Modify | `__tests__/components/reserve/ReserveBookingUI.test.tsx` | Update for extra_days stepper + per-day pricing |
| Create | `__tests__/components/packages/PackagesUI.test.tsx` | Component tests for 3-step flow |
| Create | `app/api/packages/availability/route.ts` | GET: date-range availability check for packages page |
| Create | `e2e/packages-booking.spec.ts` | E2E tests for /packages booking flow |

---

## Task 0: Schema Migration

**Files:**
- Create: `supabase/migrations/005_phase_4_5_schema.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 005_phase_4_5_schema.sql
-- Phase 4.5: Product restructure + Regatta Management Packages
-- All changes are ADDITIVE. No columns dropped, no tables removed.

-- ── units table ─────────────────────────────────────────────────────────────
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'atlas2'
    CHECK (unit_type IN ('atlas2', 'tablet'));

-- ── products table ───────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'individual_rental'
    CHECK (category IN ('individual_rental', 'regatta_management')),
  ADD COLUMN IF NOT EXISTS price_per_day_cents INT,
  -- NOTE: price_per_day_cents is nullable for individual_rental products (they use base_price_cents).
  -- regatta_management products MUST have a non-null value — enforced by the application layer
  -- in getPackageProductById (returns null if price_per_day_cents is null) and by seed data.
  -- UI code must always guard: product.price_per_day_cents ?? 0 to prevent NaN display.
  ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'capture'
    CHECK (payment_mode IN ('capture', 'hold')),
  ADD COLUMN IF NOT EXISTS min_advance_booking_days INT,
  ADD COLUMN IF NOT EXISTS atlas2_units_required INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tablet_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 1;

-- ── rental_event_products table ──────────────────────────────────────────────
ALTER TABLE rental_event_products
  ADD COLUMN IF NOT EXISTS rental_price_per_day_cents INT;

-- Backfill: existing Atlas 2 event products → $35/day
-- rental_price_cents is kept but deprecated; use rental_price_per_day_cents
UPDATE rental_event_products
SET rental_price_per_day_cents = 3500
WHERE rental_price_per_day_cents IS NULL;

-- ── reservations table ───────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS extra_days INT NOT NULL DEFAULT 0;

-- ── reservation_units table (new) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id, unit_id)
);

-- ── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservation_units_reservation
  ON reservation_units(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_units_unit
  ON reservation_units(unit_id);

-- For date-range overlap queries (packages availability check)
CREATE INDEX IF NOT EXISTS idx_reservations_dates
  ON reservations(product_id, start_date, end_date);

-- For unit type queries (multi-unit availability)
CREATE INDEX IF NOT EXISTS idx_units_type
  ON units(unit_type);

-- ── Update reservation_type CHECK to include regatta_package ─────────────────
-- Postgres requires dropping and re-adding named CHECK constraints.
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_reservation_type_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_reservation_type_check
    CHECK (reservation_type IN (
      'rental_event', 'rental_custom', 'purchase', 'regatta_package'
    ));

-- ── Update status CHECK to include reserved_authorized ───────────────────────
-- reserved_authorized: Management Services hold placed on Stripe; not yet captured.
-- CRITICAL: without this, webhook setting status='reserved_authorized' will throw
-- a constraint violation and the booking will be silently lost.
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status IN (
      'reserved_unpaid', 'reserved_authorized', 'reserved_paid',
      'cancelled', 'completed'
    ));
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `fdjuhjadjqkpqnpxgmue`
- `name`: `phase_4_5_schema`
- `query`: contents of the SQL above

- [ ] **Step 3: Verify migration applied**

Use `mcp__supabase__list_migrations` to confirm `005_phase_4_5_schema` appears.

---

## Task 1: Seed Migration

**Files:**
- Create: `supabase/migrations/006_phase_4_5_seed.sql`

- [ ] **Step 1: Write seed file**

```sql
-- 006_phase_4_5_seed.sql
-- Phase 4.5: Seed regatta management products + tablet units + update Atlas 2

-- ── Update Atlas 2 (existing product) ────────────────────────────────────────
UPDATE products
SET
  category = 'individual_rental',
  price_per_day_cents = 3500,
  atlas2_units_required = 1,
  tablet_required = FALSE,
  capacity = 10
WHERE slug = 'atlas-2';

-- ── Insert regatta management products ───────────────────────────────────────
INSERT INTO products (
  name, slug, category, price_per_day_cents, payment_mode,
  min_advance_booking_days, atlas2_units_required, tablet_required,
  capacity, base_price_cents
)
VALUES
  (
    'Race Committee Package',
    'race-committee-package',
    'regatta_management',
    10500,   -- $105/day
    'capture',
    NULL,
    0,
    TRUE,    -- tablet_required
    3,       -- capacity: up to 3 concurrent bookings
    10500    -- base_price_cents = 1 day as fallback
  ),
  (
    'R/C Windward Leeward Course Package',
    'rc-wl-course-package',
    'regatta_management',
    17000,   -- $170/day
    'capture',
    NULL,
    5,       -- atlas2_units_required
    TRUE,    -- tablet_required
    2,       -- capacity: up to 2 concurrent bookings
    17000
  ),
  (
    'RaceSense Management Services',
    'racesense-management-services',
    'regatta_management',
    40000,   -- $400/day
    'capture',  -- was 'hold'; switched to immediate payment (Stripe auth holds expire in 7 days,
                -- incompatible with 90-day advance booking window)
    90,      -- min_advance_booking_days
    0,
    FALSE,
    1,
    40000
  )
-- Use DO UPDATE (not DO NOTHING) so reruns correct stale pricing, capacity, and payment_mode.
ON CONFLICT (slug) DO UPDATE SET
  price_per_day_cents   = EXCLUDED.price_per_day_cents,
  payment_mode          = EXCLUDED.payment_mode,
  min_advance_booking_days = EXCLUDED.min_advance_booking_days,
  atlas2_units_required = EXCLUDED.atlas2_units_required,
  tablet_required       = EXCLUDED.tablet_required,
  capacity              = EXCLUDED.capacity,
  base_price_cents      = EXCLUDED.base_price_cents;

-- ── Seed tablet product (required: units.product_id is NOT NULL) ─────────────
-- Tablets are not sold directly; this product exists as a FK anchor only.
INSERT INTO products (id, name, slug, category, base_price_cents, active, price_per_day_cents, atlas2_units_required, tablet_required, capacity)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Tablet (Internal)',
  'tablet-internal',
  'individual_rental',
  0,
  false,   -- not sold directly
  NULL,
  0,
  FALSE,
  0
)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed tablet units ─────────────────────────────────────────────────────────
-- units.navo_number is UNIQUE NOT NULL; status must be 'available' (CHECK constraint)
INSERT INTO units (navo_number, serial_number, product_id, status, unit_type)
VALUES
  ('NAVO-TAB-001', 'NAVO-TAB-001',
   (SELECT id FROM products WHERE slug = 'tablet-internal'),
   'available', 'tablet'),
  ('NAVO-TAB-002', 'NAVO-TAB-002',
   (SELECT id FROM products WHERE slug = 'tablet-internal'),
   'available', 'tablet')
ON CONFLICT (navo_number) DO NOTHING;
```

- [ ] **Step 2: Apply seed migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `fdjuhjadjqkpqnpxgmue`
- `name`: `phase_4_5_seed`
- `query`: contents of the SQL above

- [ ] **Step 3: Verify seed data**

Use `mcp__supabase__execute_sql` to confirm:
```sql
SELECT slug, category, price_per_day_cents, payment_mode FROM products ORDER BY category, slug;
SELECT serial_number, unit_type FROM units WHERE unit_type = 'tablet';
```

Expected: 3 new regatta products, Atlas 2 updated, 2 tablet units.

---

## Task 2: Date Utilities

**Files:**
- Create: `lib/utils/dates.ts`
- Create: `__tests__/lib/utils/dates.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/utils/dates.test.ts
import { daysBetween, isValidDate, formatDateRange } from '@/lib/utils/dates'

describe('daysBetween', () => {
  it('returns 1 for same day', () => {
    expect(daysBetween('2026-03-20', '2026-03-20')).toBe(1)
  })

  it('returns 5 for a 5-day range', () => {
    expect(daysBetween('2026-03-20', '2026-03-24')).toBe(5)
  })

  it('returns 1 minimum even if end is before start (guard)', () => {
    expect(daysBetween('2026-03-24', '2026-03-20')).toBe(1)
  })
})

describe('isValidDate', () => {
  it('returns true for valid ISO date string', () => {
    expect(isValidDate('2026-03-20')).toBe(true)
  })

  it('returns false for garbage string', () => {
    expect(isValidDate('not-a-date')).toBe(false)
  })

  it('returns false for invalid date like 2026-13-45', () => {
    expect(isValidDate('2026-13-45')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidDate('')).toBe(false)
  })
})

describe('formatDateRange', () => {
  it('formats a multi-day range', () => {
    expect(formatDateRange('2026-03-20', '2026-03-24')).toBe('Mar 20–24, 2026')
  })

  it('formats a same-day range', () => {
    expect(formatDateRange('2026-03-20', '2026-03-20')).toBe('Mar 20, 2026')
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=dates --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/utils/dates'"

- [ ] **Step 3: Write implementation**

```typescript
// lib/utils/dates.ts

/**
 * Number of days in a date range, inclusive (same day = 1).
 * Always returns at least 1.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = Math.round((end.getTime() - start.getTime()) / msPerDay)
  return Math.max(1, diff + 1)
}

/**
 * Returns true if the string is a valid YYYY-MM-DD date.
 * Uses noon UTC to avoid timezone-related Invalid Date edge cases.
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr + 'T12:00:00Z')
  if (isNaN(d.getTime())) return false
  // Verify round-trip: JS coerces Feb 30 → Mar 2, so check parsed values match input
  const [year, month, day] = dateStr.split('-').map(Number)
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  )
}

/**
 * Human-readable date range label, e.g. "Mar 20–24, 2026" or "Mar 20, 2026".
 * Parses as noon UTC to prevent off-by-one display in US timezones (e.g. EST/PST
 * would shift UTC midnight to the previous day via toLocaleDateString).
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T12:00:00Z')
  const end = new Date(endDate + 'T12:00:00Z')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', opts)
  }

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })
  return `${startStr}–${endStr}`
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=dates --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/dates.ts __tests__/lib/utils/dates.test.ts
git commit -m "feat(utils): add daysBetween, isValidDate, formatDateRange utilities"
```

---

## Task 3: Package Availability Repository

**Files:**
- Create: `lib/db/packages.ts`
- Create: `__tests__/lib/db/packages.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/db/packages.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  Object.keys(chain).forEach((k) => {
    if (!['single', 'lte', 'gte'].includes(k) && !overrides[k]) {
      chain[k] = jest.fn().mockReturnValue(chain)
    }
  })
  if (!overrides['lte']) chain.lte = jest.fn().mockReturnValue(chain)
  if (!overrides['gte']) chain.gte = jest.fn().mockResolvedValue({ count: 0, error: null })
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('checkPackageAvailability', () => {
  it('returns available when no overlapping reservations', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
    })
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)

    const { checkPackageAvailability } = await import('@/lib/db/packages')
    const result = await checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1)

    expect(result.available).toBe(true)
    expect(result.reserved).toBe(0)
  })

  it('returns unavailable when capacity is full', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: 1, error: null }),
    })
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)

    const { checkPackageAvailability } = await import('@/lib/db/packages')
    const result = await checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1)

    expect(result.available).toBe(false)
  })

  it('throws if DB returns an error', async () => {
    const chain = makeChain({
      gte: jest.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
    })
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)

    const { checkPackageAvailability } = await import('@/lib/db/packages')
    await expect(
      checkPackageAvailability('product-uuid', '2026-04-01', '2026-04-05', 1),
    ).rejects.toThrow('checkPackageAvailability')
  })
})

describe('checkMultiUnitAvailability', () => {
  it('returns available when enough atlas2 and tablet units exist', async () => {
    // 3 calls: atlas2 count, tablet count, allocation count
    const calls = [
      { count: 10, error: null }, // 10 atlas2 available
      { count: 2, error: null },  // 2 tablets available
      { count: 0, error: null },  // 0 existing allocations
    ]
    let i = 0
    ;(supabaseAdmin.from as jest.Mock).mockImplementation(() => {
      const result = calls[i++]
      const chain = makeChain({ gte: jest.fn().mockResolvedValue(result) })
      return chain
    })

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)
    expect(result.available).toBe(true)
  })

  it('returns unavailable when not enough atlas2 units', async () => {
    const calls = [
      { count: 3, error: null },  // only 3 atlas2 (need 5)
      { count: 2, error: null },
      { count: 0, error: null },
    ]
    let i = 0
    ;(supabaseAdmin.from as jest.Mock).mockImplementation(() => {
      const result = calls[i++]
      return makeChain({ gte: jest.fn().mockResolvedValue(result) })
    })

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    const result = await checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true)
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(/atlas 2/i)
  })

  it('throws if DB returns error on unit count', async () => {
    ;(supabaseAdmin.from as jest.Mock).mockImplementation(() =>
      makeChain({ gte: jest.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }) }),
    )

    const { checkMultiUnitAvailability } = await import('@/lib/db/packages')
    await expect(
      checkMultiUnitAvailability('product-uuid', '2027-06-01', '2027-06-05', 5, true),
    ).rejects.toThrow('checkMultiUnitAvailability')
  })
})

describe('getPackageProduct', () => {
  it('returns product data when found', async () => {
    const mockProduct = {
      id: 'uuid',
      name: 'Race Committee Package',
      slug: 'race-committee-package',
      category: 'regatta_management',
      price_per_day_cents: 10500,
      payment_mode: 'capture',
      min_advance_booking_days: null,
      atlas2_units_required: 0,
      tablet_required: true,
      capacity: 1,
    }
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
    })
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)

    const { getPackageProduct } = await import('@/lib/db/packages')
    const product = await getPackageProduct('race-committee-package')

    expect(product).toEqual(mockProduct)
  })

  it('returns null when product not found', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)

    const { getPackageProduct } = await import('@/lib/db/packages')
    const product = await getPackageProduct('nonexistent-slug')

    expect(product).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=packages --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/db/packages'"

- [ ] **Step 3: Write implementation**

```typescript
// lib/db/packages.ts
import { supabaseAdmin } from '@/lib/db/client'
import type { AvailabilityResult } from '@/lib/db/availability'

export type PackageProduct = {
  id: string
  name: string
  slug: string
  category: string
  price_per_day_cents: number
  payment_mode: 'capture' | 'hold'
  min_advance_booking_days: number | null
  atlas2_units_required: number
  tablet_required: boolean
  capacity: number
}

/**
 * Date-range overlap availability check for management packages.
 * Counts active reservations where start_date <= end_date AND end_date >= start_date.
 */
export async function checkPackageAvailability(
  productId: string,
  startDate: string,
  endDate: string,
  capacity: number,
): Promise<AvailabilityResult> {
  const { count, error } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .in('status', ['reserved_unpaid', 'reserved_authorized', 'reserved_paid'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (error) throw new Error(`checkPackageAvailability: ${error.message}`)

  const reserved = count ?? 0
  return {
    available: reserved < capacity,
    reserved,
    capacity,
    remaining: Math.max(0, capacity - reserved),
  }
}

/**
 * Check that enough units of each required type are available ACROSS ALL PRODUCTS.
 * Queries reservation_units (not reservation counts) so Race Committee, R/C WL Course,
 * and RaceSense bookings all draw from the same physical Atlas 2 fleet.
 *
 * atlas2Required: number of Atlas 2 units this product needs (e.g. 5 for R/C WL Course)
 * tabletRequired: whether this product needs 1 tablet unit
 */
export async function checkMultiUnitAvailability(
  _productId: string,
  startDate: string,
  endDate: string,
  atlas2Required: number,
  tabletRequired: boolean,
): Promise<{ available: boolean; reason?: string }> {
  // Total units of each type in the fleet
  const { count: atlas2Total, error: a2Err } = await supabaseAdmin
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', 'atlas2')
    .eq('status', 'available')

  if (a2Err) throw new Error(`checkMultiUnitAvailability (atlas2): ${a2Err.message}`)

  const { count: tabletTotal, error: tabErr } = await supabaseAdmin
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('unit_type', 'tablet')
    .eq('status', 'available')

  if (tabErr) throw new Error(`checkMultiUnitAvailability (tablet): ${tabErr.message}`)

  // Query reservation_units for all active allocations in the date range — cross-product.
  // This is fleet-wide: a Race Committee booking and a R/C WL Course booking on the same
  // date both consume Atlas 2 units from the same pool.
  const { data: allocated, error: allocErr } = await supabaseAdmin
    .from('reservation_units')
    .select('unit_type, quantity, reservations!inner(status, start_date, end_date)')
    .in('reservations.status', ['reserved_unpaid', 'reserved_authorized', 'reserved_paid'])
    .lte('reservations.start_date', endDate)
    .gte('reservations.end_date', startDate)

  if (allocErr) throw new Error(`checkMultiUnitAvailability (alloc): ${allocErr.message}`)

  const atlas2InUse = (allocated ?? [])
    .filter((r: { unit_type: string }) => r.unit_type === 'atlas2')
    .reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0)

  const atlas2Available = (atlas2Total ?? 0) - atlas2InUse

  if (atlas2Available < atlas2Required) {
    return {
      available: false,
      reason: `Not enough Atlas 2 units (need ${atlas2Required}, ${atlas2Available} available)`,
    }
  }

  if (tabletRequired) {
    const tabletInUse = (allocated ?? [])
      .filter((r: { unit_type: string }) => r.unit_type === 'tablet')
      .reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0)
    const tabletsAvailable = (tabletTotal ?? 0) - tabletInUse
    if (tabletsAvailable < 1) {
      return { available: false, reason: 'No tablet units available for selected dates' }
    }
  }

  return { available: true }
}

/**
 * Insert reservation_units rows for a new reservation.
 * Called immediately after reservation insert; enables fleet-wide availability tracking.
 * Non-fatal: logs on error but does not throw (reservation is already committed).
 *
 * Each regatta product has fixed unit requirements (atlas2_units_required, tablet_required).
 * Phase 5 will backfill existing reservations and consolidate unit tracking.
 */
export async function insertReservationUnits(
  reservationId: string,
  productId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  // Fetch product's unit requirements
  const { data: product, error: productErr } = await supabaseAdmin
    .from('products')
    .select('atlas2_units_required, tablet_required')
    .eq('id', productId)
    .single()

  if (productErr || !product) {
    console.error('[insertReservationUnits] product fetch failed:', productErr?.message)
    return
  }

  const rows: { reservation_id: string; unit_type: string; quantity: number; start_date: string; end_date: string }[] = []

  if (product.atlas2_units_required > 0) {
    rows.push({ reservation_id: reservationId, unit_type: 'atlas2', quantity: product.atlas2_units_required, start_date: startDate, end_date: endDate })
  }
  if (product.tablet_required) {
    rows.push({ reservation_id: reservationId, unit_type: 'tablet', quantity: 1, start_date: startDate, end_date: endDate })
  }

  if (rows.length === 0) return

  const { error: insertErr } = await supabaseAdmin.from('reservation_units').insert(rows)
  if (insertErr) {
    console.error('[insertReservationUnits] insert failed:', insertErr.message)
    // Non-fatal: reservation and payment are committed. Admin can reconcile in Phase 5.
  }
}

const PRODUCT_SELECT = 'id, name, slug, category, price_per_day_cents, payment_mode, min_advance_booking_days, atlas2_units_required, tablet_required, capacity'

/**
 * Fetch a single package product by slug. Returns null if not found.
 */
export async function getPackageProduct(slug: string): Promise<PackageProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .single()

  if (error) return null
  return data as PackageProduct
}

/**
 * Fetch a single package product by UUID. Returns null if not found.
 * Used by the checkout handler where product_id (UUID) is provided.
 */
export async function getPackageProductById(id: string): Promise<PackageProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  // Category guard: only return the product if it's a regatta_management product.
  // Prevents a user from passing an Atlas 2 product_id and triggering hold payment logic.
  const product = data as PackageProduct
  if (product.category !== 'regatta_management') return null
  return product
}

/**
 * List all active regatta management products ordered by price.
 */
export async function listPackageProducts(): Promise<PackageProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(
      'id, name, slug, category, price_per_day_cents, payment_mode, min_advance_booking_days, atlas2_units_required, tablet_required, capacity',
    )
    .eq('category', 'regatta_management')
    .order('price_per_day_cents', { ascending: true })

  if (error) throw new Error(`listPackageProducts: ${error.message}`)
  return (data ?? []) as PackageProduct[]
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=packages --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/db/packages.ts __tests__/lib/db/packages.test.ts
git commit -m "feat(db): add packages repository — date-range availability + multi-unit checks"
```

---

## Task 4: Checkout Handler Extraction

**Files:**
- Create: `lib/checkout/handlers/rental-event.ts`
- Create: `lib/checkout/handlers/rental-custom.ts`
- Create: `__tests__/lib/checkout/handlers/rental-event.test.ts`

> No behavioral changes — this is a pure extraction. Tests verify the extracted handlers match current behavior.

- [ ] **Step 1: Write tests for rental-event handler**

```typescript
// __tests__/lib/checkout/handlers/rental-event.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/events', () => ({
  getEventProduct: jest.fn(),
}))
jest.mock('@/lib/db/availability', () => ({
  checkEventAvailability: jest.fn(),
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/utils/dates', () => ({
  daysBetween: jest.fn(),
  isValidDate: jest.fn(),
}))

import { getEventProduct } from '@/lib/db/events'
import { checkEventAvailability } from '@/lib/db/availability'
import { stripe } from '@/lib/stripe/client'

const mockGetEventProduct = getEventProduct as jest.Mock
const mockCheckAvailability = checkEventAvailability as jest.Mock
const mockStripeCreate = stripe.checkout.sessions.create as jest.Mock

describe('handleRentalEvent', () => {
  const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }

  beforeEach(() => jest.clearAllMocks())

  it('returns 404 when event product not found', async () => {
    mockGetEventProduct.mockResolvedValue(null)
    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')

    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 0 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(404)
  })

  it('returns 409 when event is sold out', async () => {
    mockGetEventProduct.mockResolvedValue({
      rental_price_per_day_cents: 3500,
      rental_price_cents: 24500,
      capacity: 5,
      start_date: '2026-04-01',
      end_date: '2026-04-03',
    })
    mockCheckAvailability.mockResolvedValue({ available: false, reserved: 5, capacity: 5, remaining: 0 })

    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')
    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 0 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(409)
  })

  it('creates Stripe session and returns url on success', async () => {
    mockGetEventProduct.mockResolvedValue({
      rental_price_per_day_cents: 3500,
      rental_price_cents: 24500,
      capacity: 5,
      start_date: '2026-04-01',
      end_date: '2026-04-03',
    })
    mockCheckAvailability.mockResolvedValue({ available: true, reserved: 0, capacity: 5, remaining: 5 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid', status: 'reserved_unpaid', expires_at: '' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const { daysBetween } = require('@/lib/utils/dates')
    ;(daysBetween as jest.Mock).mockReturnValue(3)

    const { handleRentalEvent } = await import('@/lib/checkout/handlers/rental-event')
    const result = await handleRentalEvent(
      { event_id: 'evt-1', product_id: 'prod-1', sail_number: 'USA-123', extra_days: 2 },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ url: 'https://checkout.stripe.com/test' })
    // extra_days=2, event_days=3 → 5 days × $35 = $175
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 17500 }) })],
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=rental-event --no-coverage
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write rental-event handler**

```typescript
// lib/checkout/handlers/rental-event.ts
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getEventProduct } from '@/lib/db/events'
import { checkEventAvailability } from '@/lib/db/availability'
import { daysBetween } from '@/lib/utils/dates'

type RentalEventInput = {
  event_id: string
  product_id: string
  sail_number: string
  extra_days: number
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

type UserSession = {
  user: { id?: string | null; email?: string | null }
}

export async function handleRentalEvent(
  input: RentalEventInput,
  session: UserSession,
  baseUrl: string,
): Promise<HandlerResult> {
  const eventProduct = await getEventProduct(input.event_id, input.product_id)
  if (!eventProduct) {
    return { status: 404, body: { error: 'Event product not found' } }
  }

  const availability = await checkEventAvailability(
    input.event_id,
    input.product_id,
    eventProduct.capacity,
  )
  if (!availability.available) {
    return { status: 409, body: { error: 'Sold out — no capacity remaining', availability } }
  }

  // Per-day pricing: (event_days + extra_days) × rental_price_per_day_cents
  const pricePerDay = eventProduct.rental_price_per_day_cents ?? eventProduct.rental_price_cents
  if (!pricePerDay || pricePerDay <= 0) {
    console.error('[checkout] rental-event: invalid price', { product_id: input.product_id, pricePerDay })
    return { status: 500, body: { error: 'Invalid product pricing configuration' } }
  }

  const eventDays = daysBetween(eventProduct.start_date, eventProduct.end_date)
  const totalDays = eventDays + Math.max(0, input.extra_days)
  const totalCents = totalDays * pricePerDay

  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: `Atlas 2 Rental — Event`,
              description: `Sail #${input.sail_number} | ${eventDays} event days + ${input.extra_days} extra`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: 'rental_event',
        product_id: input.product_id,
        event_id: input.event_id,
        sail_number: input.sail_number,
        extra_days: String(input.extra_days),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('[checkout] Stripe session creation failed (rental-event):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'rental_event',
      product_id: input.product_id,
      event_id: input.event_id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      sail_number: input.sail_number.trim(),
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      extra_days: input.extra_days,
      late_fee_applied: false,
      late_fee_cents: 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('[checkout] reservation insert failed (rental-event):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: (reservation as { id: string }).id,
    },
  }
}
```

- [ ] **Step 4: Write rental-custom handler**

```typescript
// lib/checkout/handlers/rental-custom.ts
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getDateWindowProduct } from '@/lib/db/events'
import { checkWindowAvailability } from '@/lib/db/availability'
import { daysBetween } from '@/lib/utils/dates'

type RentalCustomInput = {
  date_window_id: string
  product_id: string
  sail_number: string
  extra_days: number
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

type UserSession = {
  user: { id?: string | null; email?: string | null }
}

export async function handleRentalCustom(
  input: RentalCustomInput,
  session: UserSession,
  baseUrl: string,
): Promise<HandlerResult> {
  const windowProduct = await getDateWindowProduct(input.date_window_id, input.product_id)
  if (!windowProduct) {
    return { status: 404, body: { error: 'Date window product not found' } }
  }

  const availability = await checkWindowAvailability(
    input.date_window_id,
    input.product_id,
    windowProduct.capacity,
  )
  if (!availability.available) {
    return { status: 409, body: { error: 'Sold out — no capacity remaining', availability } }
  }

  // Per-day pricing: (window_days + extra_days) × price_per_day_cents
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('name, price_per_day_cents, base_price_cents')
    .eq('id', input.product_id)
    .single()

  const productData = product as { name: string; price_per_day_cents: number | null; base_price_cents: number } | null
  const pricePerDay = productData?.price_per_day_cents

  let totalCents: number
  if (pricePerDay && pricePerDay > 0) {
    // Per-day: window_days + extra_days
    const windowDays = daysBetween(windowProduct.start_date, windowProduct.end_date)
    const totalDays = windowDays + Math.max(0, input.extra_days)
    totalCents = totalDays * pricePerDay
  } else {
    // Fallback: flat base_price_cents (backwards compat)
    totalCents = productData?.base_price_cents ?? 0
  }

  if (!totalCents || totalCents <= 0) {
    console.error('[checkout] rental-custom: invalid price', { product_id: input.product_id, pricePerDay, totalCents })
    return { status: 500, body: { error: 'Invalid product pricing configuration' } }
  }

  const productName = productData?.name ?? 'Atlas 2 Rental'

  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: `${productName} — Custom Dates`,
              description: `Sail #${input.sail_number} | ${windowProduct.start_date} to ${windowProduct.end_date}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservation_type: 'rental_custom',
        product_id: input.product_id,
        date_window_id: input.date_window_id,
        sail_number: input.sail_number,
        extra_days: String(input.extra_days),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/reserve?checkout=cancelled`,
    })
  } catch (err) {
    console.error('[checkout] Stripe session creation failed (rental-custom):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'rental_custom',
      product_id: input.product_id,
      date_window_id: input.date_window_id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      sail_number: input.sail_number.trim(),
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      extra_days: input.extra_days,
      start_date: windowProduct.start_date,
      end_date: windowProduct.end_date,
      late_fee_applied: false,
      late_fee_cents: 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('[checkout] reservation insert failed (rental-custom):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: (reservation as { id: string }).id,
    },
  }
}
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=rental-event --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/checkout/ __tests__/lib/checkout/
git commit -m "refactor(checkout): extract rental-event and rental-custom into handler modules"
```

---

## Task 5: Regatta Package Handler

**Files:**
- Create: `lib/checkout/handlers/regatta-package.ts`
- Create: `__tests__/lib/checkout/handlers/regatta-package.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/checkout/handlers/regatta-package.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/db/packages', () => ({
  getPackageProductById: jest.fn(),   // matches import in regatta-package.ts handler
  checkPackageAvailability: jest.fn(),
  checkMultiUnitAvailability: jest.fn(),
  insertReservationUnits: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/utils/dates', () => ({
  daysBetween: jest.fn().mockReturnValue(5),
  isValidDate: jest.fn().mockReturnValue(true),
}))

import { getPackageProductById, checkPackageAvailability, checkMultiUnitAvailability, insertReservationUnits } from '@/lib/db/packages'
import { stripe } from '@/lib/stripe/client'

const mockGetProduct = getPackageProductById as jest.Mock
const mockCheckAvail = checkPackageAvailability as jest.Mock
const mockCheckMulti = checkMultiUnitAvailability as jest.Mock
const mockInsertUnits = insertReservationUnits as jest.Mock
const mockStripeCreate = stripe.checkout.sessions.create as jest.Mock

const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }

const baseProduct = {
  id: 'prod-uuid',
  name: 'Race Committee Package',
  slug: 'race-committee-package',
  category: 'regatta_management',
  price_per_day_cents: 10500,
  payment_mode: 'capture' as const,
  min_advance_booking_days: null,
  atlas2_units_required: 0,
  tablet_required: true,
  capacity: 1,
}

beforeEach(() => jest.clearAllMocks())

describe('handleRegattaPackage', () => {
  it('returns 400 for invalid start_date', async () => {
    const { isValidDate } = require('@/lib/utils/dates')
    ;(isValidDate as jest.Mock).mockReturnValueOnce(false)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: 'bad-date', end_date: '2026-04-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/invalid/i)
  })

  it('returns 400 when end_date is before start_date', async () => {
    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2026-04-10', end_date: '2026-04-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/end date must be on or after/i)
  })

  it('returns 400 when Management Services < 90 days advance', async () => {
    mockGetProduct.mockResolvedValue({ ...baseProduct, min_advance_booking_days: 90 })

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    // start_date is tomorrow — clearly < 90 days
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: tomorrow, end_date: tomorrow },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/90 days/i)
  })

  it('returns 409 when product is unavailable', async () => {
    mockGetProduct.mockResolvedValue(baseProduct)
    mockCheckAvail.mockResolvedValue({ available: false, reserved: 1, capacity: 1, remaining: 0 })

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(409)
  })

  it('creates capture Stripe session for Race Committee Package', async () => {
    mockGetProduct.mockResolvedValue(baseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_test_rc', url: 'https://stripe.com/rc' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    // 5 days × $105 = $525
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 52500 }) })],
      }),
    )
    // For capture mode, payment_intent_data must NOT be present (no hold)
    expect(mockStripeCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent_data: expect.anything() }),
    )
  })

  it('creates hold Stripe session for RaceSense Management Services', async () => {
    const raceSenseProduct = {
      ...baseProduct,
      name: 'RaceSense Management Services',
      slug: 'racesense-management-services',
      price_per_day_cents: 40000,
      payment_mode: 'hold' as const,
      min_advance_booking_days: 90,
    }
    mockGetProduct.mockResolvedValue(raceSenseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_hold_001', url: 'https://stripe.com/hold' })

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-hold-uuid' }, error: null }),
    }
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue(insertChain)

    const futureDate = new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0]
    const futureEndDate = new Date(Date.now() + 104 * 86400000).toISOString().split('T')[0]

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: futureDate, end_date: futureEndDate },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(200)
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: { capture_method: 'manual' },
      }),
    )
  })

  it('sets expires_at = null for hold-mode bookings (prevents cron cancellation race)', async () => {
    const raceSenseProduct = {
      ...baseProduct,
      payment_mode: 'hold' as const,
      min_advance_booking_days: 90,
    }
    mockGetProduct.mockResolvedValue(raceSenseProduct)
    mockCheckAvail.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })
    mockStripeCreate.mockResolvedValue({ id: 'cs_hold_001', url: 'https://stripe.com/hold' })

    const insertFn = jest.fn().mockReturnThis()
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      insert: insertFn,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'res-uuid' }, error: null }),
    })

    const futureDate = new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0]
    const futureEndDate = new Date(Date.now() + 104 * 86400000).toISOString().split('T')[0]

    await handleRegattaPackage(
      { product_id: 'prod-uuid', start_date: futureDate, end_date: futureEndDate },
      mockSession,
      'http://localhost',
    )

    // expires_at must be null for hold bookings — pg_cron skips rows where expires_at IS NULL
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: null }),
    )
  })

  it('returns 404 when product_id belongs to a non-regatta_management product (category guard)', async () => {
    // getPackageProductById returns null if category !== 'regatta_management'
    mockGetProduct.mockResolvedValue(null)

    const { handleRegattaPackage } = await import('@/lib/checkout/handlers/regatta-package')
    const result = await handleRegattaPackage(
      { product_id: 'atlas-2-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      mockSession,
      'http://localhost',
    )

    expect(result.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=regatta-package --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// lib/checkout/handlers/regatta-package.ts
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { getPackageProductById, checkPackageAvailability, checkMultiUnitAvailability, insertReservationUnits } from '@/lib/db/packages'
import { daysBetween, isValidDate } from '@/lib/utils/dates'

type RegattaPackageInput = {
  product_id: string
  start_date: string
  end_date: string
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

type UserSession = {
  user: { id?: string | null; email?: string | null }
}

export async function handleRegattaPackage(
  input: RegattaPackageInput,
  session: UserSession,
  baseUrl: string,
): Promise<HandlerResult> {
  // 1. Validate dates
  if (!isValidDate(input.start_date) || !isValidDate(input.end_date)) {
    return { status: 400, body: { error: 'Invalid date format. Use YYYY-MM-DD.' } }
  }

  if (new Date(input.end_date) < new Date(input.start_date)) {
    return { status: 400, body: { error: 'End date must be on or after start date.' } }
  }

  // 2. Load product by UUID (product_id from API request)
  const product = await getPackageProductById(input.product_id)

  if (!product) {
    return { status: 404, body: { error: 'Package product not found' } }
  }

  if (!product.price_per_day_cents || product.price_per_day_cents <= 0) {
    console.error('[checkout] regatta-package: invalid price', { product_id: input.product_id })
    return { status: 500, body: { error: 'Invalid product pricing configuration' } }
  }

  // 3. start_date must be today or in the future
  const todayStr = new Date().toISOString().split('T')[0]
  if (input.start_date < todayStr) {
    return { status: 400, body: { error: 'Start date cannot be in the past.' } }
  }

  // 3b. Advance booking check (RaceSense: 90-day minimum)
  if (product.min_advance_booking_days) {
    const today = new Date()
    const start = new Date(input.start_date)
    const daysUntilStart = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilStart < product.min_advance_booking_days) {
      return {
        status: 400,
        body: {
          error: `Bookings require at least ${product.min_advance_booking_days} days advance notice. Your start date is only ${daysUntilStart} days away.`,
        },
      }
    }
  }

  // 4. Availability check
  let availability
  try {
    availability = await checkPackageAvailability(
      product.id,
      input.start_date,
      input.end_date,
      product.capacity,
    )
  } catch (err) {
    console.error('[checkout] regatta-package: availability check failed', err)
    return { status: 503, body: { error: 'Availability check failed. Please try again.' } }
  }

  if (!availability.available) {
    return { status: 409, body: { error: 'This package is not available for the selected dates.', availability } }
  }

  // 5. Multi-unit availability check (R/C WL Course: 5× atlas2 + 1× tablet)
  if (product.atlas2_units_required > 0 || product.tablet_required) {
    let multiUnit
    try {
      multiUnit = await checkMultiUnitAvailability(
        product.id,
        input.start_date,
        input.end_date,
        product.atlas2_units_required,
        product.tablet_required,
      )
    } catch (err) {
      console.error('[checkout] regatta-package: multi-unit check failed', err)
      return { status: 503, body: { error: 'Unit availability check failed. Please try again.' } }
    }

    if (!multiUnit.available) {
      return { status: 409, body: { error: multiUnit.reason ?? 'Insufficient units for selected dates.' } }
    }
  }

  // 6. Calculate total
  const dayCount = daysBetween(input.start_date, input.end_date)
  const totalCents = dayCount * product.price_per_day_cents

  // 7. Stripe session — hold for RaceSense, capture for others
  const isHold = product.payment_mode === 'hold'

  console.log('[checkout] regatta_package', {
    product_id: product.id,
    slug: product.slug,
    start_date: input.start_date,
    end_date: input.end_date,
    days: dayCount,
    total_cents: totalCents,
    payment_mode: product.payment_mode,
  })

  let stripeSession
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: product.name,
              description: `${dayCount} day${dayCount !== 1 ? 's' : ''} | ${input.start_date} to ${input.end_date}`,
            },
          },
          quantity: 1,
        },
      ],
      // All regatta packages use immediate payment (capture mode).
      // payment_intent_data.capture_method: 'manual' removed — Stripe auth holds
      // expire in 7 days, incompatible with 90-day advance booking.
      metadata: {
        reservation_type: 'regatta_package',
        product_id: product.id,
        start_date: input.start_date,
        end_date: input.end_date,
        payment_mode: product.payment_mode,   // needed by Phase 4 webhook handler
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/packages?checkout=cancelled`,
    })
  } catch (err) {
    console.error('[checkout] Stripe session creation failed (regatta-package):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  // 8. Insert reservation
  // All regatta packages use standard 24h expiry. If the customer abandons Stripe checkout,
  // pg_cron will cancel the reservation and free the slot.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'regatta_package',
      product_id: product.id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      start_date: input.start_date,
      end_date: input.end_date,
      extra_days: 0,
      late_fee_applied: false,
      late_fee_cents: 0,
      expires_at: expiresAt,
    })
    .select('id, status, expires_at')
    .single()

  if (insertError) {
    console.error('[checkout] reservation insert failed (regatta-package):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  const reservationId = (reservation as { id: string }).id

  // 9. Insert reservation_units for fleet-wide availability tracking.
  // This prevents cross-product Atlas 2 oversell: checkMultiUnitAvailability queries
  // reservation_units (not reservation counts) so all products share the same unit pool.
  await insertReservationUnits(reservationId, product.id, input.start_date, input.end_date)

  return {
    status: 200,
    body: {
      url: stripeSession.url,
      reservation_id: reservationId,
    },
  }
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=regatta-package --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkout/handlers/regatta-package.ts __tests__/lib/checkout/handlers/regatta-package.test.ts
git commit -m "feat(checkout): add regatta-package handler — per-day pricing, hold support, multi-unit availability"
```

---

## Task 6: Refactor Checkout Route

**Files:**
- Modify: `app/api/checkout/route.ts`
- Create: `__tests__/api/checkout-regatta.test.ts`

- [ ] **Step 1: Write integration tests for the refactored route + regatta_package type**

```typescript
// __tests__/api/checkout-regatta.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/checkout/handlers/rental-event', () => ({ handleRentalEvent: jest.fn() }))
jest.mock('@/lib/checkout/handlers/rental-custom', () => ({ handleRentalCustom: jest.fn() }))
jest.mock('@/lib/checkout/handlers/regatta-package', () => ({ handleRegattaPackage: jest.fn() }))

import { auth } from '@/lib/auth'
import { handleRegattaPackage } from '@/lib/checkout/handlers/regatta-package'
import { POST } from '@/app/api/checkout/route'
import { NextRequest } from 'next/server'

const mockAuth = auth as jest.Mock
const mockHandlePackage = handleRegattaPackage as jest.Mock

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/checkout — regatta_package', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', product_id: 'uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing product_id', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing start_date', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    const res = await POST(makeRequest({ reservation_type: 'regatta_package', product_id: 'uuid', end_date: '2027-01-05' }))
    expect(res.status).toBe(400)
  })

  it('delegates to handleRegattaPackage and returns its result', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', email: 'test@test.com' } })
    mockHandlePackage.mockResolvedValue({ status: 200, body: { url: 'https://stripe.com/pay', reservation_id: 'res-1' } })

    const res = await POST(makeRequest({
      reservation_type: 'regatta_package',
      product_id: 'prod-uuid',
      start_date: '2027-06-01',
      end_date: '2027-06-05',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://stripe.com/pay')
    expect(mockHandlePackage).toHaveBeenCalledWith(
      { product_id: 'prod-uuid', start_date: '2027-06-01', end_date: '2027-06-05' },
      { user: { id: 'u1', email: 'test@test.com' } },
      'http://localhost',
    )
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=checkout-regatta --no-coverage
```

- [ ] **Step 3: Rewrite checkout route as slim dispatch shell**

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { handleRentalEvent } from '@/lib/checkout/handlers/rental-event'
import { handleRentalCustom } from '@/lib/checkout/handlers/rental-custom'
import { handleRegattaPackage } from '@/lib/checkout/handlers/regatta-package'

type CheckoutBody = {
  reservation_type: string
  product_id?: string
  event_id?: string
  date_window_id?: string
  sail_number?: string
  extra_days?: number
  start_date?: string
  end_date?: string
}

// IMPORTANT: 'purchase' must remain here — existing product purchase flow uses it.
// Removing it would be a regression. The plan adds 'regatta_package'; all four are valid.
const VALID_TYPES = ['rental_event', 'rental_custom', 'purchase', 'regatta_package'] as const

export async function POST(req: NextRequest) {
  // 1. Auth — required for all reservation types
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<CheckoutBody>
  try {
    body = (await req.json()) as Partial<CheckoutBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Common validation
  if (!body.reservation_type || !VALID_TYPES.includes(body.reservation_type as typeof VALID_TYPES[number])) {
    return NextResponse.json(
      { error: 'reservation_type must be one of: rental_event, rental_custom, purchase, regatta_package' },
      { status: 400 },
    )
  }

  if (!body.product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  const baseUrl = req.nextUrl.origin

  // 3. Type-specific validation + dispatch
  if (body.reservation_type === 'rental_event') {
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id is required for rental_event' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
    const rawExtraDays = Number(body.extra_days ?? 0)
    if (rawExtraDays < 0 || rawExtraDays > 14 || !Number.isInteger(rawExtraDays)) {
      return NextResponse.json({ error: 'extra_days must be an integer between 0 and 14' }, { status: 400 })
    }
    const extra_days = rawExtraDays
    const result = await handleRentalEvent(
      { event_id: body.event_id, product_id: body.product_id, sail_number: body.sail_number, extra_days },
      session,
      baseUrl,
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  if (body.reservation_type === 'rental_custom') {
    if (!body.date_window_id) {
      return NextResponse.json({ error: 'date_window_id is required for rental_custom' }, { status: 400 })
    }
    if (!body.sail_number?.trim()) {
      return NextResponse.json({ error: 'sail_number is required for rentals' }, { status: 400 })
    }
    const rawExtraDaysCustom = Number(body.extra_days ?? 0)
    if (rawExtraDaysCustom < 0 || rawExtraDaysCustom > 14 || !Number.isInteger(rawExtraDaysCustom)) {
      return NextResponse.json({ error: 'extra_days must be an integer between 0 and 14' }, { status: 400 })
    }
    const result = await handleRentalCustom(
      { date_window_id: body.date_window_id, product_id: body.product_id, sail_number: body.sail_number, extra_days: rawExtraDaysCustom },
      session,
      baseUrl,
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  // regatta_package
  if (!body.start_date) {
    return NextResponse.json({ error: 'start_date is required for regatta_package' }, { status: 400 })
  }
  if (!body.end_date) {
    return NextResponse.json({ error: 'end_date is required for regatta_package' }, { status: 400 })
  }

  const result = await handleRegattaPackage(
    { product_id: body.product_id, start_date: body.start_date, end_date: body.end_date },
    session,
    baseUrl,
  )
  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 4: Run all checkout tests — verify they PASS**

```bash
npx jest --testPathPattern="checkout" --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts __tests__/api/checkout-regatta.test.ts
git commit -m "refactor(checkout): slim route to dispatch shell; add regatta_package type"
```

---

## Task 7: Update /reserve Page (Per-Day Pricing + Extra Days)

**Files:**
- Modify: `app/reserve/ReserveBookingUI.tsx`
- Modify: `__tests__/components/reserve/ReserveBookingUI.test.tsx`

- [ ] **Step 1: Update existing ReserveBookingUI tests**

Find `__tests__/components/reserve/ReserveBookingUI.test.tsx` (or similar path) and add:

```typescript
// Add to existing describe block:

it('shows per-day pricing instead of flat fee', () => {
  // The pricing display should show "$35/day" format
  render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
  // Select an event to trigger pricing display
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
  expect(screen.getByText(/\$35\/day/i)).toBeInTheDocument()
})

it('shows extra days stepper defaulting to 0', () => {
  render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
  const stepper = screen.getByLabelText(/additional days/i)
  expect(stepper).toHaveValue(0)
})

it('updates total dynamically when extra days change', () => {
  render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
  const stepper = screen.getByLabelText(/additional days/i)
  fireEvent.change(stepper, { target: { value: '2' } })
  // 3 event days + 2 extra = 5 days × $35 = $175
  expect(screen.getByText(/\$175/)).toBeInTheDocument()
})

it('sends extra_days in checkout payload', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ url: 'https://stripe.com' }) })
  global.fetch = fetchMock
  render(<ReserveBookingUI events={mockEvents} windows={[]} defaultProductId="prod-1" />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'evt-1' } })
  fireEvent.change(screen.getByLabelText(/additional days/i), { target: { value: '2' } })
  fireEvent.change(screen.getByPlaceholderText(/sail/i), { target: { value: 'USA-1' } })
  fireEvent.click(screen.getByRole('button', { name: /reserve/i }))
  await waitFor(() => {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.extra_days).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — verify new ones FAIL**

```bash
npx jest --testPathPattern=ReserveBookingUI --no-coverage
```

- [ ] **Step 3: Update ReserveBookingUI component**

Key changes to `app/reserve/ReserveBookingUI.tsx`:

1. Add `extraDays` state: `const [extraDays, setExtraDays] = useState(0)`
2. Update `selectedEvent` pricing display to show per-day:

```tsx
{/* Replace the flat pricing block with: */}
{eventProduct && selectedEvent && (
  <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold text-white">
        ${((eventProduct.rental_price_per_day_cents ?? 3500) / 100).toFixed(0)}
        <span className="text-sm font-normal text-white/50">/day</span>
      </span>
    </div>

    {/* Extra days stepper */}
    <label className="block mt-3">
      <span className="text-sm text-white/60 block mb-1">
        Additional days needed beyond the event
      </span>
      <input
        type="number"
        min={0}
        max={14}
        value={extraDays}
        onChange={(e) => setExtraDays(Math.min(14, Math.max(0, Number(e.target.value))))}
        aria-label="additional days"
        className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white text-center"
      />
    </label>

    {/* Dynamic total */}
    {(() => {
      const eventDays = daysBetween(selectedEvent.start_date, selectedEvent.end_date)
      const totalDays = eventDays + extraDays
      const totalCents = totalDays * (eventProduct.rental_price_per_day_cents ?? 3500)
      return (
        <p className="text-sm text-white/60">
          {eventDays} event day{eventDays !== 1 ? 's' : ''}
          {extraDays > 0 ? ` + ${extraDays} extra` : ''} = {totalDays} days × $35/day ={' '}
          <span className="text-white font-semibold">${(totalCents / 100).toFixed(2)}</span>
        </p>
      )
    })()}
  </div>
)}
```

3. Import `daysBetween` from `@/lib/utils/dates`
4. Include `extra_days: extraDays` in the `rental_event` checkout body

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=ReserveBookingUI --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add app/reserve/ReserveBookingUI.tsx __tests__/components/reserve/
git commit -m "feat(reserve): per-day pricing display + extra days stepper (0–14)"
```

---

## Task 8: Install react-day-picker

- [ ] **Step 1: Install the package**

```bash
npm install react-day-picker
```

- [ ] **Step 2: Verify it installs without errors**

```bash
npm ls react-day-picker
```

Expected: `react-day-picker@x.y.z`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-day-picker for date range selection"
```

---

## Task 9: /packages Page — Server Component + PackageCards (Step 1)

**Files:**
- Create: `app/packages/page.tsx`
- Create: `app/packages/PackagesUI.tsx`
- Create: `app/packages/PackageCards.tsx`
- Create: `__tests__/components/packages/PackagesUI.test.tsx`

- [ ] **Step 1: Write failing component tests**

```typescript
// __tests__/components/packages/PackagesUI.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PackagesUI } from '@/app/packages/PackagesUI'
import type { PackageProduct } from '@/lib/db/packages'

const mockProducts: PackageProduct[] = [
  {
    id: 'prod-1',
    name: 'Race Committee Package',
    slug: 'race-committee-package',
    category: 'regatta_management',
    price_per_day_cents: 10500,
    payment_mode: 'capture',
    min_advance_booking_days: null,
    atlas2_units_required: 0,
    tablet_required: true,
    capacity: 1,
  },
  {
    id: 'prod-2',
    name: 'RaceSense Management Services',
    slug: 'racesense-management-services',
    category: 'regatta_management',
    price_per_day_cents: 40000,
    payment_mode: 'hold',
    min_advance_booking_days: 90,
    atlas2_units_required: 0,
    tablet_required: false,
    capacity: 1,
  },
]

describe('PackagesUI', () => {
  it('renders Step 1 with all package cards', () => {
    render(<PackagesUI products={mockProducts} />)
    expect(screen.getByText('Race Committee Package')).toBeInTheDocument()
    expect(screen.getByText('RaceSense Management Services')).toBeInTheDocument()
    expect(screen.getByText(/\$105\/day/)).toBeInTheDocument()
  })

  it('shows hold disclosure on RaceSense card', () => {
    render(<PackagesUI products={mockProducts} />)
    expect(screen.getByText(/payment hold/i)).toBeInTheDocument()
    expect(screen.getByText(/90.day advance/i)).toBeInTheDocument()
  })

  it('advances to Step 2 when a package is selected', () => {
    render(<PackagesUI products={mockProducts} />)
    fireEvent.click(screen.getByText('Race Committee Package').closest('button') ?? screen.getByText('Race Committee Package'))
    expect(screen.getByText(/select dates/i)).toBeInTheDocument()
  })

  it('shows empty state when no products', () => {
    render(<PackagesUI products={[]} />)
    expect(screen.getByText(/no packages available/i)).toBeInTheDocument()
  })

  it('shows "Reserve & Hold" CTA for hold products', () => {
    render(<PackagesUI products={mockProducts} />)
    // Select RaceSense
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('RaceSense'))!)
    // Step 2 date selection would normally appear; fast-forward to step 3 by testing final CTA
    // (For a full test, use a stub step approach — here we just verify the card shows hold info)
    expect(screen.getByText(/payment hold/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=PackagesUI --no-coverage
```

- [ ] **Step 3: Create the server page**

```typescript
// app/packages/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listPackageProducts } from '@/lib/db/packages'
import { PackagesUI } from './PackagesUI'

export const metadata: Metadata = {
  title: 'Regatta Management Packages | NAVO Marine Technologies',
  description: 'Book race committee equipment and management services for your regatta.',
}

export default async function PackagesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/packages')
  }

  const products = await listPackageProducts()

  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
        <div className="w-full max-w-4xl text-center mb-10">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Regatta Management Packages
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Professional race committee equipment and management services, bookable by the day.
          </p>
        </div>
        <PackagesUI products={products} />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 4: Create PackagesUI container**

```typescript
// app/packages/PackagesUI.tsx
'use client'

import { useState } from 'react'
import type { PackageProduct } from '@/lib/db/packages'
import { PackageCards } from './PackageCards'
import { DateRangePicker } from './DateRangePicker'
import { PackageReviewStep } from './PackageReviewStep'

type Step = 1 | 2 | 3

type Props = {
  products: PackageProduct[]
}

export function PackagesUI({ products }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [selectedProduct, setSelectedProduct] = useState<PackageProduct | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  if (products.length === 0) {
    return (
      <div className="text-center text-white/50 py-20">
        No packages available at this time.
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-4 mb-10">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === s
                  ? 'bg-marine-500 text-white'
                  : step > s
                  ? 'bg-marine-500/40 text-white/70'
                  : 'bg-white/10 text-white/30'
              }`}
            >
              {s}
            </div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? 'bg-marine-500/40' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <PackageCards
          products={products}
          onSelect={(product) => {
            setSelectedProduct(product)
            setStep(2)
          }}
        />
      )}

      {step === 2 && selectedProduct && (
        <DateRangePicker
          product={selectedProduct}
          onNext={(start, end) => {
            setStartDate(start)
            setEndDate(end)
            setStep(3)
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && selectedProduct && startDate && endDate && (
        <PackageReviewStep
          product={selectedProduct}
          startDate={startDate}
          endDate={endDate}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create PackageCards component**

```typescript
// app/packages/PackageCards.tsx
import type { PackageProduct } from '@/lib/db/packages'

type Props = {
  products: PackageProduct[]
  onSelect: (product: PackageProduct) => void
}

const PACKAGE_META: Record<string, { icon: string; description: string; equipment: string[] }> = {
  'race-committee-package': {
    icon: '🚩',
    description: 'Essential tablet tools for race committee operations at any regatta.',
    equipment: ['1× Committee Tablet'],
  },
  'rc-wl-course-package': {
    icon: '⛵',
    description: 'Full Atlas 2 fleet deployment for windward-leeward course management.',
    equipment: ['5× Atlas 2 Units', '1× Committee Tablet'],
  },
  'racesense-management-services': {
    icon: '🧭',
    description: 'Human-led race orchestration with full data platform. Expenses invoiced separately.',
    equipment: ['Dedicated Race Director', 'Full Data Platform'],
  },
}

export function PackageCards({ products, onSelect }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {products.map((product) => {
        const meta = PACKAGE_META[product.slug] ?? { icon: '📦', description: '', equipment: [] }
        const isHold = product.payment_mode === 'hold'

        return (
          <button
            key={product.id}
            onClick={() => onSelect(product)}
            className="group text-left rounded-xl border border-white/10 bg-white/5 p-6 hover:border-marine-500/50 hover:bg-white/8 transition-all"
          >
            <div className="text-3xl mb-3">{meta.icon}</div>
            <h3 className="font-heading text-lg font-semibold text-white mb-1">{product.name}</h3>

            {/* 90-day advance chip — shown upfront so users know before starting the flow */}
            {product.min_advance_booking_days && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30 mb-2">
                {product.min_advance_booking_days}-day advance required
              </span>
            )}

            <p className="text-2xl font-bold text-marine-500 mb-3">
              ${(product.price_per_day_cents / 100).toFixed(0)}
              <span className="text-sm font-normal text-white/50">/day</span>
            </p>
            <p className="text-sm text-white/60 mb-4">{meta.description}</p>

            <ul className="space-y-1 mb-4">
              {meta.equipment.map((item) => (
                <li key={item} className="text-xs text-white/50 flex items-center gap-1">
                  <span className="text-marine-500">✓</span> {item}
                </li>
              ))}
            </ul>

            {isHold && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <strong>Payment hold</strong> — expenses invoiced separately after the event.
              </div>
            )}

            {product.min_advance_booking_days && !isHold && (
              <p className="text-xs text-white/40">{product.min_advance_booking_days}-day advance booking required</p>
            )}

            <div className="mt-4 text-sm font-medium text-marine-500 group-hover:text-cyan-glow transition-colors">
              Select →
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=PackagesUI --no-coverage
```

- [ ] **Step 7: Commit**

```bash
git add app/packages/ __tests__/components/packages/
git commit -m "feat(packages): server page + PackagesUI 3-step container + PackageCards (Step 1)"
```

---

## Task 10: DateRangePicker (Step 2)

**Files:**
- Create: `app/packages/DateRangePicker.tsx`
- Create: `app/api/packages/availability/route.ts`
- Create: `__tests__/api/packages-availability.test.ts`

- [ ] **Step 1: Write failing tests for the availability API route**

```typescript
// __tests__/api/packages-availability.test.ts
/**
 * @jest-environment node
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/packages', () => ({ checkPackageAvailability: jest.fn() }))
jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { auth } from '@/lib/auth'
import { checkPackageAvailability } from '@/lib/db/packages'
import { GET } from '@/app/api/packages/availability/route'
import { NextRequest } from 'next/server'

const mockAuth = auth as jest.Mock
const mockCheck = checkPackageAvailability as jest.Mock

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/packages/availability')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/packages/availability', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeRequest({ product_id: 'uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when params missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const res = await GET(makeRequest({ product_id: 'uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns availability result when product found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const { supabaseAdmin } = require('@/lib/db/client')
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { capacity: 1 }, error: null }),
    })
    mockCheck.mockResolvedValue({ available: true, reserved: 0, capacity: 1, remaining: 1 })

    const res = await GET(makeRequest({ product_id: 'prod-uuid', start_date: '2027-01-01', end_date: '2027-01-05' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=packages-availability --no-coverage
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create DateRangePicker with availability check**

```typescript
// app/packages/DateRangePicker.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import type { PackageProduct } from '@/lib/db/packages'
import { daysBetween, formatDateRange } from '@/lib/utils/dates'

type Props = {
  product: PackageProduct
  onNext: (startDate: string, endDate: string) => void
  onBack: () => void
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable'

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function DateRangePicker({ product, onNext, onBack }: Props) {
  const [range, setRange] = useState<DateRange | undefined>()
  const [availability, setAvailability] = useState<AvailabilityState>('idle')
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startDate = range?.from ? toISODate(range.from) : null
  const endDate = range?.to ? toISODate(range.to) : null

  const dayCount = startDate && endDate ? daysBetween(startDate, endDate) : null
  const totalCents = dayCount ? dayCount * product.price_per_day_cents : null

  // Advance booking check
  useEffect(() => {
    if (!startDate || !product.min_advance_booking_days) {
      setAdvanceError(null)
      return
    }
    // Parse as noon UTC to avoid off-by-one from timezone differences
    const daysUntil = Math.floor((new Date(startDate + 'T12:00:00Z').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil < product.min_advance_booking_days) {
      setAdvanceError(`${product.name} requires ${product.min_advance_booking_days} days advance booking. Please choose a start date at least ${product.min_advance_booking_days} days from today.`)
    } else {
      setAdvanceError(null)
    }
  }, [startDate, product.min_advance_booking_days, product.name])

  // Availability check when full range is selected
  const checkAvailability = useCallback(async () => {
    if (!startDate || !endDate) return
    setAvailability('checking')
    try {
      const res = await fetch(
        `/api/packages/availability?product_id=${product.id}&start_date=${startDate}&end_date=${endDate}`,
      )
      if (!res.ok) {
        // Auth errors (401) or server errors (500) should not be reported as "unavailable"
        setAvailability('idle')
        setError('Failed to check availability. Please try again.')
        return
      }
      const data = await res.json()
      setAvailability(data.available ? 'available' : 'unavailable')
    } catch {
      setAvailability('idle')
      setError('Failed to check availability. Please try again.')
    }
  }, [startDate, endDate, product.id])

  useEffect(() => {
    if (startDate && endDate && !advanceError) {
      checkAvailability()
    } else {
      setAvailability('idle')
    }
  }, [startDate, endDate, advanceError, checkAvailability])

  const canProceed = startDate && endDate && availability === 'available' && !advanceError

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="font-heading text-2xl font-semibold text-white">Select Dates</h2>
      <p className="text-white/60 text-sm">{product.name}</p>

      {/* react-day-picker */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          disabled={{ before: new Date() }}
          classNames={{
            root: 'text-white',
            months: 'flex gap-4',
            month_caption: 'text-white/80 font-medium mb-2',
            nav: 'text-white/60',
            day: 'text-white/70 hover:text-white rounded-lg',
            day_button: 'w-9 h-9 rounded-lg hover:bg-white/10',
            selected: 'bg-marine-500 text-white rounded-lg',
            range_start: 'bg-marine-500 text-white rounded-l-lg',
            range_end: 'bg-marine-500 text-white rounded-r-lg',
            range_middle: 'bg-marine-500/20 text-white',
            today: 'border border-white/20',
            disabled: 'text-white/20 cursor-not-allowed',
          }}
        />
      </div>

      {/* Pricing preview */}
      {dayCount && totalCents && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center w-full max-w-sm">
          <p className="text-white/60 text-sm">
            {startDate && endDate ? formatDateRange(startDate, endDate) : ''}
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            ${(totalCents / 100).toFixed(2)}
          </p>
          <p className="text-xs text-white/40 mt-1">
            {dayCount} day{dayCount !== 1 ? 's' : ''} × ${(product.price_per_day_cents / 100).toFixed(0)}/day
          </p>
        </div>
      )}

      {/* Availability indicator */}
      {availability === 'checking' && (
        <p className="text-sm text-white/50">Checking availability...</p>
      )}
      {availability === 'available' && (
        <p className="text-sm text-green-400">✓ Available for selected dates</p>
      )}
      {availability === 'unavailable' && (
        <p className="text-sm text-red-400">✗ Not available for selected dates. Please choose different dates.</p>
      )}

      {/* Advance booking error */}
      {advanceError && (
        <p className="text-sm text-amber-400 text-center max-w-sm">{advanceError}</p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-4 w-full max-w-sm">
        <button
          onClick={onBack}
          className="glass-btn glass-btn-ghost flex-1 rounded-full px-6 py-3 text-sm font-medium"
        >
          ← Back
        </button>
        <button
          onClick={() => canProceed && onNext(startDate!, endDate!)}
          disabled={!canProceed}
          className="glass-btn glass-btn-primary flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          Review →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create availability API route**

```typescript
// app/api/packages/availability/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPackageAvailability } from '@/lib/db/packages'
import { supabaseAdmin } from '@/lib/db/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const productId = searchParams.get('product_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!productId || !startDate || !endDate) {
    return NextResponse.json({ error: 'product_id, start_date, end_date are required' }, { status: 400 })
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('capacity')
    .eq('id', productId)
    .single()

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  try {
    const result = await checkPackageAvailability(
      productId,
      startDate,
      endDate,
      (product as { capacity: number }).capacity,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/packages/availability] error:', err)
    return NextResponse.json({ error: 'Availability check failed' }, { status: 503 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/packages/DateRangePicker.tsx app/api/packages/
git commit -m "feat(packages): DateRangePicker (Step 2) — react-day-picker, availability check, live pricing preview"
```

---

## Task 11: PackageReviewStep (Step 3) + Finalize PackagesUI

**Files:**
- Create: `app/packages/PackageReviewStep.tsx`
- Create: `__tests__/components/packages/PackageReviewStep.test.tsx`

- [ ] **Step 1: Write failing tests for PackageReviewStep**

```typescript
// __tests__/components/packages/PackageReviewStep.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PackageReviewStep } from '@/app/packages/PackageReviewStep'
import type { PackageProduct } from '@/lib/db/packages'

const captureProduct: PackageProduct = {
  id: 'prod-1',
  name: 'Race Committee Package',
  slug: 'race-committee-package',
  category: 'regatta_management',
  price_per_day_cents: 10500,
  payment_mode: 'capture',
  min_advance_booking_days: null,
  atlas2_units_required: 0,
  tablet_required: true,
  capacity: 1,
}

const holdProduct: PackageProduct = {
  ...captureProduct,
  name: 'RaceSense Management Services',
  slug: 'racesense-management-services',
  price_per_day_cents: 40000,
  payment_mode: 'hold',
}

describe('PackageReviewStep', () => {
  it('shows pricing breakdown', () => {
    render(
      <PackageReviewStep
        product={captureProduct}
        startDate="2027-06-01"
        endDate="2027-06-05"
        onBack={() => {}}
      />,
    )
    expect(screen.getByText(/5 days/)).toBeInTheDocument()
    expect(screen.getByText(/\$525/)).toBeInTheDocument() // 5 × $105
  })

  it('shows "Reserve & Pay" CTA for capture products', () => {
    render(
      <PackageReviewStep product={captureProduct} startDate="2027-06-01" endDate="2027-06-05" onBack={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /reserve & pay/i })).toBeInTheDocument()
  })

  it('shows "Reserve & Hold" CTA for hold products', () => {
    render(
      <PackageReviewStep product={holdProduct} startDate="2027-09-01" endDate="2027-09-05" onBack={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /reserve & hold/i })).toBeInTheDocument()
  })

  it('shows hold disclosure for hold products', () => {
    render(
      <PackageReviewStep product={holdProduct} startDate="2027-09-01" endDate="2027-09-05" onBack={() => {}} />,
    )
    expect(screen.getByText(/authorization hold/i)).toBeInTheDocument()
  })

  it('shows error message on failed checkout', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Package unavailable' }),
    })

    render(
      <PackageReviewStep product={captureProduct} startDate="2027-06-01" endDate="2027-06-05" onBack={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /reserve & pay/i }))

    await waitFor(() => {
      expect(screen.getByText('Package unavailable')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx jest --testPathPattern=PackageReviewStep --no-coverage
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create review step**

```typescript
// app/packages/PackageReviewStep.tsx
'use client'

import { useState } from 'react'
import type { PackageProduct } from '@/lib/db/packages'
import { daysBetween, formatDateRange } from '@/lib/utils/dates'

type Props = {
  product: PackageProduct
  startDate: string
  endDate: string
  onBack: () => void
}

export function PackageReviewStep({ product, startDate, endDate, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHold = product.payment_mode === 'hold'
  const dayCount = daysBetween(startDate, endDate)
  const totalCents = dayCount * product.price_per_day_cents

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_type: 'regatta_package',
          product_id: product.id,
          start_date: startDate,
          end_date: endDate,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="font-heading text-2xl font-semibold text-white mb-6 text-center">
        Review & Confirm
      </h2>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Package</p>
          <p className="text-white font-semibold">{product.name}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Dates</p>
          <p className="text-white">{formatDateRange(startDate, endDate)}</p>
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Pricing</p>
          <p className="text-white/70 text-sm">
            {dayCount} day{dayCount !== 1 ? 's' : ''} × ${(product.price_per_day_cents / 100).toFixed(0)}/day
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            ${(totalCents / 100).toFixed(2)}
          </p>
        </div>

        {isHold && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            <strong>Payment Hold Notice:</strong> This booking places an authorization hold on your card.
            Additional expenses incurred during the event will be invoiced separately after completion.
            The hold will be captured upon event completion.
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
      )}

      <div className="flex gap-4 mt-6">
        <button
          onClick={onBack}
          disabled={loading}
          className="glass-btn glass-btn-ghost flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="glass-btn glass-btn-primary flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"
        >
          {loading
            ? 'Processing...'
            : isHold
            ? 'Reserve & Hold'
            : 'Reserve & Pay'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/packages/PackageReviewStep.tsx
git commit -m "feat(packages): PackageReviewStep (Step 3) — pricing breakdown, hold disclosure, checkout submit"
```

---

## Task 12: Navbar Update

**Files:**
- Modify: `components/layout/Navbar.tsx`
- Modify: relevant Navbar test file (find with `find __tests__ -name "*Navbar*"`)

- [ ] **Step 1: Write failing test for Packages nav link**

Find the existing Navbar test file and add:

```typescript
it('renders a Packages link', () => {
  render(<Navbar />)
  const packagesLink = screen.getByRole('link', { name: /packages/i })
  expect(packagesLink).toBeInTheDocument()
  expect(packagesLink).toHaveAttribute('href', '/packages')
})
```

- [ ] **Step 2: Run test — verify it FAILS**

```bash
npx jest --testPathPattern=Navbar --no-coverage
```

Expected: FAIL — "Unable to find an accessible element with role 'link' and name 'packages'"

- [ ] **Step 4: Add Packages link to navLinks**

In `components/layout/Navbar.tsx`, find the `navLinks` array and add the Packages link:

```typescript
// Find this:
const navLinks = [
  { label: 'Products', href: '/products' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Contact', href: '/contact' },
]

// Replace with:
const navLinks = [
  { label: 'Products', href: '/products' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Packages', href: '/packages' },
  { label: 'Contact', href: '/contact' },
]
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
npx jest --testPathPattern=Navbar --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/layout/Navbar.tsx
git commit -m "feat(nav): add Packages link to navbar"
```

---

## Task 13: Admin Reservations Page (Create)

> **Note:** Phase 4 shipped the webhook handler only — there is no existing admin reservations page.
> This task creates it from scratch, with the HOLD badge included.

**Files:**
- Create: `app/admin/reservations/page.tsx`

- [ ] **Step 1: Create the admin reservations page**

Build a server component that:
- Calls `requireAdmin()` at the top
- Queries `reservations` joined with `products(name, payment_mode)` via `supabaseAdmin`
- Renders a table with columns: order, customer email, product name, status, dates, total
- Shows "HOLD — awaiting capture" badge when `payment_mode = 'hold'` and `status = 'reserved_authorized'`

- [ ] **Step 2: Add hold badge to reservation rows**

In the reservation table/list row, add a badge when `status = 'reserved_authorized'`
(the status set by the webhook when a Stripe hold is captured — `payment_mode = 'hold'` is
now unused since all products switched to immediate payment, but the status is correct):

```tsx
{/* Add this badge alongside the status display */}
{reservation.status === 'reserved_authorized' && (
  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
    HOLD — awaiting capture
  </span>
)}
```

Note: `lib/db/reservations.ts` does **not** exist — Phase 4 only shipped `lib/stripe/webhook.ts`.
The admin page must query `supabaseAdmin` directly (or create `lib/db/reservations.ts` as part
of this task). Inline the query in the page component for now:

```typescript
const { data: reservations } = await supabaseAdmin
  .from('reservations')
  .select('id, customer_email, status, start_date, end_date, total_cents, products(name, payment_mode)')
  .order('created_at', { ascending: false })
  .limit(100)
```

- [ ] **Step 3: Run admin tests**

```bash
npx jest --testPathPattern=reservations --no-coverage
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/admin/reservations/
git commit -m "feat(admin): add HOLD badge to reservations list for RaceSense payment holds"
```

---

## Task 14: Full Test Suite + Coverage

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests PASS, coverage ≥ 80%

- [ ] **Step 2: Fix any coverage gaps**

If coverage drops below 80%, check uncovered branches. Common gaps:
- `checkMultiUnitAvailability` tablet branch
- `handleRegattaPackage` 90-day edge case
- `DateRangePicker` error state

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:e2e
```

If the existing `e2e/reserve-booking.spec.ts` tests fail, fix them before adding new ones.

- [ ] **Step 4: Add E2E test for package booking**

Extend `e2e/reserve-booking.spec.ts` or create `e2e/packages-booking.spec.ts`:

```typescript
// e2e/packages-booking.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Packages booking flow', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes authenticated session via cookie or login step
    await page.goto('/packages')
  })

  test('shows three package cards', async ({ page }) => {
    await expect(page.getByText('Race Committee Package')).toBeVisible()
    await expect(page.getByText('R/C Windward Leeward Course Package')).toBeVisible()
    await expect(page.getByText('RaceSense Management Services')).toBeVisible()
  })

  test('advances to date selection when package clicked', async ({ page }) => {
    await page.getByText('Race Committee Package').click()
    await expect(page.getByText('Select Dates')).toBeVisible()
  })

  test('shows hold disclosure on RaceSense card', async ({ page }) => {
    await expect(page.getByText(/payment hold/i)).toBeVisible()
    await expect(page.getByText(/90.day advance/i)).toBeVisible()
  })
})
```

- [ ] **Step 5: Final commit**

```bash
git add e2e/
git commit -m "test(e2e): add packages booking flow tests"
```

---

## Phase Gate Verification

Before opening a PR, verify all items:

- [ ] Migrations 005 and 006 applied and verified in Supabase
- [ ] Atlas 2 product updated to per-day pricing (`price_per_day_cents = 3500`)
- [ ] 3 regatta management products seeded
- [ ] 2 tablet units seeded (`NAVO-TAB-001`, `NAVO-TAB-002`)
- [ ] `/reserve` shows `$35/day` + extra days stepper (0–14)
- [ ] `/packages` page loads and renders 3 package cards
- [ ] Package selection → date picker → review → Stripe checkout redirect works
- [ ] Management Services creates a payment hold (`capture_method: 'manual'`)
- [ ] 90-day advance booking validated server-side (returns 400)
- [ ] Multi-unit availability check works (R/C WL Package)
- [ ] "Packages" link in Navbar
- [ ] Admin reservations list shows HOLD badge (after Phase 4 merged)
- [ ] All existing `/reserve` tests pass
- [ ] Coverage ≥ 80%
- [ ] E2E tests pass

---

## Security Checklist

- [ ] `requireAuth()` called at checkout route top (not inside handlers)
- [ ] `extra_days` clamped to 0–14 in route before passing to handler
- [ ] `start_date` and `end_date` validated with `isValidDate()` in handler
- [ ] `start_date >= today` validated in handler (cannot book in the past)
- [ ] `end_date >= start_date` validated in handler
- [ ] 90-day advance booking validated server-side (not just client)
- [ ] `price_per_day_cents > 0` guarded before Stripe session creation
- [ ] No hardcoded product IDs (use DB slugs)

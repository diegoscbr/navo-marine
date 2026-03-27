# Purchase Checkout + Multi-Unit Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the "Checkout Coming Soon" button on the products page (purchase checkout) and fix Bug #3 so admin can assign both a tablet and an atlas2 unit to package reservations.

**Architecture:** Two independent features. (1) Purchase checkout: new `lib/checkout/handlers/purchase.ts` handler, minimal changes to checkout API route and `ProductPurchasePanel`. (2) Multi-unit assignment: DB migration adds `unit_id` to `reservation_units`, new POST API route, new `PackageUnitAssignment` client component, conditional rendering in admin page by `reservation_type`. Webhook is type-agnostic and works for purchases unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (supabaseAdmin), Stripe (test mode), Tailwind CSS v4, Jest + React Testing Library.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `TODOS.md` | Modify | Add Bug #3 as P1 |
| `docs/context/current-state.md` | Modify | Record Bug #3 as open blocker |
| `supabase/migrations/007_reservation_units_unit_id.sql` | Create | Add `unit_id` nullable FK to `reservation_units` |
| `app/api/admin/reservations/[id]/assign-units/route.ts` | Create | POST — upsert `reservation_units` rows with `unit_id` |
| `app/admin/reservations/PackageUnitAssignment.tsx` | Create | Client component: tablet + atlas2 dropdowns for packages |
| `app/admin/reservations/page.tsx` | Modify | Join products for unit requirements; conditional UI by `reservation_type` |
| `__tests__/api/admin/assign-units.test.ts` | Create | Unit tests for assign-units route |
| `__tests__/components/admin/PackageUnitAssignment.test.tsx` | Create | Component tests |
| `lib/checkout/handlers/purchase.ts` | Create | Purchase checkout handler (Stripe + DB insert) |
| `app/api/checkout/route.ts` | Modify | Add `quantity` + `warranty_selected` to body; wire `handlePurchase` |
| `app/products/[slug]/ProductPurchasePanel.tsx` | Modify | Make button interactive; add loading/error state |
| `__tests__/lib/checkout/handlers/purchase.test.ts` | Create | Unit tests for purchase handler |

---

## Task 1: Update TODOS.md and current-state.md

**Files:**
- Modify: `TODOS.md`
- Modify: `docs/context/current-state.md`

- [ ] **Step 1: Add Bug #3 to TODOS.md as P1**

Add this entry under `## P1 — Critical`, BEFORE the Track B items:

```markdown
### [P1] Multi-unit assignment for package reservations (Bug #3)
**What:** Add `unit_id UUID REFERENCES units(id) ON DELETE SET NULL` to `reservation_units`. New POST `/api/admin/reservations/[id]/assign-units` endpoint. New `PackageUnitAssignment` component replacing the single dropdown for `regatta_package` reservation rows. Admin can assign tablet + atlas2 unit per package booking.
**Why:** Race Committee packages need 1 tablet + up to 5 Atlas 2 units. Win-Win and RaceSense need 1 tablet. Currently `reservations.unit_id` (single FK) can only hold one physical unit, so admin has no way to record which devices are deployed for a package. This is a launch blocker — without it, fleet tracking is incomplete.
**Expected behavior by type:**
- `regatta_package`: show tablet dropdown (if `tablet_required`) + atlas2 dropdown (if `atlas2_units_required > 0`)
- `rental_event`, `rental_custom`, `purchase`: keep existing single `AssignUnitDropdown` → `reservations.unit_id`
**How to apply:** See plan `docs/superpowers/plans/2026-03-23-purchase-and-multi-unit-assignment.md` Task 2.
**Effort:** M (human: ~4h) → ~20 min CC | **Priority:** P1 | **Blocked by:** nothing
```

- [ ] **Step 2: Update current-state.md**

Add Bug #3 to the "What's NOT Implemented Yet" table:

```markdown
| 3 | **Multi-unit assignment (Bug #3)** | 🔴 P1 — Track B Blocker | Package reservations can only hold 1 unit (`reservations.unit_id`). Need `unit_id` FK on `reservation_units` + per-role admin UI. See plan 2026-03-23-purchase-and-multi-unit-assignment.md |
```

- [ ] **Step 3: Commit**

```bash
git add TODOS.md docs/context/current-state.md
git commit -m "docs: add Bug #3 multi-unit assignment as P1 blocker in TODOS + current-state"
```

---

## Task 2: Multi-Unit Assignment — Schema + API + UI

### Key context
- `reservation_units` already exists with `(reservation_id, unit_type, quantity)` — no `unit_id` FK yet
- `reservations` has `unit_id` FK (single) — keep this for individual rental types
- `products` table has `tablet_required BOOLEAN` and `atlas2_units_required INT`
- For packages: show per-role dropdowns → write to `reservation_units`
- For individual reservations: keep existing `AssignUnitDropdown` → `reservations.unit_id`

**Files:**
- Create: `supabase/migrations/007_reservation_units_unit_id.sql`
- Create: `app/api/admin/reservations/[id]/assign-units/route.ts`
- Create: `app/admin/reservations/PackageUnitAssignment.tsx`
- Modify: `app/admin/reservations/page.tsx`
- Create: `__tests__/api/admin/assign-units.test.ts`
- Create: `__tests__/components/admin/PackageUnitAssignment.test.tsx`

- [ ] **Step 1: Write the failing tests for assign-units route**

Create `__tests__/api/admin/assign-units.test.ts`:

```typescript
import { POST } from '@/app/api/admin/reservations/[id]/assign-units/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth-guard', () => ({
  requireAdmin: jest.fn(),
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

import { requireAdmin } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/reservations/res-1/assign-units', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

it('returns 403 when not admin', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: false })
  const res = await POST(makeRequest({ assignments: [] }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(403)
})

it('returns 400 when assignments is not an array', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })
  const res = await POST(makeRequest({ assignments: 'bad' }), { params: Promise.resolve({ id: 'res-1' }) })
  expect(res.status).toBe(400)
})

it('deletes existing rows and inserts new ones', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })

  const mockDelete = { error: null }
  const mockInsert = { error: null }
  ;(supabaseAdmin.from as jest.Mock).mockImplementation(() => ({
    delete: () => ({ eq: () => mockDelete }),
    insert: () => mockInsert,
  }))

  const res = await POST(
    makeRequest({ assignments: [{ unit_type: 'tablet', unit_id: 'u-1' }] }),
    { params: Promise.resolve({ id: 'res-1' }) },
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
})

it('skips insert when all assignments have null unit_id', async () => {
  ;(requireAdmin as jest.Mock).mockResolvedValue({ ok: true, user: {} })

  const mockDelete = { error: null }
  ;(supabaseAdmin.from as jest.Mock).mockImplementation(() => ({
    delete: () => ({ eq: () => mockDelete }),
  }))

  const res = await POST(
    makeRequest({ assignments: [{ unit_type: 'tablet', unit_id: null }] }),
    { params: Promise.resolve({ id: 'res-1' }) },
  )
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest "__tests__/api/admin/assign-units" --no-coverage
```

Expected: FAIL (module not found)

- [ ] **Step 3: Apply DB migration**

Apply via Supabase MCP tool:

```sql
-- 007_reservation_units_unit_id.sql
ALTER TABLE reservation_units
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_units_unit_id
  ON reservation_units(unit_id)
  WHERE unit_id IS NOT NULL;
```

Use `mcp__supabase__apply_migration` with name `007_reservation_units_unit_id` and the SQL above.

- [ ] **Step 4: Create the assign-units route**

Create `app/api/admin/reservations/[id]/assign-units/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-guard'
import { supabaseAdmin } from '@/lib/db/client'

type Assignment = {
  unit_type: 'tablet' | 'atlas2'
  unit_id: string | null
}

type AssignUnitsBody = {
  assignments: Assignment[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireAdmin()
  if (!adminResult.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: reservationId } = await params

  let body: AssignUnitsBody
  try {
    body = (await req.json()) as AssignUnitsBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.assignments)) {
    return NextResponse.json({ error: 'assignments must be an array' }, { status: 400 })
  }

  // Delete existing reservation_units rows for this reservation
  const { error: deleteError } = await supabaseAdmin
    .from('reservation_units')
    .delete()
    .eq('reservation_id', reservationId)

  if (deleteError) {
    console.error('assign-units delete failed:', deleteError)
    return NextResponse.json({ error: 'Failed to clear existing assignments' }, { status: 500 })
  }

  // Insert only non-null assignments
  const toInsert = body.assignments
    .filter((a) => a.unit_id !== null)
    .map((a) => ({
      reservation_id: reservationId,
      unit_type: a.unit_type,
      unit_id: a.unit_id,
      quantity: 1,
    }))

  if (toInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('reservation_units')
      .insert(toInsert)

    if (insertError) {
      console.error('assign-units insert failed:', insertError)
      return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx jest "__tests__/api/admin/assign-units" --no-coverage
```

Expected: PASS (4/4)

- [ ] **Step 6: Write the failing tests for PackageUnitAssignment**

Create `__tests__/components/admin/PackageUnitAssignment.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackageUnitAssignment } from '@/app/admin/reservations/PackageUnitAssignment'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const tabletUnits = [{ id: 't1', navo_number: 'NAVO-T01', unit_type: 'tablet' }]
const atlas2Units = [{ id: 'a1', navo_number: 'NAVO-001', unit_type: 'atlas2' }]

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn()
})

it('renders tablet and atlas2 dropdowns', () => {
  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={atlas2Units}
      currentAssignments={[]}
    />,
  )
  expect(screen.getByText(/tablet/i)).toBeInTheDocument()
  expect(screen.getByText(/atlas 2/i)).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'NAVO-T01' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'NAVO-001' })).toBeInTheDocument()
})

it('calls POST assign-units and refreshes on selection', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={atlas2Units}
      currentAssignments={[]}
    />,
  )

  const selects = screen.getAllByRole('combobox')
  await user.selectOptions(selects[0], 't1')

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/reservations/res-1/assign-units',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

it('shows error message on API failure', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'fail' }) })

  render(
    <PackageUnitAssignment
      reservationId="res-1"
      tabletUnits={tabletUnits}
      atlas2Units={[]}
      currentAssignments={[]}
    />,
  )

  await user.selectOptions(screen.getByRole('combobox'), 't1')
  await waitFor(() => {
    expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run component tests — verify they fail**

```bash
npx jest "__tests__/components/admin/PackageUnitAssignment" --no-coverage
```

Expected: FAIL (module not found)

- [ ] **Step 8: Create PackageUnitAssignment component**

Create `app/admin/reservations/PackageUnitAssignment.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Unit = { id: string; navo_number: string; unit_type: string }
type Assignment = { unit_type: 'tablet' | 'atlas2'; unit_id: string | null }

export function PackageUnitAssignment({
  reservationId,
  tabletUnits,
  atlas2Units,
  currentAssignments,
}: {
  reservationId: string
  tabletUnits: Unit[]
  atlas2Units: Unit[]
  currentAssignments: Assignment[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initTablet = currentAssignments.find((a) => a.unit_type === 'tablet')?.unit_id ?? null
  const initAtlas2 = currentAssignments.find((a) => a.unit_type === 'atlas2')?.unit_id ?? null
  const [tabletId, setTabletId] = useState<string | null>(initTablet)
  const [atlas2Id, setAtlas2Id] = useState<string | null>(initAtlas2)

  async function save(newTabletId: string | null, newAtlas2Id: string | null) {
    setLoading(true)
    setError(null)
    const assignments: Assignment[] = []
    if (tabletUnits.length > 0) assignments.push({ unit_type: 'tablet', unit_id: newTabletId })
    if (atlas2Units.length > 0) assignments.push({ unit_type: 'atlas2', unit_id: newAtlas2Id })

    const response = await fetch(`/api/admin/reservations/${reservationId}/assign-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    })
    setLoading(false)
    if (!response.ok) {
      setError('Failed to save assignment. Please try again.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      {tabletUnits.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-white/30">Tablet:</span>
          <select
            value={tabletId ?? ''}
            onChange={(e) => {
              const val = e.target.value || null
              setTabletId(val)
              save(val, atlas2Id)
            }}
            disabled={loading}
            className="rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
          >
            <option value="">— unassigned —</option>
            {tabletUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.navo_number}
              </option>
            ))}
          </select>
        </div>
      )}
      {atlas2Units.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-white/30">Atlas 2:</span>
          <select
            value={atlas2Id ?? ''}
            onChange={(e) => {
              const val = e.target.value || null
              setAtlas2Id(val)
              save(tabletId, val)
            }}
            disabled={loading}
            className="rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
          >
            <option value="">— unassigned —</option>
            {atlas2Units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.navo_number}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 9: Run component tests — verify they pass**

```bash
npx jest "__tests__/components/admin/PackageUnitAssignment" --no-coverage
```

Expected: PASS (3/3)

- [ ] **Step 10: Update admin reservations page**

Modify `app/admin/reservations/page.tsx`:

**a) Extend the Reservation type** — add product unit requirement fields:
```typescript
type Reservation = {
  // ... existing fields ...
  products: { name: string; tablet_required: boolean; atlas2_units_required: number } | null
}
```

**b) Update the DB query** — extend products select and add reservation_units query:
```typescript
// Change this line:
.select('id, customer_email, status, start_date, end_date, total_cents, created_at, unit_id, products(name)')
// To:
.select('id, customer_email, status, start_date, end_date, total_cents, created_at, unit_id, products(name, tablet_required, atlas2_units_required)')
```

**c) Add reservation_units query** — after the existing units query:
```typescript
const reservationIds = (reservations ?? []).map((r) => r.id)

const { data: reservationUnits } = reservationIds.length > 0
  ? await supabaseAdmin
      .from('reservation_units')
      .select('reservation_id, unit_type, unit_id')
      .in('reservation_id', reservationIds)
  : { data: [] }
```

**d) Import PackageUnitAssignment** — add at top:
```typescript
import { PackageUnitAssignment } from './PackageUnitAssignment'
```

**e) Update the Unit cell** — replace `<AssignUnitDropdown ...>` with conditional:
```tsx
<td className="px-5 py-3">
  {r.products?.tablet_required || (r.products?.atlas2_units_required ?? 0) > 0
    ? (
      <PackageUnitAssignment
        reservationId={r.id}
        tabletUnits={r.products?.tablet_required ? unitList.filter((u) => u.unit_type === 'tablet') : []}
        atlas2Units={(r.products?.atlas2_units_required ?? 0) > 0 ? unitList.filter((u) => u.unit_type === 'atlas2') : []}
        currentAssignments={(reservationUnits ?? [])
          .filter((ru) => ru.reservation_id === r.id && ru.unit_id)
          .map((ru) => ({ unit_type: ru.unit_type as 'tablet' | 'atlas2', unit_id: ru.unit_id }))}
      />
    )
    : (
      <AssignUnitDropdown
        reservationId={r.id}
        currentUnitId={r.unit_id}
        units={availableUnitsFor(r.id, r.unit_id)}
      />
    )}
</td>
```

Note: `unitList` from the units query does not have `unit_type` in the current select. Update that query to also select `unit_type`:
```typescript
// Change:
.select('id, navo_number, status')
// To:
.select('id, navo_number, status, unit_type')
```

And update the `Unit` type:
```typescript
type Unit = { id: string; navo_number: string; status: string; unit_type: string }
```

- [ ] **Step 11: Run the build to verify no type errors**

```bash
npm run build
```

Expected: exits 0. Fix any TypeScript errors before proceeding.

- [ ] **Step 12: Run all tests**

```bash
npm test
```

Expected: All tests pass (≥227, plus 7 new)

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations/007_reservation_units_unit_id.sql \
  app/api/admin/reservations/[id]/assign-units/route.ts \
  app/admin/reservations/PackageUnitAssignment.tsx \
  app/admin/reservations/page.tsx \
  __tests__/api/admin/assign-units.test.ts \
  __tests__/components/admin/PackageUnitAssignment.test.tsx
git commit -m "feat: multi-unit assignment for package reservations (Bug #3)

- Add unit_id FK to reservation_units (migration 007)
- POST /api/admin/reservations/[id]/assign-units — upserts per-role rows
- PackageUnitAssignment component — tablet + atlas2 dropdowns for packages
- Admin reservations page — conditional UI by reservation_type"
```

---

## Task 3: Products Page Purchase Checkout

### Key context
- Storefront `product.id` = slug (`"atlas-2"`), not a DB UUID
- Atlas 2 DB product UUID: `6f303d86-5763-4ece-aaad-b78d17852f8a` (seeded in migration 003)
- Price is fetched server-side from `storefrontProducts` — never trust client for amounts
- Warranty: slug `'vakaros-care-warranty'` on the add-ons array
- `quantity` validation: integer 1–8
- Webhook `fulfillCheckoutSession` is type-agnostic — works for `purchase` type unchanged
- `reservation_type: 'purchase'` is already in the DB schema CHECK constraint

**Files:**
- Create: `lib/checkout/handlers/purchase.ts`
- Modify: `app/api/checkout/route.ts`
- Modify: `app/products/[slug]/ProductPurchasePanel.tsx`
- Create: `__tests__/lib/checkout/handlers/purchase.test.ts`

- [ ] **Step 1: Write the failing tests for the purchase handler**

Create `__tests__/lib/checkout/handlers/purchase.test.ts`:

```typescript
import { handlePurchase } from '@/lib/checkout/handlers/purchase'

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { create: jest.fn() } } },
}))
jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))

import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'

const session = { user: { id: 'user-1', email: 'test@example.com' } }

function setupMocks(stripeUrl = 'https://checkout.stripe.com/test') {
  ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
    id: 'cs_test',
    url: stripeUrl,
  })
  ;(supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'products') {
      return { select: () => ({ eq: () => ({ single: () => ({ data: { id: 'db-product-uuid' }, error: null }) }) }) }
    }
    if (table === 'reservations') {
      return { insert: () => ({ select: () => ({ single: () => ({ data: { id: 'res-id' }, error: null }) }) }) }
    }
    return {}
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  setupMocks()
})

it('returns 404 for unknown product slug', async () => {
  const result = await handlePurchase(
    { product_id: 'not-real', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(404)
})

it('returns 400 for invalid quantity', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 0, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(400)
})

it('returns 400 for quantity > 8', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 9, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(400)
})

it('creates Stripe session with product price × quantity', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 2, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(200)
  expect(result.body.url).toBe('https://checkout.stripe.com/test')
  const call = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0]
  const productItem = call.line_items.find((li: { price_data: { product_data: { name: string } } }) =>
    li.price_data.product_data.name.includes('Atlas'),
  )
  expect(productItem.quantity).toBe(2)
})

it('adds warranty line item when warranty_selected is true', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: true },
    session,
    'http://localhost:3000',
  )
  expect(result.status).toBe(200)
  const call = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0]
  expect(call.line_items).toHaveLength(2)
})

it('returns Stripe URL and reservation_id on success', async () => {
  const result = await handlePurchase(
    { product_id: 'atlas-2', quantity: 1, warranty_selected: false },
    session,
    'http://localhost:3000',
  )
  expect(result.body.url).toBe('https://checkout.stripe.com/test')
  expect(result.body.reservation_id).toBe('res-id')
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest "__tests__/lib/checkout/handlers/purchase" --no-coverage
```

Expected: FAIL (module not found)

- [ ] **Step 3: Create the purchase handler**

Create `lib/checkout/handlers/purchase.ts`:

```typescript
import { supabaseAdmin } from '@/lib/db/client'
import { stripe } from '@/lib/stripe/client'
import { storefrontProducts } from '@/lib/commerce/products'
import { sendEmail } from '@/lib/email/gmail'
import { bookingPending } from '@/lib/email/templates'

type PurchaseInput = {
  product_id: string      // storefront slug, e.g. 'atlas-2'
  quantity: number        // validated integer 1–8
  warranty_selected: boolean
}

type Session = {
  user: { id?: string | null; email?: string | null }
}

type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

export async function handlePurchase(
  input: PurchaseInput,
  session: Session,
  baseUrl: string,
): Promise<HandlerResult> {
  const { product_id: slug, quantity, warranty_selected } = input

  // 1. Validate quantity (belt-and-suspenders; route also validates)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 8) {
    return { status: 400, body: { error: 'quantity must be an integer between 1 and 8' } }
  }

  // 2. Look up storefront product — server-side price only, never trust client
  const storefrontProduct = storefrontProducts.find((p) => p.slug === slug)
  if (!storefrontProduct) {
    return { status: 404, body: { error: 'Product not found' } }
  }

  // 3. Look up DB product UUID by slug
  const { data: dbProduct, error: dbErr } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('slug', slug)
    .single()

  if (dbErr || !dbProduct) {
    console.error('Product DB lookup failed:', dbErr)
    return { status: 404, body: { error: 'Product record not found' } }
  }

  // 4. Compute pricing server-side
  const warranty = storefrontProduct.addOns.find((a) => a.slug === 'vakaros-care-warranty')
  const warrantyPerUnit = warranty_selected && warranty ? warranty.priceCents : 0
  const totalCents = (storefrontProduct.pricing.amountCents + warrantyPerUnit) * quantity

  // 5. Build Stripe line items
  const lineItems: Parameters<typeof stripe.checkout.sessions.create>[0]['line_items'] = [
    {
      price_data: {
        currency: 'usd',
        unit_amount: storefrontProduct.pricing.amountCents,
        product_data: { name: storefrontProduct.name },
      },
      quantity,
    },
  ]
  if (warranty_selected && warranty) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: warranty.priceCents,
        product_data: { name: warranty.name },
      },
      quantity,
    })
  }

  // 6. Create Stripe Checkout session (before any DB write)
  let stripeSession: { id: string; url: string | null }
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      metadata: {
        reservation_type: 'purchase',
        product_id: (dbProduct as { id: string }).id,
        quantity: String(quantity),
        warranty_selected: String(warranty_selected),
        user_id: session.user.id ?? '',
        customer_email: session.user.email ?? '',
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/products/${slug}?checkout=cancelled`,
    })
  } catch (err) {
    console.error('Stripe session creation failed (purchase):', err)
    return { status: 503, body: { error: 'Payment service unavailable. Please try again.' } }
  }

  // 7. Insert reservation
  const { data: reservation, error: insertError } = await supabaseAdmin
    .from('reservations')
    .insert({
      reservation_type: 'purchase',
      product_id: (dbProduct as { id: string }).id,
      user_id: session.user.id ?? '',
      customer_email: session.user.email ?? '',
      status: 'reserved_unpaid',
      stripe_checkout_session_id: stripeSession.id,
      total_cents: totalCents,
      extra_days: 0,
      late_fee_applied: false,
      late_fee_cents: 0,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('Reservation insert failed (purchase):', insertError)
    return { status: 500, body: { error: 'Failed to create reservation' } }
  }

  // 8. Fire-and-forget pending email
  const reservationId = (reservation as { id: string }).id
  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId,
    productName: storefrontProduct.name,
    startDate: null,
    endDate: null,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (purchase) failed:', err))

  return {
    status: 200,
    body: { url: stripeSession.url, reservation_id: reservationId },
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest "__tests__/lib/checkout/handlers/purchase" --no-coverage
```

Expected: PASS (5/5)

- [ ] **Step 5: Wire purchase handler into checkout route**

Modify `app/api/checkout/route.ts`:

**a) Add import** at the top:
```typescript
import { handlePurchase } from '@/lib/checkout/handlers/purchase'
```

**b) Extend CheckoutBody** — add two fields:
```typescript
type CheckoutBody = {
  // ... existing fields ...
  quantity?: number
  warranty_selected?: boolean
}
```

**c) Replace the 501 fallback** at the bottom of the route with:
```typescript
// 'purchase' type
const rawQuantity = Number(body.quantity ?? 1)
if (rawQuantity < 1 || rawQuantity > 8 || !Number.isInteger(rawQuantity)) {
  return NextResponse.json({ error: 'quantity must be an integer between 1 and 8' }, { status: 400 })
}
const result = await handlePurchase(
  {
    product_id: body.product_id,
    quantity: rawQuantity,
    warranty_selected: body.warranty_selected ?? false,
  },
  authedSession,
  baseUrl,
)
return NextResponse.json(result.body, { status: result.status })
```

- [ ] **Step 6: Update ProductPurchasePanel to call checkout**

Modify `app/products/[slug]/ProductPurchasePanel.tsx`:

**a) Add two state variables** after the existing `useState` calls:
```typescript
const [purchasing, setPurchasing] = useState(false)
const [purchaseError, setPurchaseError] = useState<string | null>(null)
```

**b) Add the handler function** after the existing `increment`/`decrement` functions:
```typescript
async function handleCheckout() {
  setPurchasing(true)
  setPurchaseError(null)
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservation_type: 'purchase',
        product_id: product.slug,
        quantity,
        warranty_selected: warrantySelected,
      }),
    })
    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) {
      setPurchaseError(data.error ?? 'Checkout failed. Please try again.')
      return
    }
    window.location.href = data.url
  } catch {
    setPurchaseError('Network error. Please try again.')
  } finally {
    setPurchasing(false)
  }
}
```

**c) Replace the disabled button** (lines 96–102) with:
```tsx
<button
  type="button"
  onClick={handleCheckout}
  disabled={purchasing}
  className="glass-btn glass-btn-primary mt-6 w-full px-6 py-3 text-sm font-medium disabled:opacity-60"
>
  {purchasing ? 'Redirecting to checkout…' : 'Buy Now'}
</button>
{purchaseError && (
  <p className="mt-2 text-xs text-red-400">{purchaseError}</p>
)}
```

- [ ] **Step 7: Run build to verify no type errors**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: All tests pass (≥232 — 5 new handler tests + existing)

- [ ] **Step 9: Commit**

```bash
git add lib/checkout/handlers/purchase.ts \
  app/api/checkout/route.ts \
  app/products/[slug]/ProductPurchasePanel.tsx \
  __tests__/lib/checkout/handlers/purchase.test.ts
git commit -m "feat: products page purchase checkout (Atlas 2 buy now)

- lib/checkout/handlers/purchase.ts — server-side pricing from storefrontProducts
- Wires purchase type into /api/checkout (was 501)
- ProductPurchasePanel: 'Buy Now' button → Stripe checkout redirect
- Sends pending email; fulfilled by existing webhook"
```

---

## E2E Test Checklist (manual — update docs/e2e-test-log.md after testing)

After implementation, test the following in staging:

### Purchase Flow
- [ ] Log in → navigate to `/products/atlas-2`
- [ ] Change quantity to 2, leave warranty checked
- [ ] Click "Buy Now" → button shows "Redirecting to checkout…"
- [ ] Lands on Stripe checkout with correct line items (product × 2 + warranty × 2)
- [ ] Use card `4242 4242 4242 4242` → lands on `/checkout/success`
- [ ] Reservation appears in `/admin/reservations` with status `reserved_paid`

### Multi-Unit Assignment (package reservation required)
- [ ] Create a `regatta_package` reservation (via existing packages checkout)
- [ ] Navigate to `/admin/reservations`
- [ ] Package row shows tablet dropdown + atlas2 dropdown instead of single dropdown
- [ ] Select a tablet unit → row refreshes, assignment persists
- [ ] Select an atlas2 unit → same
- [ ] Individual rental rows still show single dropdown (unchanged)

---

## Architecture Notes

- **Pricing trust boundary:** `handlePurchase` always imports `storefrontProducts` server-side. The client never sends a price. `product_id` is a slug — the handler validates it against the known product list.
- **`reservations.product_id` FK:** For purchases, `product_id` is the DB UUID looked up by slug. Webhook fulfillment works unchanged.
- **Webhook:** `fulfillCheckoutSession` is type-agnostic — looks up reservation by Stripe session ID and updates status. Purchase type flows through automatically.
- **Package unit filtering:** Current implementation shows ALL non-retired units of each type in package dropdowns (no availability check). This is intentional for P1 — availability-aware filtering for packages is a post-launch improvement.
- **`reservations.unit_id`:** Kept as-is for individual rentals. Package reservations use `reservation_units` instead. The two systems coexist.

---

## CEO Review Amendments (2026-03-23)

The following changes were decided during `/plan-ceo-review` and must be incorporated during implementation:

### Fixes to Task 2 (Multi-Unit Assignment)

1. **Atomic delete+insert via Supabase RPC** — The `assign-units` route must NOT do two separate Supabase calls. Add a Postgres function to migration 007:
   ```sql
   CREATE OR REPLACE FUNCTION assign_reservation_units(
     p_reservation_id UUID,
     p_assignments JSONB
   ) RETURNS void LANGUAGE plpgsql AS $$
   BEGIN
     DELETE FROM reservation_units WHERE reservation_id = p_reservation_id;
     INSERT INTO reservation_units (reservation_id, unit_type, unit_id, quantity)
     SELECT p_reservation_id, (item->>'unit_type')::text, (item->>'unit_id')::uuid, 1
     FROM jsonb_array_elements(p_assignments) AS item
     WHERE item->>'unit_id' IS NOT NULL;
   END;
   $$;
   ```
   Route calls `supabaseAdmin.rpc('assign_reservation_units', { p_reservation_id: reservationId, p_assignments: JSON.stringify(toInsert) })`.

2. **Extend `availableUnitsForReservation()` to check `reservation_units.unit_id`** — Add a 5th param `reservationUnits: { reservation_id: string; unit_id: string | null }[]` (defaults to `[]`). Busy set includes units assigned via `reservation_units` for other active reservations. Add 2 new test cases to `filtering.test.ts`.

3. **N atlas2 dropdowns matching `atlas2_units_required`** — `PackageUnitAssignment` renders `atlas2_units_required` number of atlas2 selects (labeled "Atlas 2 (1)", "Atlas 2 (2)", etc.), each tracking independent state and sending its own assignment row. State array: `const [atlas2Ids, setAtlas2Ids] = useState<(string | null)[]>(Array(atlas2Units.length).fill(null))`. Save sends all current assignments atomically.

4. **3 error-path tests** — Add to `assign-units.test.ts`: (a) RPC DB error → 500. Add to `purchase.test.ts`: (b) Stripe create rejects → 503, (c) reservations insert fails → 500.

### Fixes to Task 3 (Purchase Checkout)

5. **Shipping address collection** — Add to `stripe.checkout.sessions.create()` in `handlePurchase`:
   ```typescript
   shipping_address_collection: { allowed_countries: ['US'] },
   ```
   Stripe will collect ship-to address at checkout. Access via `session.shipping` in webhook or Stripe dashboard.
   **Design rule:** ALL `reservation_type: 'purchase'` flows (any handler where NAVO ships physical hardware) MUST include `shipping_address_collection`. Rental and package flows (where units are used on-site and returned) do NOT need it.

6. **`confirmation_email` in ProductPurchasePanel** — Add `useSession()` hook for pre-fill. Add editable email input before the Buy Now button. Pass `confirmation_email` in POST body. Pattern matches `PackageReviewStep`.

### TODOs Added to TODOS.md

- **P1:** `reservations.quantity` not stored — admin can't see how many units were ordered without checking Stripe dashboard. Migration needed before first live purchase.
- **P2:** Email copy "Dates: See event details" is wrong for purchases — should say "Delivery" or be hidden.
- **P2:** Availability filter runs on capped list (`.limit(100)`) — units on older active reservations are invisible.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps, 6 amendments accepted |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 14 findings, 6 fixed, 3 deferred as TODOs |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 7 issues found, 2 critical gaps (Stripe orphan session, reservation_units fetch silent fail) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**ENG AMENDMENTS (apply before implementing):**
1. **Merge CEO amendments into task steps** — plan body is pre-amendment; steps need updating for RPC route, N atlas2 dropdowns, shipping_address_collection, confirmation_email UI, and updated test mocks.
2. **Add `reservation_type` to reservations query** — include `reservation_type` in the `.select()` and change conditional in Step 10e to `r.reservation_type === 'regatta_package' && (tablet_required || atlas2_units_required > 0)`.
3. **Export `ACTIVE_STATUSES`** from `lib/admin/unit-availability.ts`.
4. **Add migration 008** — `ALTER TABLE reservations ADD COLUMN quantity INT NOT NULL DEFAULT 1`. Update `handlePurchase` insert to store `quantity`.
5. **Fix `assign-units` test mocks** — replace `delete/insert` chain mocks with `.rpc('assign_reservation_units', ...)` mock.
6. **Add checkout route test file** — `__tests__/api/checkout/route.test.ts` covering purchase quantity validation and dispatch.
7. **Add 3 CEO error-path tests** in plan steps (not just amendments section): RPC error → 500, Stripe create rejects → 503, reservations insert fails → 500.

**VERDICT: CEO + CODEX + ENG CLEARED — ready to implement (apply eng amendments first).**

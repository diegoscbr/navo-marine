# UI Button & Package Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frosted-glass pill button system with a solid square style, and replace emoji icons on package cards with full-bleed photography.

**Architecture:** CSS-only rewrite of `.glass-btn*` classes in `globals.css`, removing `rounded-full` from `Button.tsx` base and 5 raw callsite files, and updating `PackageCards.tsx` to use `<Image fill>` with a gradient overlay in place of the emoji `<div>`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, `next/image`

**Spec:** `docs/superpowers/specs/2026-03-20-ui-button-card-redesign.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/globals.css` | Modify lines 39–123 | Drop glass/backdrop-filter; solid fill for primary, subtle bg for ghost |
| `components/ui/Button.tsx` | Modify line 17 | Remove `rounded-full` from base class string |
| `app/reserve/ReserveBookingUI.tsx` | Modify line 221 | Remove `rounded-full` from Reserve & Pay button |
| `app/products/[slug]/ProductPurchasePanel.tsx` | Modify lines 99, 105 | Remove `rounded-full` from 2 raw buttons |
| `app/packages/DateRangePicker.tsx` | Modify lines 140, 147 | Remove `rounded-full` from Back/Review buttons |
| `app/packages/PackageReviewStep.tsx` | Modify lines 92, 99 | Remove `rounded-full` from Back/Reserve buttons |
| `components/layout/Navbar.tsx` | Modify line 84 | Remove `rounded-full` from Sign Out button |
| `app/packages/PackageCards.tsx` | Modify | Replace emoji with `<Image fill>` + gradient overlay; update `PACKAGE_META` type |
| `__tests__/components/packages/PackageCards.test.tsx` | Create | Regression test — verify images render with correct alt text |

---

## Task 1: Rewrite glass-btn CSS classes

**Files:**
- Modify: `app/globals.css` (lines 39–123)

- [ ] **Step 1.1: Run existing button-related tests to establish baseline**

```bash
npx jest --testPathPattern="Button" --verbose
```

Expected: all pass (or note any pre-existing failures).

- [ ] **Step 1.2: Replace the entire glass-btn block**

In `app/globals.css`, replace lines 39–123 (the `/* ─── Liquid Glass Button System ────────────────────────────── */` block through the closing `}` of `@layer components`) with:

```css
/* ─── Solid Button System ────────────────────────────────── */
@layer components {
  .glass-btn {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .glass-btn:active {
    transform: scale(0.98);
  }

  .glass-btn:focus-visible {
    outline: 2px solid rgba(30, 110, 255, 0.8);
    outline-offset: 2px;
  }

  /* Primary variant — solid marine blue fill */
  .glass-btn-primary {
    background: #1E6EFF;
    border: 1px solid transparent;
    color: #ffffff;
  }

  .glass-btn-primary:hover:not(:disabled) {
    background: rgba(30, 110, 255, 0.85);
  }

  .glass-btn-primary:active {
    background: rgba(30, 110, 255, 0.75);
  }

  /* Ghost variant — subtle white bg, border, muted text */
  .glass-btn-ghost {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.85);
  }

  .glass-btn-ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.11);
    color: #ffffff;
  }

  .glass-btn-ghost:active {
    background: rgba(255, 255, 255, 0.16);
  }
}
```

Key differences from old code:
- `backdrop-filter` lines removed entirely
- `.glass-btn::before` specular highlight block removed
- `.glass-btn` base no longer sets `background` or `border` (those are variant-only now)
- `.glass-btn-primary` is now `background: #1E6EFF` (solid) instead of `rgba(30, 110, 255, 0.18)`
- `.glass-btn-ghost` background and border values unchanged in feel but no `backdrop-filter`

- [ ] **Step 1.3: Run tests again to confirm no regressions**

```bash
npx jest --testPathPattern="Button" --verbose
```

Expected: same pass/fail as Step 1.1.

- [ ] **Step 1.4: Commit**

```bash
git add app/globals.css
git commit -m "style: replace glass-btn backdrop-filter with solid fill system"
```

---

## Task 2: Remove rounded-full from Button.tsx

**Files:**
- Modify: `components/ui/Button.tsx` (line 17)

- [ ] **Step 2.1: Write the failing test**

Create `__tests__/components/ui/Button.test.tsx` if it does not exist. Add:

```tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('does not apply rounded-full to the base class', () => {
    render(<Button variant="primary">Click me</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).not.toContain('rounded-full')
  })

  it('applies glass-btn base class', () => {
    render(<Button variant="primary">Click me</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('glass-btn')
  })

  it('applies glass-btn-primary for primary variant', () => {
    render(<Button variant="primary">Click me</Button>)
    expect(screen.getByRole('button').className).toContain('glass-btn-primary')
  })

  it('applies glass-btn-ghost for ghost variant', () => {
    render(<Button variant="ghost">Click me</Button>)
    expect(screen.getByRole('button').className).toContain('glass-btn-ghost')
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
npx jest --testPathPattern="components/ui/Button" --verbose
```

Expected: FAIL — `rounded-full` is currently in the base class string.

- [ ] **Step 2.3: Remove rounded-full from Button.tsx**

In `components/ui/Button.tsx` line 17, change:

```ts
// Before
const base =
  'glass-btn inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium tracking-wide disabled:opacity-50'
```

to:

```ts
// After
const base =
  'glass-btn inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide disabled:opacity-50'
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npx jest --testPathPattern="components/ui/Button" --verbose
```

Expected: all 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add components/ui/Button.tsx __tests__/components/ui/Button.test.tsx
git commit -m "style: remove rounded-full from Button base class"
```

---

## Task 3: Remove rounded-full from raw callsites

**Files:**
- Modify: `app/reserve/ReserveBookingUI.tsx`
- Modify: `app/products/[slug]/ProductPurchasePanel.tsx`
- Modify: `app/packages/DateRangePicker.tsx`
- Modify: `app/packages/PackageReviewStep.tsx`
- Modify: `components/layout/Navbar.tsx`

These are all raw `<button>` or `<a>`/`<Link>` elements that manually add `rounded-full` alongside `glass-btn`. We only remove `rounded-full` from the class string — no other changes.

**Do NOT touch:** The `+`/`-` quantity stepper buttons in `ProductPurchasePanel` — those are small circular icon buttons, not CTAs.

- [ ] **Step 3.1: Edit ReserveBookingUI.tsx**

Line 221 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-primary mt-8 w-full rounded-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"

// After
className="glass-btn glass-btn-primary mt-8 w-full px-6 py-4 text-sm font-medium tracking-wide disabled:opacity-40"
```

- [ ] **Step 3.2: Edit ProductPurchasePanel.tsx**

Line 99 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-primary mt-6 w-full rounded-full px-6 py-3 text-sm font-medium opacity-60"

// After
className="glass-btn glass-btn-primary mt-6 w-full px-6 py-3 text-sm font-medium opacity-60"
```

Line 105 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-ghost mt-3 inline-flex w-full justify-center rounded-full px-6 py-3 text-sm font-medium"

// After
className="glass-btn glass-btn-ghost mt-3 inline-flex w-full justify-center px-6 py-3 text-sm font-medium"
```

- [ ] **Step 3.3: Edit DateRangePicker.tsx**

Line 140 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-ghost flex-1 rounded-full px-6 py-3 text-sm font-medium"

// After
className="glass-btn glass-btn-ghost flex-1 px-6 py-3 text-sm font-medium"
```

Line 147 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-primary flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"

// After
className="glass-btn glass-btn-primary flex-1 px-6 py-3 text-sm font-medium disabled:opacity-40"
```

- [ ] **Step 3.4: Edit PackageReviewStep.tsx**

Line 92 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-ghost flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"

// After
className="glass-btn glass-btn-ghost flex-1 px-6 py-3 text-sm font-medium disabled:opacity-40"
```

Line 99 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-primary flex-1 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-40"

// After
className="glass-btn glass-btn-primary flex-1 px-6 py-3 text-sm font-medium disabled:opacity-40"
```

- [ ] **Step 3.5: Edit Navbar.tsx**

Line 84 — remove `rounded-full`:

```tsx
// Before
className="glass-btn glass-btn-ghost inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium tracking-wide"

// After
className="glass-btn glass-btn-ghost inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide"
```

- [ ] **Step 3.6: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: all tests pass (or same failures as before this task).

- [ ] **Step 3.7: Commit**

```bash
git add \
  app/reserve/ReserveBookingUI.tsx \
  app/products/[slug]/ProductPurchasePanel.tsx \
  app/packages/DateRangePicker.tsx \
  app/packages/PackageReviewStep.tsx \
  components/layout/Navbar.tsx
git commit -m "style: remove rounded-full from raw glass-btn callsites"
```

---

## Task 4: Replace emoji with images in PackageCards

**Files:**
- Modify: `app/packages/PackageCards.tsx`

- [ ] **Step 4.0: Verify image files exist in public/**

```bash
ls public/racecomittee.jpg public/windward-leeward.jpg public/racemanagement.jpg
```

Expected: all three files listed. If any are missing, locate the correct filename before continuing (the rest of the task depends on these paths being correct).

- [ ] **Step 4.1: Write the failing test**

Create `__tests__/components/packages/PackageCards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { PackageCards } from '@/app/packages/PackageCards'
import type { PackageProduct } from '@/lib/db/packages'

const makeProduct = (slug: string): PackageProduct => ({
  id: slug,
  slug,
  name: slug,
  price_per_day_cents: 10500,
  payment_mode: 'payment',
  min_advance_booking_days: null,
  stripe_price_id: 'price_test',
  active: true,
})

describe('PackageCards', () => {
  it('renders an image with correct alt for race-committee-package', () => {
    render(
      <PackageCards
        products={[makeProduct('race-committee-package')]}
        onSelect={() => {}}
      />
    )
    const img = screen.getByRole('img', { name: 'race-committee-package' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'race-committee-package')
  })

  it('renders an image with correct alt for rc-wl-course-package', () => {
    render(
      <PackageCards
        products={[makeProduct('rc-wl-course-package')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole('img', { name: 'rc-wl-course-package' })).toBeInTheDocument()
  })

  it('renders an image with correct alt for racesense-management-services', () => {
    render(
      <PackageCards
        products={[makeProduct('racesense-management-services')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole('img', { name: 'racesense-management-services' })).toBeInTheDocument()
  })

  it('does not render an img element for an unknown slug', () => {
    render(
      <PackageCards
        products={[makeProduct('unknown-slug')]}
        onSelect={() => {}}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('displays the price in dollars per day', () => {
    render(
      <PackageCards
        products={[makeProduct('race-committee-package')]}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('$105')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npx jest --testPathPattern="PackageCards" --verbose
```

Expected: FAIL — currently renders an emoji div, no `<img>` element.

- [ ] **Step 4.3: Update PackageCards.tsx**

Apply all three changes in one edit:

**a) Add `import Image from 'next/image'`** at line 1 (after the existing import):

```tsx
import type { PackageProduct } from '@/lib/db/packages'
import Image from 'next/image'
```

**b) Replace `PACKAGE_META` type and data** (lines 8–24):

```tsx
const PACKAGE_META: Record<string, { image: string; description: string; equipment: string[] }> = {
  'race-committee-package': {
    image: '/racecomittee.jpg',
    description: 'Essential tablet tools for race committee operations at any regatta.',
    equipment: ['1× Committee Tablet'],
  },
  'rc-wl-course-package': {
    image: '/windward-leeward.jpg',
    description: 'Full Atlas 2 fleet deployment for windward-leeward course management.',
    equipment: ['5× Atlas 2 Units', '1× Committee Tablet'],
  },
  'racesense-management-services': {
    image: '/racemanagement.jpg',
    description: 'Human-led race orchestration with full data platform. Expenses invoiced separately.',
    equipment: ['Dedicated Race Director', 'Full Data Platform'],
  },
}
```

**c) Replace the emoji div** (line 30 in current file: `const meta = PACKAGE_META[product.slug] ?? { icon: '📦', description: '', equipment: [] }`) with:

```tsx
const meta = PACKAGE_META[product.slug] ?? { image: '', description: '', equipment: [] }
```

**d) Replace `<div className="text-3xl mb-3">{meta.icon}</div>`** (line 39) with:

```tsx
{meta.image && (
  <div className="relative h-40 w-full overflow-hidden rounded-t-xl -mx-6 -mt-6 mb-6">
    <Image src={meta.image} alt={product.name} fill className="object-cover" />
    <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/60 to-transparent" />
  </div>
)}
```

Note: The card button has `p-6` padding. Without negative margins the image would be inset 24px on all sides. `-mx-6 -mt-6 mb-6` counteracts the padding so the image bleeds to the card edges, achieving the full-bleed goal. The card's existing `overflow-hidden rounded-xl` clips the top corners naturally.

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
npx jest --testPathPattern="PackageCards" --verbose
```

Expected: all 5 tests pass.

- [ ] **Step 4.5: Run full test suite to verify no other regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add app/packages/PackageCards.tsx __tests__/components/packages/PackageCards.test.tsx
git commit -m "feat: replace emoji icons with full-bleed photography on package cards"
```

---

## Task 5: Manual QA verification

Start the dev server and visually verify on key pages.

- [ ] **Step 5.1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 5.2: Check button style on each page**

Visit these URLs and confirm all CTA buttons are square (rounded corners, not pill) with solid fills:

| URL | Buttons to check |
|---|---|
| `http://localhost:3000/` | Hero CTAs, any nav buttons |
| `http://localhost:3000/login` | Login button |
| `http://localhost:3000/products/atlas-2` | "Checkout Coming Soon", "Contact Sales" |
| `http://localhost:3000/reserve` | Tab toggle (already square — unchanged), "Reserve & Pay" |
| `http://localhost:3000/packages` | Back/Next/Review/Reserve buttons in flow |

Confirm: no pill shape, no blur/frosted-glass effect. Primary buttons are solid `#1E6EFF`, ghost buttons have subtle white bg with border.

- [ ] **Step 5.3: Check package cards at http://localhost:3000/packages**

Confirm:
- Each of the 3 cards shows a landscape photo at the top
- Gradient fades from solid navy at the bottom to transparent at the top of the image block
- No broken image icons — photos load correctly
- Card title, price, description, equipment list, and "Select →" remain intact below the image

- [ ] **Step 5.4: Build check**

```bash
npm run build
```

Expected: build succeeds with no errors. (Next.js will warn if `<Image fill>` is used without a parent with `position: relative` — the `relative` class on the wrapper div satisfies this.)

If the build fails, stop here and fix the TypeScript/Next.js errors before proceeding. Do not merge or ship with a broken build.

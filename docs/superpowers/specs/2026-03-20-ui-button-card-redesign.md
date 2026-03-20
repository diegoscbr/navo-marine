# UI Redesign: Buttons & Package Cards

**Date:** 2026-03-20
**Branch:** dev
**Scope:** Two visual fixes — standardize all CTAs to square/solid style; replace emoji icons on `/packages` cards with full-bleed photography.

---

## 1. Button System

### Goal

All CTA buttons across the site adopt the squarish solid style already used by the "Rent for an Event / Custom Dates" tab toggle on `/reserve`. The current pill/frosted-glass style is replaced everywhere.

### New Style

- **Shape:** `rounded-lg` (not `rounded-full`)
- **Primary:** solid `bg-marine-500` fill, white text, no glass/backdrop-filter
- **Ghost:** `bg-white/7`, `border-white/15`, `text-white/85`
- **Hover (primary):** `bg-marine-500/85`
- **Hover (ghost):** `bg-white/11 text-white`

### Changes

#### `app/globals.css`

Rewrite `.glass-btn`, `.glass-btn-primary`, `.glass-btn-ghost` and their hover/active/focus states:

```css
.glass-btn {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

/* Remove the ::before specular highlight entirely */

.glass-btn:active {
  transform: scale(0.98);
}

.glass-btn:focus-visible {
  outline: 2px solid rgba(30, 110, 255, 0.8);
  outline-offset: 2px;
}

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
```

#### `components/ui/Button.tsx`

Remove `rounded-full` from the base class string:

```ts
const base =
  'glass-btn inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide disabled:opacity-50'
```

#### Callsites — remove `rounded-full`

All raw `<button>` and `<a>` tags that manually include `rounded-full` alongside `glass-btn` must have `rounded-full` removed. Files affected:

| File | Lines |
|---|---|
| `app/reserve/ReserveBookingUI.tsx` | 221 |
| `app/products/[slug]/ProductPurchasePanel.tsx` | 99, 105 |
| `app/packages/DateRangePicker.tsx` | 140, 147 |
| `app/packages/PackageReviewStep.tsx` | 92, 99 |
| `components/layout/Navbar.tsx` | 84 |

The `/reserve` tab toggle (`rounded-lg bg-marine-500`) is already correct — no change.

### Out of Scope

- Admin UI buttons (`/admin/*`) — admin forms use unstyled `<button>` tags without `glass-btn`; leave them alone
- Quantity stepper `+`/`-` buttons in `ProductPurchasePanel` — these are small circular icon buttons, not CTAs; leave them as `rounded-full`

---

## 2. Package Cards

### Goal

Replace the emoji icon at the top of each package card with a full-bleed photograph. Text content overlaid at the bottom via a gradient.

### Image Mapping

| Slug | Image file |
|---|---|
| `race-committee-package` | `/racecomittee.jpg` |
| `rc-wl-course-package` | `/windward-leeward.jpg` |
| `racesense-management-services` | `/racemanagement.jpg` |

### Changes

#### `app/packages/PackageCards.tsx`

1. Add `import Image from 'next/image'` at the top.

2. Update `PACKAGE_META` — replace `icon: string` with `image: string`:

```ts
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

3. Replace the emoji `<div>` with an image block + gradient overlay:

```tsx
{/* Image header */}
{meta.image && (
  <div className="relative h-40 w-full overflow-hidden rounded-t-xl">
    <Image src={meta.image} alt={product.name} fill className="object-cover" />
    <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/60 to-transparent" />
  </div>
)}
```

4. Fallback for unknown slugs: `image: ''` — the `{meta.image && ...}` guard renders a plain navy background instead of a broken image.

5. The card `<button>` already has `rounded-xl overflow-hidden` — the image block inherits this naturally for the top corners.

### Card Body

No changes to the body content — price, name, advance-booking badge, description, equipment list, hold disclosure, and "Select →" remain exactly as-is inside `<div className="p-6">`.

---

## 3. Testing

### Button system

- No new tests needed — the CSS change is visual only
- Existing snapshot tests (if any) will need updating
- Manual QA: verify primary and ghost variants on `/`, `/reserve`, `/products/[slug]`, `/packages`

### Package cards

- Update `__tests__/components/packages/PackageCards.test.tsx` (or equivalent): replace any `icon` emoji assertions with `alt` text assertions on the rendered `<img>` element
- The existing `PackagesUI` test for `$105/day` is unaffected (price markup unchanged)

---

## 4. Scope Summary

| File | Change |
|---|---|
| `app/globals.css` | Rewrite `.glass-btn*` classes — drop glass, use solid |
| `components/ui/Button.tsx` | Remove `rounded-full` from base |
| `app/reserve/ReserveBookingUI.tsx` | Remove `rounded-full` from Reserve & Pay button |
| `app/products/[slug]/ProductPurchasePanel.tsx` | Remove `rounded-full` from 2 buttons |
| `app/packages/DateRangePicker.tsx` | Remove `rounded-full` from 2 buttons |
| `app/packages/PackageReviewStep.tsx` | Remove `rounded-full` from 2 buttons |
| `components/layout/Navbar.tsx` | Remove `rounded-full` from nav button |
| `app/packages/PackageCards.tsx` | Replace emoji with `<Image>` + gradient overlay |

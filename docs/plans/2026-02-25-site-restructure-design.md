# Site Restructure Design

**Date:** 2026-02-25
**Status:** Approved
**Approach:** Option A — minimal surgery, no files moved

---

## Problem

The landing page is a single long-scroll page with all sections stacked vertically. Navigation uses anchor links. Some sections are no longer needed. The design system lacks visual polish (flat buttons, no glass effects).

## Goals

1. Convert to a multi-page Next.js app with real routes
2. Remove deprecated sections
3. Add a reservation placeholder page with Login entry point
4. Replace the DataCapabilities code mockup with a real video
5. Apply Apple Liquid Glass aesthetic to all buttons

---

## Page Structure

### Home (`/`)
Renders: `Hero`, `AuthorityStrip`, `VakarosSection`

### Capabilities (`/capabilities`)
Renders: `CoreCapabilities`, `DataCapabilities`

### Contact (`/contact`)
Renders: `ContactSection`

### Reserve (`/reserve`)
Coming Soon skeleton — NAVO-branded, email capture only. No Stripe, no calendar yet.

### Login (`/login`)
Placeholder route — no implementation yet.

---

## Component Changes

### Removed from home page render
- `RaceManagement` — removed from `app/page.tsx`; component file kept on disk
- `WhyNavo` — removed from `app/page.tsx`; component file kept on disk
- `ClosingCTA` — removed from `app/page.tsx`; component file kept on disk

### Navbar (`components/layout/Navbar.tsx`)
- Convert all nav links from `<a href="#...">` to `<Link href="...">` (Next.js)
- Nav links: Capabilities → `/capabilities`, Contact → `/contact`, Reserve → `/reserve`
- Remove "Partner With NAVO" `<Button>`
- Add **Login** button (liquid glass, `ghost` variant) linking to `/login`
- Remove `Race Management` and `Data Systems` links (no longer standalone nav items)

### Hero (`components/sections/Hero.tsx`)
- Remove "Partner With NAVO" `<Button variant="outline">`
- Update "Explore Our Capabilities" href from `#capabilities` to `/capabilities`

### VakarosSection (`components/sections/VakarosSection.tsx`)
- Replace `<Button variant="primary" href="#contact">Learn About Atlas II Integration</Button>`
  with `<Button variant="primary" href="/reserve">Reserve Units</Button>`

### DataCapabilities (`components/sections/DataCapabilities.tsx`)
- Replace the animated code mockup `<motion.div>` (RHS panel) with a `<video>` element
- `src="/video/capabilities-ex.mp4"`, `autoPlay`, `loop`, `playsInline`
- No `muted` attribute — plays with sound (browser may block on fresh load without prior interaction)
- Same rounded border and aspect styling as the removed mockup panel

---

## Button System (`components/ui/Button.tsx` + `app/globals.css`)

### Variants
| Variant | Use case | Tint |
|---|---|---|
| `primary` | Primary CTAs | Marine blue (`rgba(30,110,255,0.15)`) |
| `ghost` | Secondary / Login | No tint, pure glass |

The old `outline` variant is replaced by `ghost`.

### CSS (defined in `globals.css`)

```css
.glass-btn {
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(16px) saturate(180%);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: background 0.2s, border-color 0.2s;
}

/* Specular highlight — simulates Apple's top-edge light reflection */
.glass-btn::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.13),
    rgba(255, 255, 255, 0.02)
  );
  pointer-events: none;
}

.glass-btn:hover {
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.22);
}

/* Primary variant — marine blue tint */
.glass-btn-primary {
  background: rgba(30, 110, 255, 0.15);
  border-color: rgba(30, 110, 255, 0.3);
}

.glass-btn-primary:hover {
  background: rgba(30, 110, 255, 0.25);
  border-color: rgba(30, 110, 255, 0.45);
}
```

### Button component changes
- Accept both `href` (string, for `<Link>`) and standard button props
- Use `<Link href>` from `next/link` for internal navigation (replaces `<a href>`)
- Apply `glass-btn` + variant class based on `variant` prop
- Keep `forwardRef` pattern

---

## Reserve Page (`app/reserve/page.tsx`)

Layout: full-page centered, dark navy background matching site brand.

Content:
- NAVO logo (centered)
- Heading: "Reserve Vakaros Atlas II Units"
- Subtext: "Reservation system launching soon."
- Email input + "Notify Me" button (client-side state only, no backend)

---

## Files Created
- `app/capabilities/page.tsx`
- `app/contact/page.tsx`
- `app/reserve/page.tsx`
- `app/login/page.tsx` (empty placeholder)

## Files Modified
- `app/page.tsx`
- `app/globals.css`
- `components/ui/Button.tsx`
- `components/layout/Navbar.tsx`
- `components/sections/Hero.tsx`
- `components/sections/VakarosSection.tsx`
- `components/sections/DataCapabilities.tsx`

## Files Untouched (kept on disk, not rendered)
- `components/sections/RaceManagement.tsx`
- `components/sections/WhyNavo.tsx`
- `components/sections/ClosingCTA.tsx`

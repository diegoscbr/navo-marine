# Design System — NAVO Marine Technologies

## Product Context

What this is: B2B sailing technology platform — hardware, instrumentation, and data services for competitive racing teams.
Project type: Marketing site + storefront + protected dashboard
Visual reference: Saildrone + Stripe.dev — technical authority, not nautical lifestyle.
Tone: Precise, performance-focused. No maritime clichés. No lifestyle photography.

---

## Typography

| Role | Font | Fallback |
|------|------|----------|
| Headings (H1–H3) | Sansation | sans-serif |
| Body, nav, labels, UI | Raleway | sans-serif |

**Rules:**
- Do NOT use Geist, Inter, Roboto, or any Next.js boilerplate default. Remove `geistSans`/`geistMono` from `layout.tsx`.
- Do NOT let Times New Roman render — it means a font is missing its declaration.
- Only Sansation and Raleway should appear in the computed font stack.

### Type Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1 | 72px (desktop), 52px (mobile) | 600 | 1.2 | Hero headline only |
| H2 | 48px | 600 | 1.2 | Section headings |
| H3 | 28px | 600 | 1.3 | Sub-section headings |
| H4 | 18px | 600 | 1.4 | Card titles, labels |
| Body large | 18px | 400 | 1.6 | Intro paragraphs |
| Body | 16px | 400 | 1.5 | Default prose |
| Caption / label | 12px | 500 | 1.4 | Partner labels, metadata |

**Rules:**
- Never skip heading levels (H2 → H4 without H3).
- H2 (48px) → H3 (28px) → H4 (18px) — use all three levels.
- Minimum body text: 16px. Minimum label/caption: 12px.
- Body text: left-aligned. Only center headings and short standalone labels.
- H1 on mobile: add `text-wrap: balance` to control line breaks.

---

## Color

### Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-navy-900` | `#0B1F2A` | Primary background |
| `--color-navy-800` | `#0F2C3F` | Card/surface backgrounds |
| `--color-marine-500` | `#1E6EFF` | Primary CTA, logo, interactive elements |
| `--color-cyan-glow` | `#7AADFF` | Accent text (hero highlight), hover states |
| `--color-text-primary` | `rgba(255,255,255,0.85)` | Body text on dark backgrounds |
| `--color-text-muted` | `#757575` | Captions, secondary labels |
| `--color-glass-tint` | `rgba(30,110,255,0.18)` | Frosted glass card backgrounds |

**Rules:**
- No purple, violet, or indigo. Color scheme is navy → blue → cyan only.
- Text on dark backgrounds: use `rgba(255,255,255,0.85)`, never pure white `#FFFFFF` for body.
- Never encode meaning with color alone — add labels, icons, or patterns.
- Dark mode only — no light mode variant currently.

### Contrast Requirements (WCAG AA)
- Body text on `#0B1F2A`: minimum 4.5:1. Use `rgba(255,255,255,0.85)` → passes.
- Large text (18px+) on dark bg: minimum 3:1.
- UI components (buttons, inputs): minimum 3:1.
- Check low-opacity text carefully — `rgba(255,255,255,0.4)` on `#0B1F2A` will fail.

---

## Spacing

Base unit: **8px**

| Scale | Value | Usage |
|-------|-------|-------|
| 1 | 4px | Tight inline gaps |
| 2 | 8px | Default padding unit |
| 3 | 12px | Compact padding |
| 4 | 16px | Standard padding |
| 6 | 24px | Section inner padding |
| 8 | 32px | Card padding |
| 12 | 48px | Section gaps |
| 16 | 64px | Large section gaps |
| 24 | 96px | Hero vertical spacing |

**Rules:**
- All padding, margin, and gap values must be multiples of 4px.
- No arbitrary values (e.g., `padding: 13px` or `margin-top: 22px`).
- Related items: closer together. Distinct sections: further apart. Use spacing to communicate hierarchy.

---

## Layout

**Content max-width:** `max-w-5xl` (1024px) for body content, `max-w-3xl` (768px) for prose/forms.
**Grid:** 12-column. Cards and sections snap to grid.
**Gutters:** 24px mobile, 32px tablet, 48px desktop.

### Breakpoints

| Name | Width |
|------|-------|
| Mobile | 375px |
| Tablet | 768px |
| Desktop | 1024px |
| Wide | 1440px |

**Rules:**
- Mobile layout must make *design* sense — not just stacked desktop columns.
- No horizontal scroll at any breakpoint.
- Nav must collapse or adapt at mobile — 4 inline links + Login at 375px overflows.
- All pages use the standard `<Navbar>` + `<Footer>` layout. No exceptions (including `/reserve`).

---

## Components

### Buttons

| Variant | Class | Usage |
|---------|-------|-------|
| Primary | `glass-btn-primary` | Main CTA per page |
| Ghost | `glass-btn-ghost` | Secondary actions |
| Default | `glass-btn` | Tertiary, nav actions |

**Rules:**
- One primary CTA per viewport. Secondary actions use ghost or default.
- Minimum height: 44px. Minimum touch target: 44×44px. Never `display: inline` with `padding: 0`.
- Button labels are specific and active: "Reserve Units", "Explore Data Capabilities", "View Product" — not "Submit", "Continue", or "Click here".

### Navigation

- All nav links must have `padding: 12px 16px` minimum for 44px tap height.
- Active page: highlight with `--color-marine-500` or underline.
- Present on every page including `/reserve` and `/login`.

### Cards

- Background: `--color-glass-tint` or `--color-navy-800`
- Border: `1px solid rgba(255,255,255,0.08)`
- Border-radius: `12px` (cards), `8px` (inner elements), `6px` (buttons)
- Inner radius = outer radius − gap (for nested elements)
- No `border-left: 3px solid <accent>` colored left-border pattern.

---

## Motion

- **Enter:** `ease-out` easing
- **Exit:** `ease-in` easing
- **Move:** `ease-in-out` easing
- **Duration:** 150ms (micro), 300ms (standard), 500ms (page transitions). Nothing slower unless intentional.
- Only animate `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`.
- Respect `prefers-reduced-motion` — all animations must have a reduced-motion fallback.
- Never use `transition: all`.

---

## Anti-Patterns (Do Not Ship)

These are design choices that immediately signal "AI-generated template":

- ❌ Purple/violet/indigo gradient backgrounds
- ❌ 3-column feature grid: icon-in-colored-circle + bold title + 2-line description × 3
- ❌ Icons in colored circles as section decoration
- ❌ `text-align: center` on all content (headings + body + everything)
- ❌ Uniform large border-radius on every element
- ❌ Decorative blobs, floating circles, wavy SVG dividers
- ❌ Emoji as design elements in headings or bullets
- ❌ Colored left-border on cards (`border-left: 3px solid accent`)
- ❌ Generic hero copy ("Welcome to...", "Unlock the power of...", "Your all-in-one solution for...")
- ❌ Centered card with one button as a full page (Contact, Login should have more presence)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-16 | Baseline captured from live site | Inferred by /plan-design-review |
| 2026-03-16 | H3 set at 28px (was 18px in practice) | Close the gap between H2 (48px) and H4-level labels (18px) |
| 2026-03-16 | All pages must include standard `<Navbar>` | Reserve page was missing nav — breaks spatial continuity |
| 2026-03-16 | Nav links minimum `padding: 12px 16px` | Touch targets were 16px; 44px minimum required for mobile |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # prisma generate + next build
npm run start        # Production server
npm run lint         # ESLint
npm test             # Jest unit tests (80% coverage threshold enforced)
npx jest --testPathPattern=ComponentName  # Single test file
npm run test:e2e     # Playwright E2E tests
```

**Database:**
```bash
DATABASE_URL="file:./dev.db" npx prisma migrate deploy   # Apply migrations
npx prisma studio                                         # DB GUI
```

> `prisma.config.ts` loads `DATABASE_URL` from `.env.local` via dotenv, but CLI commands may need the env var set explicitly.

## Architecture

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Framer Motion, NextAuth v5-beta, Prisma + SQLite (better-sqlite3), Jest + React Testing Library, Playwright

### Route Structure

| Route | Purpose |
|---|---|
| `/` | Public landing page (Hero, sections) |
| `/products`, `/products/[slug]` | Storefront — data from `lib/commerce/products.ts` (hardcoded) |
| `/capabilities`, `/contact`, `/reserve` | Public marketing pages |
| `/login` | Google OAuth sign-in |
| `/dashboard` | Protected — requires auth |
| `/admin/*` | Protected — requires `@navomarine.com` email |

### Auth System

Two-file split is intentional — required by NextAuth v5 for edge middleware compatibility:

- `lib/auth.config.ts` — Edge-safe: Google provider, JWT session strategy, sign-in page. No DB imports.
- `lib/auth.ts` — Node.js only: extends `auth.config.ts` with Prisma adapter, adds session callback to attach `user.id`.
- `middleware.ts` — Uses `auth.config.ts` (not `auth.ts`) to protect `/dashboard` and `/admin` routes. Admin check: email must end in `@navomarine.com`.
- `lib/auth-guard.ts` — `requireAuth()` helper for server-side route protection.

### Data Layer

- `lib/db/products.ts` — Repository for the `Product` model (listProducts, getProduct, createProduct, updateProduct, deleteProduct). All write operations accept `ProductInput` which includes nested `options` and `addOns`.
- `lib/commerce/products.ts` — Hardcoded storefront products (currently Atlas 2). Used by `/products` pages. Separate from the DB-backed admin products.
- `lib/prisma.ts` — Singleton PrismaClient with `@prisma/adapter-better-sqlite3`. Generated client lives at `lib/generated/prisma/` (excluded from git, rebuilt on `npm run build`).

### Admin Product Management

Full CRUD at `/admin/products/*`. The `ProductForm` component handles a complex nested shape: a product has `options[]` (each with `values[]`) and `addOns[]`. These are serialized to JSON for Prisma's SQLite storage (`inTheBox` field is a JSON string).

### Storefront vs Admin Products

These are **two separate systems**:
- **Storefront** (`/products`): Hardcoded in `lib/commerce/products.ts`, type `StorefrontProduct`. Rich detail with specs, sections, images.
- **Admin** (`/admin/products`): DB-backed via Prisma. Intended for future dynamic storefront.

### Styling

Tailwind v4 — no `tailwind.config.ts`. All theme tokens in `app/globals.css` as CSS variables:
- `--color-navy-900: #0B1F2A`, `--color-navy-800: #0F2C3F`, `--color-marine-500: #1E6EFF`, `--color-cyan-glow: #00D4FF`
- `--font-heading: Sansation` (headlines), `--font-sans: Raleway` (body)
- `glass-btn`, `glass-btn-primary`, `glass-btn-ghost` — frosted glass button classes

### Testing

- `__tests__/components/` — component unit tests
- `__tests__/api/` — API route unit tests
- `__mocks__/framer-motion.tsx` — stubs all animation components
- `__mocks__/next-auth/react.tsx` — stubs `useSession`, `signOut`
- `e2e/` — Playwright E2E tests
- Coverage threshold: 80% lines (enforced by Jest)

## Brand & Design

**Tone:** Technical authority, not nautical lifestyle. Visual reference: Saildrone + Stripe.dev. No maritime clichés.

**Logo:** `public/logos/transparent_background_logo.png` (dark bg), `public/logos/black_background_logo.png` (light bg)

**Key docs:**
- `brandGuides/landing-page-prd.md` — full PRD, section specs, conversion goals, tone of voice
- `brandGuides/AGENTS.md` — contributor notes

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
- `/plan-ceo-review` — review a plan from a CEO/product perspective
- `/plan-eng-review` — review a plan from an engineering perspective
- `/review` — code review
- `/ship` — ship a feature end-to-end
- `/browse` — headless browser: navigate URLs, interact with elements, verify page state
- `/qa` — QA a feature with browser automation
- `/setup-browser-cookies` — configure browser session cookies
- `/retro` — run a retrospective

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

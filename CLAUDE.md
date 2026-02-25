# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

<!-- AUTO-GENERATED from package.json scripts -->
```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npx jest             # Jest unit tests (no test script yet — add one to package.json)
npx jest --testPathPattern=ComponentName     # Run a single test file
npx playwright test                          # Playwright E2E tests
npx playwright test e2e/inquiry-flow.spec.ts # Run a single E2E test
```

> `jest.config.ts` and `playwright.config.ts` have not been created yet. See `docs/plans/2026-02-24-landing-page.md` Phase 1, Task 2 for setup steps.
<!-- /AUTO-GENERATED -->

## Architecture

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Framer Motion, Jest + React Testing Library, Playwright

**Entry points:**
- `app/page.tsx` — assembles all section components in order
- `app/layout.tsx` — root layout with fonts, metadata, global wrapper
- `app/api/inquiry/route.ts` — POST handler for contact form submissions
- `app/globals.css` — Tailwind directives and base styles

**Component structure:**
- `components/sections/` — one file per landing page section (Hero, AuthorityStrip, CoreCapabilities, DataCapabilities, VakarosSection, RaceManagement, WhyNavo, ClosingCTA)
- `components/layout/` — Navbar, Footer
- `components/ui/` — shared primitives (Button, SectionHeader, InquiryForm)
- `lib/analytics.ts` — GA4 event helpers

**Testing layout:**
- `__tests__/components/` — unit tests for React components
- `__tests__/api/` — unit tests for API routes
- `e2e/` — Playwright E2E tests (critical user flow: inquiry form submission)

## Brand & Design Context

**Color tokens** (define in `app/globals.css` using Tailwind v4 CSS variables — no `tailwind.config.ts` with v4):
- Deep Navy: `#0B1F2A`
- Midnight Blue: `#0F2C3F`
- Electric Marine Blue: `#1E6EFF`
- Accent: cyan glow highlights

**Design principles:** Dark mode dominant, large negative space, grid precision, subtle Framer Motion animations. Visual reference: Saildrone authority + Stripe.dev technical clarity. Avoid nautical clichés and recreational/lifestyle tone.

**Logo assets:** `public/logos/` (sourced from `brandGuides/NAVO_LOGO/`)
- `transparent_background_logo.png` — for dark backgrounds
- `black_background_logo.png` — for light backgrounds

**Typography:** Inter or Neue Haas Grotesk (clean, modern sans-serif)

## Key Reference Docs

- `brandGuides/landing-page-prd.md` — full PRD: section specs, conversion goals, tone of voice, competitive benchmarks
- `docs/plans/2026-02-24-landing-page.md` — phased implementation plan with exact commands, file stubs, and TDD steps
- `brandGuides/AGENTS.md` — repo-level contributor notes

## Conversion Goals

Primary: partnership inquiry form submission. Secondary: capability PDF download, event service contact. Target: >3% form conversion, <50% bounce rate, >1:45 avg time on page.

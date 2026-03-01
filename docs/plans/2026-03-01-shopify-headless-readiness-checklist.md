# Shopify Headless Readiness Checklist

**Date:** 2026-03-01  
**Status:** Draft  
**Scope:** Prepare `navo-marine` to safely connect to a Shopify Storefront API backend.

---

## Current Repo Baseline

- Framework: Next.js App Router (`app/`)
- Language: TypeScript strict mode
- UI structure: `components/layout`, `components/sections`, `components/ui`
- Existing routes: `/`, `/capabilities`, `/contact`, `/reserve`, `/login`
- Test setup: Jest + Testing Library with 80% global line coverage threshold
- No commerce data layer, no product/collection routes, no cart/checkout integration yet

---

## Phase 0: Business and Shopify Decisions (Blockers)

- [ ] Confirm Shopify scope and rules before code:
  - Markets/currencies to support at launch
  - Tax and shipping behavior (Shopify-managed vs custom messaging)
  - Discount/coupon behavior
  - Inventory policy (hide out-of-stock vs backorder)
  - Account strategy (`classic` vs `new customer accounts`)
- [ ] Decide URL model:
  - `/products/[handle]`
  - `/collections/[handle]`
  - `/cart` (optional route if you want a full cart page)
- [ ] Confirm checkout strategy:
  - Redirect to hosted Shopify checkout from storefront cart
- [ ] Confirm analytics and events required at launch:
  - `view_item`, `add_to_cart`, `begin_checkout`

**Exit criteria:** all items above documented and approved.

---

## Phase 1: Foundation in This Repo

### 1.1 Environment and config

- [ ] Add `.env.example` with:
  - `SHOPIFY_STORE_DOMAIN`
  - `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
  - `SHOPIFY_STOREFRONT_API_VERSION`
  - `SHOPIFY_WEBHOOK_SECRET`
- [ ] Add `lib/shopify/config.ts` to validate and export required env values.
- [ ] Add startup-safe failure messages for missing env vars (fail fast in dev/build).

### 1.2 Shopify client and typed query layer

- [ ] Add `lib/shopify/client.ts` for Storefront API requests.
- [ ] Add `lib/shopify/fragments.ts` for reusable GraphQL fragments.
- [ ] Add `lib/shopify/queries.ts` for product, collection, cart, and search queries.
- [ ] Add `lib/shopify/mutations.ts` for cart operations (`create`, `linesAdd`, `linesUpdate`, `linesRemove`).
- [ ] Add `lib/shopify/types.ts` for API result typing.
- [ ] Add `lib/shopify/mappers.ts` to normalize Shopify responses into UI-safe shapes.

### 1.3 Caching primitives

- [ ] Add cache tags strategy in `lib/shopify/cache.ts` (example tags: `products`, `product:{handle}`, `collections`, `collection:{handle}`).
- [ ] Ensure all storefront fetches use explicit `next` cache metadata (`tags`, `revalidate`) to avoid accidental stale behavior.

**Exit criteria:** reusable API layer exists; no route component calls raw Shopify API directly.

---

## Phase 2: Commerce Routes and Page Contracts

### 2.1 Product detail route

- [ ] Create `app/products/[handle]/page.tsx`.
- [ ] Create `app/products/[handle]/loading.tsx`.
- [ ] Create `app/products/[handle]/not-found.tsx`.
- [ ] Create `app/products/[handle]/ProductGallery.tsx` (or `components/products/ProductGallery.tsx`).
- [ ] Implement `generateMetadata` in product page for SEO title/description/canonical.
- [ ] Ensure variant selection is supported from first iteration.

### 2.2 Collection route

- [ ] Create `app/collections/[handle]/page.tsx`.
- [ ] Add filtering/sorting contract (even if minimal launch scope).
- [ ] Add pagination strategy (cursor-based from Shopify).

### 2.3 Navigation and discoverability

- [ ] Update `components/layout/Navbar.tsx` with links to product/collection entry points.
- [ ] Add a lightweight collection index route if needed: `app/collections/page.tsx`.

**Exit criteria:** user can browse from navbar -> collections -> product detail.

---

## Phase 3: Cart and Checkout Flow

### 3.1 Cart persistence

- [ ] Create `lib/shopify/cart.ts` for cart id lifecycle.
- [ ] Persist cart id in secure cookie.
- [ ] Define behavior for expired/invalid cart id (auto-create replacement cart).

### 3.2 Cart APIs/server actions

- [ ] Add cart action surface (either route handlers or server actions):
  - Option A routes:
    - `app/api/cart/create/route.ts`
    - `app/api/cart/lines/add/route.ts`
    - `app/api/cart/lines/update/route.ts`
    - `app/api/cart/lines/remove/route.ts`
  - Option B server actions in `app/cart/actions.ts`
- [ ] Standardize error payload shape for UI handling.

### 3.3 Cart UI and checkout handoff

- [ ] Add cart UI components (suggested):
  - `components/cart/AddToCartButton.tsx`
  - `components/cart/CartDrawer.tsx` or `components/cart/CartPanel.tsx`
  - `components/cart/CartLineItem.tsx`
- [ ] Add `/cart` route if full-page cart is desired: `app/cart/page.tsx`.
- [ ] Implement `Begin Checkout` action to Shopify checkout URL.

**Exit criteria:** add/remove/update line items works and checkout redirect succeeds.

---

## Phase 4: Revalidation and Webhooks

### 4.1 Webhook endpoint

- [ ] Add `app/api/shopify/webhooks/route.ts`.
- [ ] Verify webhook HMAC using `SHOPIFY_WEBHOOK_SECRET`.
- [ ] Handle at least these topics:
  - products/update
  - products/delete
  - collections/update

### 4.2 Cache invalidation

- [ ] Trigger `revalidateTag`/`revalidatePath` by topic.
- [ ] Log invalidation events with enough detail for debugging.
- [ ] Add basic replay protection and bad-signature handling.

**Exit criteria:** product/collection updates in Shopify appear on site without manual redeploy.

---

## Phase 5: SEO, Content Mapping, and Metadata

- [ ] Add JSON-LD for product pages (`Product`, `Offer`) in `app/products/[handle]/page.tsx`.
- [ ] Ensure canonical URLs are consistent and absolute.
- [ ] Map Shopify fields to UI contracts:
  - title
  - description HTML/plain text
  - media
  - price/compare-at price
  - availability
- [ ] Add Open Graph metadata for product and collection pages.

**Exit criteria:** product pages render complete SEO metadata and structured data.

---

## Phase 6: Test Coverage and QA Gates

### 6.1 Unit/integration tests

- [ ] Add `__tests__/lib/shopify/client.test.ts`.
- [ ] Add `__tests__/lib/shopify/mappers.test.ts`.
- [ ] Add `__tests__/app/products/[handle].test.tsx`.
- [ ] Add `__tests__/app/collections/[handle].test.tsx`.
- [ ] Add `__tests__/components/cart/AddToCartButton.test.tsx`.
- [ ] Mock Shopify API responses in tests; avoid live network.

### 6.2 E2E critical path

- [ ] Add Playwright specs for:
  - collection -> product navigation
  - add to cart
  - checkout redirect
- [ ] Ensure e2e suite is deterministic with mock/staging data.

### 6.3 Required verification commands

- [ ] `npm run lint`
- [ ] `npm test -- --coverage`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (after Playwright config + environment setup)

**Exit criteria:** tests pass and coverage remains at/above configured threshold.

---

## Phase 7: Deployment and Operations Readiness

- [ ] Configure production env vars in hosting platform.
- [ ] Separate dev/staging/prod Shopify stores or access tokens.
- [ ] Add failure monitoring around Storefront API errors/timeouts.
- [ ] Add rate-limit aware retry strategy in Shopify client.
- [ ] Add runbook notes for:
  - rotating Storefront token
  - regenerating webhook secret
  - replaying webhook events in emergency

**Exit criteria:** deployment can be repeated with documented and secure config.

---

## Suggested File Additions (Initial Pass)

- `lib/shopify/config.ts`
- `lib/shopify/client.ts`
- `lib/shopify/cache.ts`
- `lib/shopify/fragments.ts`
- `lib/shopify/queries.ts`
- `lib/shopify/mutations.ts`
- `lib/shopify/types.ts`
- `lib/shopify/mappers.ts`
- `lib/shopify/cart.ts`
- `app/products/[handle]/page.tsx`
- `app/products/[handle]/loading.tsx`
- `app/products/[handle]/not-found.tsx`
- `app/collections/[handle]/page.tsx`
- `app/api/shopify/webhooks/route.ts`
- `components/cart/AddToCartButton.tsx`
- `components/cart/CartDrawer.tsx`
- `components/cart/CartLineItem.tsx`
- `__tests__/lib/shopify/client.test.ts`
- `__tests__/lib/shopify/mappers.test.ts`
- `__tests__/app/products/[handle].test.tsx`
- `__tests__/app/collections/[handle].test.tsx`
- `__tests__/components/cart/AddToCartButton.test.tsx`

---

## Definition of Done (Headless Connection Ready)

- [ ] Commerce routes exist and render Shopify data through a centralized data layer.
- [ ] Cart operations are stable and persisted across refreshes.
- [ ] Checkout redirect is working in staging.
- [ ] Webhooks revalidate stale product/collection pages.
- [ ] SEO metadata and structured data are present on product/collection pages.
- [ ] Lint, unit tests, coverage, and build pass in CI.
- [ ] Operational docs cover env setup, webhook setup, and token rotation.


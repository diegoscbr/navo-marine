# Phase 2: Storefront DB-Driven + Fleet Management

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Atlas 2 product page fully DB-driven from Supabase and build out complete fleet management (add/retire units, manual status override with paid-reservation validation, per-unit audit log).

**Architecture:** A new `lib/db/storefront.ts` repository fetches the full `StorefrontProduct` shape — sections, bullets, specs, box items, addons — mapping DB snake_case to the existing type so all product page components require zero changes. Fleet management adds two API routes (`/api/admin/units` and `/api/admin/units/[id]`) plus a unit detail page with status override form. The status override is blocked via a 409 when the unit has an active `reserved_paid` reservation.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

### Task 0: Capture missing migration 002 file

Migration 002 was applied to Supabase live but never committed to the repo. Fix this before proceeding.

**Files:**
- Create: `supabase/migrations/002_extend_products.sql`

- [ ] **Step 1: Write `supabase/migrations/002_extend_products.sql`**

```sql
-- Extend products table with admin-specific fields
ALTER TABLE products
  ADD COLUMN description        text,
  ADD COLUMN status             text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'archived')),
  ADD COLUMN manual_url         text,
  ADD COLUMN rental_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN rental_price_cents integer,
  ADD COLUMN late_fee_cents     integer,
  ADD COLUMN reserve_cutoff_days integer,
  ADD COLUMN requires_event_selection boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_sail_number     boolean NOT NULL DEFAULT false,
  ADD COLUMN in_the_box         jsonb NOT NULL DEFAULT '[]';

-- Product options (e.g., Color, Bundle variants)
CREATE TABLE product_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       text NOT NULL,
  required   boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE product_option_values (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id         uuid NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label             text NOT NULL,
  price_delta_cents integer NOT NULL DEFAULT 0,
  sort_order        integer NOT NULL DEFAULT 0
);

-- Add sort_order to product_addons join table
ALTER TABLE product_addons
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/002_extend_products.sql
git commit -m "chore(migrations): add missing 002_extend_products.sql to repo"
```

---

### Task 1: Seed Atlas 2 content into Supabase

**Files:**
- Create: `supabase/migrations/003_seed_atlas2_content.sql`

- [ ] **Step 1: Write `supabase/migrations/003_seed_atlas2_content.sql`**

```sql
DO $$
DECLARE
  p_id uuid := '6f303d86-5763-4ece-aaad-b78d17852f8a';
  s_accuracy uuid;
  s_compass  uuid;
  s_starting uuid;
  s_battery  uuid;
  g_sensors        uuid;
  g_core           uuid;
  g_display        uuid;
  g_battery_storage uuid;
  g_functions      uuid;
BEGIN

-- Box items
INSERT INTO product_box_items (product_id, item_name, sort_order) VALUES
  (p_id, 'Atlas 2',       0),
  (p_id, 'Mount',         1),
  (p_id, 'Carrying case', 2);

-- Section: accuracy
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'accuracy',
  'The most accurate instrument on the water. Ever.',
  'Atlas 2 is the first sailing instrument capable of dual-band L1 + L5 GNSS reception, designed to deliver positional accuracy in centimeters.',
  0)
RETURNING id INTO s_accuracy;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_accuracy, 'Optimized for L1 + L5 signals to reduce ionosphere and multi-path errors', 0),
  (s_accuracy, 'Multi-constellation reception: GPS, Galileo, GLONASS, and BeiDou', 1),
  (s_accuracy, '25Hz update rate for faster race-critical feedback', 2),
  (s_accuracy, 'Up to 25cm positional accuracy with RaceSense networks', 3);

-- Section: compass
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'compass',
  'A compass that understands what is happening.',
  'A highly sensitive magnetic package, advanced motion fusion, and adjustable damping keep heading data stable in rough conditions.',
  1)
RETURNING id INTO s_compass;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_compass, '0.1 degree heading resolution', 0),
  (s_compass, 'Gyro-stabilized output',         1),
  (s_compass, 'Motion fusion at 50Hz',           2),
  (s_compass, 'Reference angles to track shifts with confidence', 3);

-- Section: starting
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'starting',
  'Win the start, control the fleet.',
  'Distance-to-line and time-to-line outputs are tuned for tactical starting decisions so crews can hit the line with speed and timing.',
  2)
RETURNING id INTO s_starting;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_starting, 'Distance-to-line and time-to-line calculations', 0),
  (s_starting, 'Time-to-burn support for synchronized final approach', 1),
  (s_starting, 'Starting screens optimized for situational awareness', 2);

-- Section: battery
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'battery',
  '100+ hour battery, wirelessly rechargeable.',
  'Atlas 2 pairs Qi-compatible charging with long endurance so teams can run regatta schedules without constant battery management.',
  3)
RETURNING id INTO s_battery;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_battery, '100+ hour runtime', 0),
  (s_battery, '4600mAh integrated lithium-ion battery', 1),
  (s_battery, 'Fast top-up window supports all-day sessions', 2);

-- Spec group: Sensors
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Sensors', 0) RETURNING id INTO g_sensors;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_sensors, 'GNSS',          '25Hz L1 + L5 dual-band multi-constellation receiver', 0),
  (g_sensors, 'Motion',        '3-axis gyroscope and 3-axis accelerometer', 1),
  (g_sensors, 'Direction',     '3-axis magnetometer', 2),
  (g_sensors, 'Environmental', 'Ambient light and temperature sensors', 3);

-- Spec group: Core Measurements
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Core Measurements', 1) RETURNING id INTO g_core;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_core, 'Position + Velocity',    'High-frequency race telemetry', 0),
  (g_core, 'Heading / Heel / Pitch', 'Derived from stabilized fusion stack', 1),
  (g_core, 'Data Logging',           '10Hz internal logging support', 2);

-- Spec group: Display
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Display', 2) RETURNING id INTO g_display;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_display, 'Screen',     '4.4 inch transflective LCD, 320x240, 91ppi', 0),
  (g_display, 'Visibility', 'Sunlight-readable with 160 degree viewing cone', 1),
  (g_display, 'Lens',       'Optically bonded Gorilla Glass with AR + hydrophobic coating', 2);

-- Spec group: Battery + Storage
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Battery + Storage', 3) RETURNING id INTO g_battery_storage;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_battery_storage, 'Runtime',  '100+ hours typical usage', 0),
  (g_battery_storage, 'Charging', 'Qi-compatible wireless charging', 1),
  (g_battery_storage, 'Storage',  '256MB integrated storage for onboard logs', 2);

-- Spec group: Functions
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Functions', 4) RETURNING id INTO g_functions;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_functions, 'Starting',   'Distance-to-line, time-to-line, time-to-burn', 0),
  (g_functions, 'Race Tools', 'Countdown timer, shift tracking, stripchart, VMG', 1);

END $$;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `fdjuhjadjqkpqnpxgmue`
- `name`: `003_seed_atlas2_content`
- `query`: the SQL above

- [ ] **Step 3: Verify counts**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM product_sections        WHERE product_id = '6f303d86-5763-4ece-aaad-b78d17852f8a') AS sections,
  (SELECT count(*) FROM product_spec_groups     WHERE product_id = '6f303d86-5763-4ece-aaad-b78d17852f8a') AS spec_groups,
  (SELECT count(*) FROM product_box_items       WHERE product_id = '6f303d86-5763-4ece-aaad-b78d17852f8a') AS box_items;
-- expect: sections=4, spec_groups=5, box_items=3
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_seed_atlas2_content.sql
git commit -m "chore(seed): add Atlas 2 sections, specs, and box items to Supabase"
```

---

### Task 2: `lib/db/storefront.ts` — fetch StorefrontProduct from Supabase

**Files:**
- Create: `lib/db/storefront.ts`
- Create: `__tests__/lib/db/storefront.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/db/storefront.test.ts
import { getStorefrontProductBySlug, listStorefrontProducts } from '@/lib/db/storefront'

const mockChain = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: mockChain,
}))

const mockProductRow = {
  id: 'prod-1',
  slug: 'atlas-2',
  name: 'Vakaros Atlas 2',
  subtitle: 'The most accurate instrument',
  description_short: 'Short desc',
  base_price_cents: 124900,
  currency: 'usd',
  tax_included: true,
  manual_url: 'https://support.vakaros.com/',
  rental_enabled: true,
  rental_price_cents: 24500,
  late_fee_cents: 3500,
  reserve_cutoff_days: 14,
  requires_event_selection: true,
  requires_sail_number: true,
  product_sections: [
    {
      section_key: 'accuracy',
      heading: 'Most accurate ever',
      body_markdown: 'Body text',
      sort_order: 0,
      product_feature_bullets: [{ bullet_text: 'Bullet 1', sort_order: 0 }],
    },
  ],
  product_spec_groups: [
    {
      group_name: 'Sensors',
      sort_order: 0,
      product_specs: [{ label: 'GNSS', value: '25Hz', sort_order: 0 }],
    },
  ],
  product_box_items: [{ item_name: 'Atlas 2', sort_order: 0 }],
  product_addons: [
    {
      sort_order: 0,
      addons: {
        id: 'addon-1',
        slug: 'vakaros-care-warranty',
        name: 'Vakaros Care Warranty',
        description: 'Coverage',
        price_cents: 20000,
        addon_type: 'warranty',
      },
    },
  ],
}

beforeEach(() => jest.clearAllMocks())

describe('getStorefrontProductBySlug', () => {
  it('maps DB row to StorefrontProduct', async () => {
    mockChain.single.mockResolvedValueOnce({ data: mockProductRow, error: null })
    const result = await getStorefrontProductBySlug('atlas-2')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('atlas-2')
    expect(result!.pricing.amountCents).toBe(124900)
    expect(result!.sections).toHaveLength(1)
    expect(result!.sections[0].bullets).toHaveLength(1)
    expect(result!.techSpecs).toHaveLength(1)
    expect(result!.inTheBox).toEqual(['Atlas 2'])
    expect(result!.addOns).toHaveLength(1)
    expect(result!.addOns[0].slug).toBe('vakaros-care-warranty')
    expect(result!.rentalPolicy?.requiresEventSelection).toBe(true)
    expect(result!.rentalPolicy?.requiresSailNumber).toBe(true)
  })

  it('returns null when product not found', async () => {
    mockChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    })
    const result = await getStorefrontProductBySlug('nonexistent')
    expect(result).toBeNull()
  })
})

describe('listStorefrontProducts', () => {
  it('returns mapped products array', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [mockProductRow], error: null })
    const results = await listStorefrontProducts()
    expect(results).toHaveLength(1)
    expect(results[0].slug).toBe('atlas-2')
  })

  it('returns empty array when no active products', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [], error: null })
    const results = await listStorefrontProducts()
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest __tests__/lib/db/storefront.test.ts
```
Expected: `Cannot find module '@/lib/db/storefront'`

- [ ] **Step 3: Implement `lib/db/storefront.ts`**

```ts
import { supabaseAdmin } from '@/lib/db/client'
import type { StorefrontProduct } from '@/lib/commerce/types'

const STOREFRONT_SELECT = `
  id, slug, name, subtitle, description_short,
  base_price_cents, currency, tax_included,
  manual_url, rental_enabled, rental_price_cents,
  late_fee_cents, reserve_cutoff_days,
  requires_event_selection, requires_sail_number,
  product_sections (
    section_key, heading, body_markdown, sort_order,
    product_feature_bullets ( bullet_text, sort_order )
  ),
  product_spec_groups (
    group_name, sort_order,
    product_specs ( label, value, sort_order )
  ),
  product_box_items ( item_name, sort_order ),
  product_addons (
    sort_order,
    addons ( id, slug, name, description, price_cents, addon_type )
  )
` as const

type DBProductRow = {
  id: string
  slug: string
  name: string
  subtitle: string | null
  description_short: string | null
  base_price_cents: number
  currency: string
  tax_included: boolean
  manual_url: string | null
  rental_enabled: boolean
  rental_price_cents: number | null
  late_fee_cents: number | null
  reserve_cutoff_days: number | null
  requires_event_selection: boolean
  requires_sail_number: boolean
  product_sections: Array<{
    section_key: string
    heading: string
    body_markdown: string | null
    sort_order: number
    product_feature_bullets: Array<{ bullet_text: string; sort_order: number }>
  }>
  product_spec_groups: Array<{
    group_name: string
    sort_order: number
    product_specs: Array<{ label: string; value: string; sort_order: number }>
  }>
  product_box_items: Array<{ item_name: string; sort_order: number }>
  product_addons: Array<{
    sort_order: number
    addons: {
      id: string
      slug: string
      name: string
      description: string | null
      price_cents: number
      addon_type: string
    }
  }>
}

function toStorefrontProduct(row: DBProductRow): StorefrontProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle ?? undefined,
    descriptionShort: row.description_short ?? '',
    pricing: {
      amountCents: row.base_price_cents,
      currency: 'usd',
      taxIncluded: row.tax_included,
    },
    inTheBox: [...row.product_box_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.item_name),
    sections: [...row.product_sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        key: s.section_key,
        heading: s.heading,
        body: s.body_markdown ?? '',
        bullets: [...s.product_feature_bullets]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => b.bullet_text),
      })),
    techSpecs: [...row.product_spec_groups]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({
        group: g.group_name,
        rows: [...g.product_specs]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ label: s.label, value: s.value })),
      })),
    addOns: [...row.product_addons]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pa) => ({
        id: pa.addons.id,
        slug: pa.addons.slug,
        name: pa.addons.name,
        description: pa.addons.description ?? undefined,
        priceCents: pa.addons.price_cents,
        addonType: pa.addons.addon_type as 'warranty' | 'accessory' | 'service',
      })),
    ...(row.rental_enabled && row.rental_price_cents != null
      ? {
          rentalPolicy: {
            rentalPriceCents: row.rental_price_cents,
            lateFeeCents: row.late_fee_cents ?? 0,
            reserveCutoffDays: row.reserve_cutoff_days ?? 14,
            statuses: ['in_stock', 'inventory_on_the_way', 'out_of_stock'] as const,
            requiresEventSelection: row.requires_event_selection as true,
            requiresSailNumber: row.requires_sail_number as true,
          },
        }
      : {}),
    support: { manualUrl: row.manual_url ?? '' },
  }
}

export async function getStorefrontProductBySlug(
  slug: string,
): Promise<StorefrontProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(STOREFRONT_SELECT)
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getStorefrontProductBySlug: ${error.message}`)
  }
  return toStorefrontProduct(data as unknown as DBProductRow)
}

export async function listStorefrontProducts(): Promise<StorefrontProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(STOREFRONT_SELECT)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listStorefrontProducts: ${error.message}`)
  return (data as unknown as DBProductRow[]).map(toStorefrontProduct)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest __tests__/lib/db/storefront.test.ts
```
Expected: 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/db/storefront.ts __tests__/lib/db/storefront.test.ts
git commit -m "feat(storefront): add Supabase repository for storefront product queries"
```

---

### Task 3: Switch product pages from hardcoded to DB

**Files:**
- Modify: `app/products/[slug]/page.tsx`
- Modify: `app/products/page.tsx`

- [ ] **Step 1: Update `app/products/[slug]/page.tsx`**

Replace `getProductBySlug` from `@/lib/commerce/products` with `getStorefrontProductBySlug` from `@/lib/db/storefront`. Remove `generateStaticParams` — the page becomes fully dynamic. Update `generateMetadata` accordingly.

```ts
// Remove:
import { getProductBySlug } from '@/lib/commerce/products'
// Add:
import { getStorefrontProductBySlug } from '@/lib/db/storefront'

// Remove the entire generateStaticParams function

// Update generateMetadata:
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getStorefrontProductBySlug(slug)
  if (!product) return { title: 'Product Not Found | NAVO Marine Technologies' }
  return {
    title: `${product.name} | NAVO Marine Technologies`,
    description: product.descriptionShort,
  }
}

// Update page body — replace getProductBySlug(slug) with:
const product = await getStorefrontProductBySlug(slug)
```

All child components (`ProductPurchasePanel`, `ProductInfoCards`, `ProductTechSpecs`, `ProductImageGallery`) accept `StorefrontProduct` — no changes needed there.

- [ ] **Step 2: Update `app/products/page.tsx`**

```ts
// Remove:
import { storefrontProducts } from '@/lib/commerce/products'
// Add:
import { listStorefrontProducts } from '@/lib/db/storefront'

// Make component async, fetch from DB:
export default async function ProductsPage() {
  const products = await listStorefrontProducts()
  // Template unchanged — listStorefrontProducts() returns StorefrontProduct[],
  // the same type as storefrontProducts, so no template changes are needed.
```

- [ ] **Step 3: Run build to check TypeScript**

```bash
npm run build
```
Expected: clean build, `/products/[slug]` now listed as `ƒ (Dynamic)` instead of `● (SSG)`

- [ ] **Step 4: Smoke test**

```bash
npm run dev
# Visit http://localhost:3000/products/atlas-2
# Verify: name, 4 sections with bullets, tech specs (5 groups), addons render from DB
# Visit http://localhost:3000/products
# Verify: Atlas 2 card renders with correct price and description
```

- [ ] **Step 5: Commit**

```bash
git add app/products/[slug]/page.tsx app/products/page.tsx
git commit -m "feat(storefront): product pages now DB-driven via Supabase"
```

---

### Task 4: Fleet API routes — add unit, status override, retire

**Files:**
- Create: `app/api/admin/units/route.ts`
- Create: `app/api/admin/units/[id]/route.ts`
- Create: `__tests__/api/admin/units.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/admin/units.test.ts
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  chain.select = jest.fn().mockReturnValue(chain)
  chain.insert = jest.fn().mockReturnValue(chain)
  chain.update = jest.fn().mockReturnValue(chain)
  chain.eq = jest.fn().mockReturnValue(chain)
  chain.in = jest.fn().mockReturnValue(chain)
  chain.is = jest.fn().mockReturnValue(chain)
  chain.order = jest.fn().mockReturnValue(chain)
  return chain
}

const adminSession = { user: { id: 'admin-1', email: 'test@navomarine.com' } }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/admin/units', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ navo_number: 'NAVO-041', product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates a unit and returns 201', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const insertChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', navo_number: 'NAVO-041', status: 'available' },
        error: null,
      }),
    })
    const auditChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(insertChain)  // units insert
      .mockReturnValueOnce(auditChain)   // unit_events insert
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ navo_number: 'NAVO-041', product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('returns 400 when navo_number is missing', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const { POST } = await import('@/app/api/admin/units/route')
    const req = new NextRequest('http://localhost/api/admin/units', {
      method: 'POST',
      body: JSON.stringify({ product_id: 'prod-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/units/[id]', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValueOnce({ user: { email: 'user@gmail.com' } })
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'override' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 409 when unit has an active paid reservation', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const reservationChain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'res-1' }, error: null }),
    })
    supabaseAdmin.from.mockReturnValueOnce(reservationChain)
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'override' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(409)
  })

  it('updates status and returns 200', async () => {
    auth.mockResolvedValueOnce(adminSession)
    const noReservation = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const currentUnitChain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { status: 'in_transit' }, error: null }),
    })
    const updateChain = makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: 'unit-1', navo_number: 'NAVO-001', status: 'available', notes: null },
        error: null,
      }),
    })
    const auditChain = makeChain()
    supabaseAdmin.from
      .mockReturnValueOnce(noReservation)   // reservation check
      .mockReturnValueOnce(currentUnitChain) // get current status
      .mockReturnValueOnce(updateChain)      // update
      .mockReturnValueOnce(auditChain)       // unit_events insert
    const { PATCH } = await import('@/app/api/admin/units/[id]/route')
    const req = new NextRequest('http://localhost/api/admin/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'available', notes: 'Checked in' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unit-1' }) })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest __tests__/api/admin/units.test.ts
```
Expected: `Cannot find module '@/app/api/admin/units/route'`

- [ ] **Step 3: Implement `app/api/admin/units/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, navo_number, serial_number, status, notes, added_at, products(id, name, slug)')
    .is('retired_at', null)
    .order('navo_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ units: data })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    navo_number: string
    product_id: string
    serial_number?: string
    notes?: string
  }

  if (!body.navo_number || !body.product_id) {
    return NextResponse.json({ error: 'navo_number and product_id are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('units')
    .insert({
      navo_number: body.navo_number,
      product_id: body.product_id,
      serial_number: body.serial_number ?? null,
      notes: body.notes ?? null,
      status: 'available',
    })
    .select('id, navo_number, serial_number, status, notes, added_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Unit number already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const unitId = (data as { id: string }).id
  await supabaseAdmin.from('unit_events').insert({
    unit_id: unitId,
    event_type: 'status_changed',
    from_status: null,
    to_status: 'available',
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: 'Unit added to fleet',
  })

  return NextResponse.json({ unit: data }, { status: 201 })
}
```

- [ ] **Step 4: Implement `app/api/admin/units/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { status: string; notes?: string }

  if (!body.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  // Block override to 'available' if unit has an active paid reservation
  if (body.status === 'available') {
    const { data: activeRes } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('unit_id', id)
      .in('status', ['reserved_paid'])
      .maybeSingle()

    if (activeRes) {
      return NextResponse.json(
        {
          error:
            'Cannot mark unit available: it has an active paid reservation. Cancel the reservation first.',
        },
        { status: 409 },
      )
    }
  }

  // Fetch current status for audit log
  const { data: currentUnit } = await supabaseAdmin
    .from('units')
    .select('status')
    .eq('id', id)
    .single()

  const fromStatus = (currentUnit as { status: string } | null)?.status ?? null

  const { data, error } = await supabaseAdmin
    .from('units')
    .update({ status: body.status, notes: body.notes ?? null })
    .eq('id', id)
    .select('id, navo_number, status, notes')
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabaseAdmin.from('unit_events').insert({
    unit_id: id,
    event_type: 'status_changed',
    from_status: fromStatus,
    to_status: body.status,
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: body.notes ?? 'Manual status override',
  })

  return NextResponse.json({ unit: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Block retire if unit has any active reservation
  const { data: activeRes } = await supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('unit_id', id)
    .in('status', ['reserved_unpaid', 'reserved_paid'])
    .maybeSingle()

  if (activeRes) {
    return NextResponse.json(
      { error: 'Cannot retire unit: it has an active reservation. Cancel it first.' },
      { status: 409 },
    )
  }

  const { data: currentUnit } = await supabaseAdmin
    .from('units')
    .select('status')
    .eq('id', id)
    .single()

  const { error } = await supabaseAdmin
    .from('units')
    .update({ retired_at: new Date().toISOString(), status: 'sold' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('unit_events').insert({
    unit_id: id,
    event_type: 'status_changed',
    from_status: (currentUnit as { status: string } | null)?.status ?? null,
    to_status: 'sold',
    actor_type: 'admin',
    actor_id: session.user?.id ?? null,
    notes: 'Unit retired from fleet',
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest __tests__/api/admin/units.test.ts
```
Expected: 5 tests passing

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/units/route.ts app/api/admin/units/[id]/route.ts __tests__/api/admin/units.test.ts
git commit -m "feat(fleet): API routes for unit management (add, status override, retire)"
```

---

### Task 5: Unit detail page — audit log + status override form

**Files:**
- Create: `app/admin/fleet/[id]/UnitStatusForm.tsx`
- Create: `app/admin/fleet/[id]/page.tsx`

- [ ] **Step 1: Implement `app/admin/fleet/[id]/UnitStatusForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const STATUSES = [
  'available',
  'reserved_unpaid',
  'reserved_paid',
  'in_transit',
  'at_event',
  'returned',
  'damaged',
  'lost',
  'sold',
] as const

type Props = { unitId: string; currentStatus: string }

export function UnitStatusForm({ unitId, currentStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState(currentStatus)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const fieldClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none focus:ring-1 focus:ring-marine-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    startTransition(async () => {
      const res = await fetch(`/api/admin/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Something went wrong.')
        return
      }
      setSuccess(true)
      setNotes('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/40">
          New status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClass}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/40">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={fieldClass}
          placeholder="Reason for status change"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Status updated.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || status === currentStatus}
        className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-400 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Update status'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Implement `app/admin/fleet/[id]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/db/client'
import { UnitStatusForm } from './UnitStatusForm'

export const metadata: Metadata = { title: 'Unit | NAVO Admin' }

const STATUS_STYLES: Record<string, string> = {
  available:       'bg-emerald-500/15 text-emerald-400',
  reserved_unpaid: 'bg-yellow-500/15 text-yellow-400',
  reserved_paid:   'bg-blue-500/15 text-blue-400',
  in_transit:      'bg-purple-500/15 text-purple-400',
  at_event:        'bg-cyan-500/15 text-cyan-400',
  returned:        'bg-white/10 text-white/50',
  damaged:         'bg-red-500/15 text-red-400',
  lost:            'bg-red-500/20 text-red-500',
  sold:            'bg-white/5 text-white/30',
}

type UnitRow = {
  id: string
  navo_number: string
  serial_number: string | null
  status: string
  notes: string | null
  added_at: string
  retired_at: string | null
  products: { name: string } | null
}

type AuditRow = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_type: string
  notes: string | null
  created_at: string
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [unitResult, auditResult] = await Promise.all([
    supabaseAdmin
      .from('units')
      .select('id, navo_number, serial_number, status, notes, added_at, retired_at, products(name)')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('unit_events')
      .select('id, event_type, from_status, to_status, actor_type, notes, created_at')
      .eq('unit_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (unitResult.error || !unitResult.data) notFound()

  const unit = unitResult.data as unknown as UnitRow
  const events = (auditResult.data ?? []) as unknown as AuditRow[]

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/fleet" className="text-xs text-white/40 hover:text-white/70">
          ← Fleet
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <h1 className="font-heading font-mono text-2xl font-semibold text-white">
            {unit.navo_number}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[unit.status] ?? 'bg-white/10 text-white/50'}`}
          >
            {unit.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/40">{unit.products?.name}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Audit log */}
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
            Audit log
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-white/30">No events recorded.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white/80">
                      {e.from_status ? (
                        <>
                          {e.from_status.replace(/_/g, ' ')}
                          {' → '}
                          {e.to_status?.replace(/_/g, ' ')}
                        </>
                      ) : (
                        e.event_type.replace(/_/g, ' ')
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-white/30">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  {e.notes && <p className="mt-1 text-xs text-white/40">{e.notes}</p>}
                  <p className="mt-1 text-xs text-white/25">{e.actor_type}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status override */}
          {!unit.retired_at && (
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">
                Status override
              </h2>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <UnitStatusForm unitId={unit.id} currentStatus={unit.status} />
              </div>
            </div>
          )}

          {/* Unit metadata */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Details
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Serial</span>
                <span className="font-mono text-white/60">{unit.serial_number ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Added</span>
                <span className="text-white/60">
                  {new Date(unit.added_at).toLocaleDateString()}
                </span>
              </div>
              {unit.retired_at && (
                <div className="flex justify-between">
                  <span className="text-white/40">Retired</span>
                  <span className="text-white/60">
                    {new Date(unit.retired_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run build**

```bash
npm run build
```
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add app/admin/fleet/[id]/page.tsx app/admin/fleet/[id]/UnitStatusForm.tsx
git commit -m "feat(fleet): unit detail page with audit log and status override"
```

---

### Task 6: Update fleet list — Add Unit button + unit links

**Files:**
- Create: `app/admin/fleet/AddUnitForm.tsx`
- Modify: `app/admin/fleet/page.tsx`

- [ ] **Step 1: Implement `app/admin/fleet/AddUnitForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Product = { id: string; name: string }
type Props = { products: Product[] }

export function AddUnitForm({ products }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [navoNumber, setNavoNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [error, setError] = useState('')

  const fieldClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none'

  function reset() {
    setNavoNumber('')
    setSerialNumber('')
    setNotes('')
    setError('')
    setOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/admin/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          navo_number: navoNumber,
          product_id: productId,
          serial_number: serialNumber || undefined,
          notes: notes || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Failed to add unit.')
        return
      }
      reset()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-400"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add unit
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">Add unit</h3>
      <div className="grid grid-cols-2 gap-3">
        {products.length > 1 && (
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-white/40">Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={fieldClass}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-white/40">Unit number *</label>
          <input
            required
            value={navoNumber}
            onChange={(e) => setNavoNumber(e.target.value)}
            className={fieldClass}
            placeholder="NAVO-041"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/40">Serial number</label>
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className={fieldClass}
            placeholder="Optional"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-white/40">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
            placeholder="Optional"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add unit'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-white/40 hover:text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Update `app/admin/fleet/page.tsx`**

Replace the entire file with a version that:
1. Fetches active products directly (not from unit rows) for `AddUnitForm`
2. Filters retired units (`retired_at IS NULL`)
3. Includes `products(id, name, slug)` in the unit select
4. Links each unit's navo_number to `/admin/fleet/[id]`
5. Shows Add Unit form in the header

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/db/client'
import { AddUnitForm } from './AddUnitForm'

export const metadata: Metadata = { title: 'Fleet | NAVO Admin' }

const STATUS_STYLES: Record<string, string> = {
  available:       'bg-emerald-500/15 text-emerald-400',
  reserved_unpaid: 'bg-yellow-500/15 text-yellow-400',
  reserved_paid:   'bg-blue-500/15 text-blue-400',
  in_transit:      'bg-purple-500/15 text-purple-400',
  at_event:        'bg-cyan-500/15 text-cyan-400',
  returned:        'bg-white/10 text-white/50',
  damaged:         'bg-red-500/15 text-red-400',
  lost:            'bg-red-500/20 text-red-500',
  sold:            'bg-white/5 text-white/30',
}

type UnitRow = {
  id: string
  navo_number: string
  serial_number: string | null
  status: string
  notes: string | null
  added_at: string
  products: { id: string; name: string; slug: string } | null
}

type ProductRow = { id: string; name: string }

export default async function AdminFleetPage() {
  const [unitsResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from('units')
      .select('id, navo_number, serial_number, status, notes, added_at, products(id, name, slug)')
      .is('retired_at', null)
      .order('navo_number'),
    supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('active', true)
      .order('name'),
  ])

  if (unitsResult.error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-red-400">Failed to load fleet: {unitsResult.error.message}</p>
      </div>
    )
  }

  const units = (unitsResult.data ?? []) as unknown as UnitRow[]
  const products = (productsResult.data ?? []) as unknown as ProductRow[]

  const statusCounts = units.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Fleet</h1>
          <p className="mt-1 text-sm text-white/40">
            {units.length} active unit{units.length !== 1 ? 's' : ''}
          </p>
        </div>
        <AddUnitForm products={products} />
      </div>

      {/* Status summary */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span
              key={status}
              className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-white/10 text-white/50'}`}
            >
              {status.replace(/_/g, ' ')} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      {units.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No active units in fleet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Serial</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {units.map((u) => (
                <tr key={u.id} className="bg-white/[0.02] transition-colors hover:bg-white/5">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/fleet/${u.id}`}
                      className="font-mono text-white hover:text-marine-400"
                    >
                      {u.navo_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-white/60">{u.products?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status] ?? 'bg-white/10 text-white/50'}`}
                    >
                      {u.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-white/40">
                    {u.serial_number ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-xs text-white/40">{u.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all suites pass

- [ ] **Step 4: Run build**

```bash
npm run build
```
Expected: clean build

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Manually verify the Phase 2 E2E gate:
- `/products/atlas-2` — sections, tech specs, and in-the-box render from DB
- `/products` — Atlas 2 card shows correct price and description from DB
- `/admin/fleet` — 40 units listed, "Add unit" button visible
- Add `NAVO-041` → appears in list immediately
- Click `NAVO-041` → detail page shows audit log entry "Unit added to fleet"
- Change `NAVO-041` status to `damaged` with notes → audit log shows the transition
- Change a `reserved_paid` unit to `available` → red error: "Cannot mark unit available..."

- [ ] **Step 6: Final commit**

```bash
git add app/admin/fleet/AddUnitForm.tsx app/admin/fleet/page.tsx
git commit -m "feat(fleet): add unit form, unit detail links, filter retired units from list"
```

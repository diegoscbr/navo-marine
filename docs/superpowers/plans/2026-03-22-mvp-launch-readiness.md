# MVP Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 5 launch blockers — email confirmation, admin event management, admin unit assignment, admin KPI dashboard, and webhook integration tests — so the first customer booking can complete end-to-end.

**Architecture:** Each blocker is a self-contained slice. Email is a new `lib/email/` module wired non-fatally into checkout handlers and webhook fulfillment. Admin features extend existing pages and add new API routes following the established `requireAdmin()` local-function pattern. Webhook integration tests use real HMAC via `generateTestHeaderString` alongside mocked Supabase.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase (`supabaseAdmin`), Stripe SDK, `googleapis` (new — install in Task 1), Jest + React Testing Library, Playwright (not required here)

---

## Pre-flight Checks

Before starting, read and confirm:

- `supabase/migrations/005_phase_4_5_schema.sql` — verify `reserved_authorized` is in the `status` CHECK constraint and `extra_days` column exists on `reservations`
- `app/api/admin/products/route.ts` — confirm the local `requireAdmin()` pattern you must replicate in every new admin API route
- `__tests__/api/webhooks/stripe.test.ts` — understand existing webhook test to avoid module registry conflicts with the new integration test file

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `lib/email/gmail.ts` | Gmail API client: `sendEmail(to, subject, htmlBody)` |
| `lib/email/templates.ts` | HTML templates: `bookingPending()`, `bookingConfirmed()` |
| `app/api/admin/events/route.ts` | GET list + POST create rental events |
| `app/api/admin/events/[id]/route.ts` | PATCH update + DELETE rental event |
| `app/admin/events/page.tsx` | Server component: events list + inline AddEventForm |
| `app/admin/events/[id]/page.tsx` | Server component: event detail with capacity edit form |
| `app/admin/events/AddEventForm.tsx` | `'use client'` — add event form, POSTs to /api/admin/events |
| `app/api/admin/reservations/[id]/assign/route.ts` | PATCH: assign unit_id to reservation |
| `app/admin/reservations/AssignUnitDropdown.tsx` | `'use client'` — unit dropdown, POSTs to assign route |
| `__tests__/lib/email/gmail.test.ts` | Unit tests for sendEmail |
| `__tests__/lib/email/templates.test.ts` | Unit tests for email templates |
| `__tests__/api/admin/events.test.ts` | API tests for events routes |
| `__tests__/api/admin/reservations-assign.test.ts` | API tests for assign route |
| `__tests__/api/webhook.test.ts` | Integration tests using `generateTestHeaderString` |

### Modified Files

| File | Change |
|------|--------|
| `lib/checkout/handlers/rental-event.ts` | Fire-and-forget `bookingPending` after reservation insert |
| `lib/checkout/handlers/rental-custom.ts` | Fire-and-forget `bookingPending` after reservation insert |
| `lib/checkout/handlers/regatta-package.ts` | Fire-and-forget `bookingPending` after reservation insert |
| `lib/stripe/webhook.ts` | Extend SELECT for email data; fire-and-forget `bookingConfirmed` after order insert; add warning log for unknown `reservation_type` |
| `app/admin/page.tsx` | Replace redirect with KPI server component |
| `app/admin/reservations/page.tsx` | Fetch units; add Assign Unit column + `AssignUnitDropdown` per row |
| `app/admin/layout.tsx` | Add Events nav link |

---

## Blocker 1: Email Confirmation

### Task 1: Install googleapis and create Gmail client

**Files:**
- Create: `lib/email/gmail.ts`
- Create: `__tests__/lib/email/gmail.test.ts`

- [ ] **Step 1: Install googleapis**

```bash
npm install googleapis
```

Expected: `package.json` updated with `"googleapis": "^..."`.

- [ ] **Step 2: Write the failing tests**

Create `__tests__/lib/email/gmail.test.ts`:

```typescript
jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({ authorizeAsync: jest.fn() })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({ data: { id: 'msg_001' } }),
        },
      },
    }),
  },
}))

import { sendEmail } from '@/lib/email/gmail'
import { google } from 'googleapis'

const mockGmailSend = (google.gmail({} as never) as ReturnType<typeof google.gmail>).users.messages.send as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GMAIL_SERVICE_ACCOUNT_KEY = JSON.stringify({
    type: 'service_account',
    client_email: 'noreply@navo-marine.iam.gserviceaccount.com',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----\n',
  })
  process.env.GMAIL_FROM_ADDRESS = 'noreply@navomarine.com'
})

it('calls gmail.users.messages.send with a base64url-encoded raw message', async () => {
  await sendEmail('captain@test.com', 'Test Subject', '<p>Hello</p>')
  expect(mockGmailSend).toHaveBeenCalledTimes(1)
  const call = mockGmailSend.mock.calls[0][0]
  expect(call.userId).toBe('me')
  const decoded = Buffer.from(call.requestBody.raw, 'base64').toString('utf-8')
  expect(decoded).toContain('To: captain@test.com')
  expect(decoded).toContain('Subject: Test Subject')
  expect(decoded).toContain('<p>Hello</p>')
})

it('throws when GMAIL_SERVICE_ACCOUNT_KEY is not set', async () => {
  delete process.env.GMAIL_SERVICE_ACCOUNT_KEY
  await expect(sendEmail('a@b.com', 'S', 'B')).rejects.toThrow('GMAIL_SERVICE_ACCOUNT_KEY')
})

it('throws when GMAIL_FROM_ADDRESS is not set', async () => {
  delete process.env.GMAIL_FROM_ADDRESS
  await expect(sendEmail('a@b.com', 'S', 'B')).rejects.toThrow('GMAIL_FROM_ADDRESS')
})
```

- [ ] **Step 3: Run tests — expect FAIL (module not found)**

```bash
npx jest --testPathPattern=__tests__/lib/email/gmail
```

Expected: FAIL — `Cannot find module '@/lib/email/gmail'`

- [ ] **Step 4: Create `lib/email/gmail.ts`**

```typescript
// lib/email/gmail.ts
import { google } from 'googleapis'

function getAuth() {
  const keyJson = process.env.GMAIL_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GMAIL_SERVICE_ACCOUNT_KEY is not set')

  const fromAddress = process.env.GMAIL_FROM_ADDRESS
  if (!fromAddress) throw new Error('GMAIL_FROM_ADDRESS is not set')

  const key = JSON.parse(keyJson) as { client_email: string; private_key: string }

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: fromAddress,
  })
}

function makeRaw(to: string, subject: string, htmlBody: string): string {
  const from = process.env.GMAIL_FROM_ADDRESS!
  const message = [
    `From: NAVO Marine <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n')

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: makeRaw(to, subject, htmlBody) },
  })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/lib/email/gmail
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/email/gmail.ts __tests__/lib/email/gmail.test.ts package.json package-lock.json
git commit -m "feat: add Gmail API email client"
```

---

### Task 2: Email templates

**Files:**
- Create: `lib/email/templates.ts`
- Create: `__tests__/lib/email/templates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/email/templates.test.ts`:

```typescript
import { bookingPending, bookingConfirmed } from '@/lib/email/templates'

const base = {
  to: 'sailor@test.com',
  reservationId: 'res-abc-123',
  productName: 'Atlas 2 Rental',
  startDate: '2026-04-10',
  endDate: '2026-04-14',
  totalCents: 24500,
}

describe('bookingPending', () => {
  it('returns correct to/subject', () => {
    const result = bookingPending(base)
    expect(result.to).toBe('sailor@test.com')
    expect(result.subject).toContain('processing')
  })

  it('html contains product name, dates, amount, reservationId', () => {
    const { html } = bookingPending(base)
    expect(html).toContain('Atlas 2 Rental')
    expect(html).toContain('2026-04-10')
    expect(html).toContain('2026-04-14')
    expect(html).toContain('$245.00')
    expect(html).toContain('res-abc-123')
  })

  it('handles null dates gracefully', () => {
    const { html } = bookingPending({ ...base, startDate: null, endDate: null })
    expect(html).toContain('See event details')
  })
})

describe('bookingConfirmed', () => {
  it('returns correct to/subject', () => {
    const result = bookingConfirmed({ ...base, orderId: 'order-xyz' })
    expect(result.to).toBe('sailor@test.com')
    expect(result.subject).toContain('confirmed')
  })

  it('html contains all required fields including orderId', () => {
    const { html } = bookingConfirmed({ ...base, orderId: 'order-xyz' })
    expect(html).toContain('Atlas 2 Rental')
    expect(html).toContain('2026-04-10')
    expect(html).toContain('2026-04-14')
    expect(html).toContain('$245.00')
    expect(html).toContain('res-abc-123')
    expect(html).toContain('order-xyz')
  })

  it('handles null dates gracefully', () => {
    const { html } = bookingConfirmed({ ...base, startDate: null, endDate: null, orderId: 'o' })
    expect(html).toContain('See event details')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern=__tests__/lib/email/templates
```

Expected: FAIL — `Cannot find module '@/lib/email/templates'`

- [ ] **Step 3: Create `lib/email/templates.ts`**

```typescript
// lib/email/templates.ts

type BookingParams = {
  to: string
  reservationId: string
  productName: string
  startDate: string | null
  endDate: string | null
  totalCents: number
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDates(start: string | null, end: string | null): string {
  return start && end ? `${start} to ${end}` : 'See event details'
}

export function bookingPending(params: BookingParams): { to: string; subject: string; html: string } {
  const { to, reservationId, productName, startDate, endDate, totalCents } = params
  return {
    to,
    subject: 'Your NAVO booking is being processed',
    html: `
      <h2>Booking Received</h2>
      <p>Thank you for booking with NAVO Marine. Complete your payment to confirm this booking.</p>
      <ul>
        <li><strong>Package:</strong> ${productName}</li>
        <li><strong>Dates:</strong> ${formatDates(startDate, endDate)}</li>
        <li><strong>Amount:</strong> ${formatAmount(totalCents)}</li>
        <li><strong>Booking ID:</strong> ${reservationId}</li>
      </ul>
      <p>You will receive a confirmation email once payment is processed.</p>
    `,
  }
}

export function bookingConfirmed(
  params: BookingParams & { orderId: string },
): { to: string; subject: string; html: string } {
  const { to, reservationId, productName, startDate, endDate, totalCents, orderId } = params
  return {
    to,
    subject: 'Your NAVO booking is confirmed',
    html: `
      <h2>Booking Confirmed</h2>
      <p>Payment received. Your booking is confirmed.</p>
      <ul>
        <li><strong>Package:</strong> ${productName}</li>
        <li><strong>Dates:</strong> ${formatDates(startDate, endDate)}</li>
        <li><strong>Amount Paid:</strong> ${formatAmount(totalCents)}</li>
        <li><strong>Booking ID:</strong> ${reservationId}</li>
        <li><strong>Order:</strong> ${orderId}</li>
      </ul>
      <p>The NAVO team will be in touch with next steps.</p>
    `,
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/lib/email/templates
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates.ts __tests__/lib/email/templates.test.ts
git commit -m "feat: add email templates (bookingPending, bookingConfirmed)"
```

---

### Task 3: Wire `bookingPending` into checkout handlers

**Important:** Email must NOT block checkout. Use `void sendEmail(...).catch(err => console.error(...))` — the `void` keyword is required to satisfy `@typescript-eslint/no-floating-promises`.

**Files:**
- Modify: `lib/checkout/handlers/rental-event.ts`
- Modify: `lib/checkout/handlers/rental-custom.ts`
- Modify: `lib/checkout/handlers/regatta-package.ts`
- Modify: `__tests__/api/checkout.test.ts` (add email mock + assertion)

- [ ] **Step 1: Add `sendEmail` mock to `__tests__/api/checkout.test.ts`**

Open `__tests__/api/checkout.test.ts`. At the top with the other mocks, add:

```typescript
jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/email/templates', () => ({
  bookingPending: jest.fn().mockReturnValue({ to: 'a@b.com', subject: 'S', html: 'H' }),
}))
```

Then add an assertion in the success test (the test that reaches the reservation insert):

```typescript
import { sendEmail } from '@/lib/email/gmail'
// ...
it('fires bookingPending email after successful reservation', async () => {
  // reuse the happy-path setup that reaches the reservation insert
  // ...
  expect(sendEmail).toHaveBeenCalledWith(
    expect.any(String), // to
    expect.stringContaining('processing'), // subject
    expect.any(String), // html
  )
})
```

- [ ] **Step 2: Run the new test — expect FAIL**

```bash
npx jest --testPathPattern=__tests__/api/checkout
```

Expected: the new `fires bookingPending email` test FAILS (sendEmail not imported in handlers yet). Existing tests should still pass.

- [ ] **Step 3: Modify `lib/checkout/handlers/rental-event.ts`**

Add import at the top:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { bookingPending } from '@/lib/email/templates'
```

After the `if (insertError)` block (line ~123), before the `return { status: 200, ... }`:

```typescript
  // Fire-and-forget confirmation email — never blocks checkout
  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId: (reservation as { id: string }).id,
    productName: 'Atlas 2 Rental',
    startDate: event?.start_date ?? null,
    endDate: event?.end_date ?? null,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (rental-event) failed:', err))
```

- [ ] **Step 4: Modify `lib/checkout/handlers/rental-custom.ts`**

Add the same imports. After the `if (insertError)` block, before `return { status: 200, ... }`:

```typescript
  // Fire-and-forget confirmation email — never blocks checkout
  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId: (reservation as { id: string }).id,
    productName: 'Atlas 2 Rental',
    startDate: window?.start_date ?? null,
    endDate: window?.end_date ?? null,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (rental-custom) failed:', err))
```

(`window` is the `date_windows` query result already in scope — `const window = windowResult.data` on line 63)

- [ ] **Step 5: Modify `lib/checkout/handlers/regatta-package.ts`**

Add the same imports. Place the email call **after** `await insertReservationUnits(...)` (line 196) and before `return { status: 200, ... }`.

**Important:** `reservationId` is assigned only on line 193, after `insertReservationUnits`. The email call must come after that assignment or use the reservation object directly.

```typescript
  // Fire-and-forget confirmation email — never blocks checkout
  const pendingEmail = bookingPending({
    to: session.user.email ?? '',
    reservationId: reservationId,        // in scope after line 193
    productName: product.name,
    startDate: input.start_date,
    endDate: input.end_date,
    totalCents,
  })
  void sendEmail(pendingEmail.to, pendingEmail.subject, pendingEmail.html)
    .catch((err) => console.error('[email] bookingPending (regatta-package) failed:', err))
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/api/checkout
```

Expected: PASS. The new email assertion should now pass.

- [ ] **Step 7: Commit**

```bash
git add lib/checkout/handlers/rental-event.ts \
        lib/checkout/handlers/rental-custom.ts \
        lib/checkout/handlers/regatta-package.ts \
        __tests__/api/checkout.test.ts
git commit -m "feat: fire bookingPending email after checkout session created"
```

---

### Task 4: Wire `bookingConfirmed` into webhook fulfillment

**Files:**
- Modify: `lib/stripe/webhook.ts`
- Modify: `__tests__/api/webhooks/stripe.test.ts` (add email mock + assertion)

**Key rule:** Email fires only after the order insert succeeds (step 3 in `fulfillCheckoutSession`). Never fires if the order insert fails. Never causes a 500.

- [ ] **Step 1: Add email mock to `__tests__/api/webhooks/stripe.test.ts`**

At the top with other mocks:

```typescript
jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/email/templates', () => ({
  bookingConfirmed: jest.fn().mockReturnValue({ to: 'a@b.com', subject: 'S', html: 'H' }),
}))
```

Add an assertion in the existing `'returns 200 on success'` test or as a new test:

```typescript
it('fires bookingConfirmed email after order is created', async () => {
  const { sendEmail } = require('@/lib/email/gmail') as { sendEmail: jest.Mock }
  setupHappyPath()
  const { POST } = await import('@/app/api/webhooks/stripe/route')
  await POST(makeRequest('{}'))
  expect(sendEmail).toHaveBeenCalledTimes(1)
})

it('does not fire bookingConfirmed email when order creation fails', async () => {
  const { sendEmail } = require('@/lib/email/gmail') as { sendEmail: jest.Mock }
  // Set up so order insert fails
  supabaseAdmin.from
    .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })) // idempotency
    .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: { id: RESERVATION_ID, user_id: USER_ID, unit_id: null, total_cents: 24500, customer_email: 'sailor@test.com', products: { name: 'Atlas 2' }, start_date: null, end_date: null }, error: null }) })) // reservation found
    .mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })) // reservation update
    .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }) })) // order insert FAILS

  stripe.webhooks.constructEvent.mockReturnValue(
    makeStripeEvent('checkout.session.completed', makeCompletedSession())
  )
  const { POST } = await import('@/app/api/webhooks/stripe/route')
  await POST(makeRequest('{}'))
  expect(sendEmail).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run these new tests — expect FAIL**

```bash
npx jest --testPathPattern=__tests__/api/webhooks/stripe
```

Expected: the new email tests FAIL. All existing tests should still pass.

- [ ] **Step 3: Modify `lib/stripe/webhook.ts`**

Add imports at the top:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { bookingConfirmed } from '@/lib/email/templates'
```

Extend the reservation SELECT to include email data:

```typescript
  const { data: reservation, error: resErr } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, unit_id, total_cents, customer_email, start_date, end_date, products(name)')
    .eq('stripe_checkout_session_id', sessionId)
    .single()
```

Update the type cast at the top of the function (or let TypeScript infer). After the order insert `if (orderErr)` block and before the unit update block, add the email call:

```typescript
  // Fire-and-forget booking confirmation email — never causes 500
  const confirmedEmail = bookingConfirmed({
    to: (reservation as { customer_email: string }).customer_email,
    reservationId: (reservation as { id: string }).id,
    productName: (reservation as { products: { name: string } | null }).products?.name ?? 'NAVO Booking',
    startDate: (reservation as { start_date: string | null }).start_date,
    endDate: (reservation as { end_date: string | null }).end_date,
    totalCents: (reservation as { total_cents: number }).total_cents,
    orderId: (order as { id: string }).id,
  })
  void sendEmail(confirmedEmail.to, confirmedEmail.subject, confirmedEmail.html)
    .catch((err) => console.error('[email] bookingConfirmed failed:', err))
```

Also add the unknown-reservation-type warning. Inside `fulfillCheckoutSession`, `session` is already the function parameter. Add after the reservation lookup:

```typescript
  // Warn on unknown reservation_type — still process normally (fulfillment is by session ID)
  const knownTypes = ['rental_event', 'rental_custom', 'regatta_package', 'purchase']
  const rType = session.metadata?.reservation_type
  if (rType && !knownTypes.includes(rType)) {
    console.warn(`[webhook] Unknown reservation_type in metadata: "${rType}" for session ${sessionId}`)
  }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/api/webhooks/stripe
```

Expected: PASS (all tests including new email assertions)

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/webhook.ts __tests__/api/webhooks/stripe.test.ts
git commit -m "feat: fire bookingConfirmed email after order created in webhook"
```

---

## Blocker 2: Admin Event Management

### Task 5: Admin Events API routes (TDD)

**Files:**
- Create: `app/api/admin/events/route.ts`
- Create: `app/api/admin/events/[id]/route.ts`
- Create: `__tests__/api/admin/events.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/events.test.ts`:

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

import { NextRequest } from 'next/server'
const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }
const { auth } = require('@/lib/auth') as { auth: jest.Mock }

const ADMIN_EMAIL = 'admin@navomarine.com'

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  Object.assign(chain, overrides)
  for (const key of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { email: ADMIN_EMAIL } })
})

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/events', {
    method,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/admin/events', () => {
  it('returns 401 for non-admin', async () => {
    auth.mockResolvedValue({ user: { email: 'hacker@gmail.com' } })
    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns events list', async () => {
    const events = [{ id: 'e1', name: 'Spring Regatta', start_date: '2026-04-10', end_date: '2026-04-12' }]
    supabaseAdmin.from.mockReturnValueOnce(makeChain({ order: jest.fn().mockResolvedValue({ data: events, error: null }) }))
    const { GET } = await import('@/app/api/admin/events/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual(events)
  })
})

describe('POST /api/admin/events', () => {
  it('creates a rental event and product allocation', async () => {
    const newEvent = { id: 'e2', name: 'New Event' }
    supabaseAdmin.from
      .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: newEvent, error: null }) })) // insert event
      .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: { id: 'ep1' }, error: null }) })) // insert rental_event_products
    const { POST } = await import('@/app/api/admin/events/route')
    const res = await POST(req('POST', {
      name: 'New Event',
      location: 'San Francisco Bay',
      start_date: '2026-05-01',
      end_date: '2026-05-03',
      product_id: 'prod-uuid-001',
      capacity: 5,
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/admin/events/route')
    const res = await POST(req('POST', { name: 'Incomplete' }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/events/[id]', () => {
  it('updates an event', async () => {
    const updated = { id: 'e1', name: 'Updated Name' }
    supabaseAdmin.from.mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: updated, error: null }) }))
    const { PATCH } = await import('@/app/api/admin/events/[id]/route')
    const patchReq = new NextRequest('http://localhost/api/admin/events/e1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    })
    const res = await PATCH(patchReq, { params: { id: 'e1' } })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/events/[id]', () => {
  it('deletes an event', async () => {
    supabaseAdmin.from.mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }))
    const { DELETE } = await import('@/app/api/admin/events/[id]/route')
    const delReq = new NextRequest('http://localhost/api/admin/events/e1', { method: 'DELETE' })
    const res = await DELETE(delReq, { params: { id: 'e1' } })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern=__tests__/api/admin/events
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create `app/api/admin/events/route.ts`**

```typescript
// app/api/admin/events/route.ts
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

  const { data: events, error } = await supabaseAdmin
    .from('rental_events')
    .select(`
      id, name, location, event_url, start_date, end_date, active,
      rental_event_products ( product_id, capacity, products ( name ) )
    `)
    .order('start_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: events ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    location?: string
    start_date?: string
    end_date?: string
    product_id?: string
    capacity?: number
    rental_price_per_day_cents?: number
  }

  if (!body.name || !body.start_date || !body.end_date || !body.product_id || body.capacity == null) {
    return NextResponse.json(
      { error: 'name, start_date, end_date, product_id, and capacity are required' },
      { status: 400 },
    )
  }

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('rental_events')
    .insert({
      name: body.name,
      location: body.location ?? null,
      start_date: body.start_date,
      end_date: body.end_date,
      rental_price_per_day_cents: body.rental_price_per_day_cents ?? null,
      active: true,
    })
    .select('id, name, start_date, end_date')
    .single()

  if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 })

  const { error: allocationErr } = await supabaseAdmin
    .from('rental_event_products')
    .insert({
      event_id: (event as { id: string }).id,
      product_id: body.product_id,
      capacity: body.capacity,
      rental_price_cents: 0,
      late_fee_cents: 0,
      reserve_cutoff_days: 0,
      inventory_status: 'available',
    })
    .select('id')
    .single()

  if (allocationErr) return NextResponse.json({ error: allocationErr.message }, { status: 500 })

  return NextResponse.json({ event }, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/admin/events/[id]/route.ts`**

```typescript
// app/api/admin/events/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

const ADMIN_DOMAIN = '@navomarine.com'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null
  return session
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Record<string, unknown>
  const allowed = ['name', 'location', 'start_date', 'end_date', 'active', 'rental_price_per_day_cents']
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, name, start_date, end_date, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('rental_events')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/api/admin/events
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/events/ __tests__/api/admin/events.test.ts
git commit -m "feat: add admin events API (GET, POST, PATCH, DELETE)"
```

---

### Task 6: Admin Events pages + sidebar link

**Files:**
- Create: `app/admin/events/page.tsx`
- Create: `app/admin/events/AddEventForm.tsx`
- Create: `app/admin/events/[id]/page.tsx`
- Modify: `app/admin/layout.tsx`

No TDD for server components — these render DB-fetched data. Test the form component manually via the running app (Stripe Sandbox Testing T8).

- [ ] **Step 1: Create `app/admin/events/AddEventForm.tsx`**

```tsx
// app/admin/events/AddEventForm.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Product = { id: string; name: string }

export function AddEventForm({ products }: { products: Product[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const body = {
      name: form.get('name') as string,
      location: form.get('location') as string,
      start_date: form.get('start_date') as string,
      end_date: form.get('end_date') as string,
      product_id: form.get('product_id') as string,
      capacity: Number(form.get('capacity')),
    }
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Failed to create event')
      return
    }
    router.refresh()
    ;(e.target as HTMLFormElement).reset()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-4 font-heading text-lg font-semibold text-white">Add Event</h2>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-white/50">Event Name</label>
          <input name="name" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/50">Location</label>
          <input name="location" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/50">Start Date</label>
          <input name="start_date" type="date" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/50">End Date</label>
          <input name="end_date" type="date" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/50">Product</label>
          <select name="product_id" required className="w-full rounded-lg border border-white/10 bg-navy-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500">
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/50">Capacity</label>
          <input name="capacity" type="number" min="1" required defaultValue="1" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-marine-500" />
        </div>
      </div>
      <button type="submit" disabled={loading} className="mt-4 glass-btn-primary px-4 py-2 text-sm disabled:opacity-50">
        {loading ? 'Creating…' : 'Create Event'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create `app/admin/events/page.tsx`**

```tsx
// app/admin/events/page.tsx
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/db/client'
import { AddEventForm } from './AddEventForm'

export const metadata: Metadata = { title: 'Events | NAVO Admin' }

export default async function AdminEventsPage() {
  const [eventsResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from('rental_events')
      .select('id, name, location, start_date, end_date, active, rental_event_products ( product_id, capacity )')
      .order('start_date', { ascending: false }),
    supabaseAdmin
      .from('products')
      .select('id, name')
      .order('name'),
  ])

  if (eventsResult.error) {
    return <p className="text-sm text-red-400">Failed to load events: {eventsResult.error.message}</p>
  }

  const events = (eventsResult.data ?? []) as Array<{
    id: string
    name: string
    location: string | null
    start_date: string
    end_date: string
    active: boolean
    rental_event_products: Array<{ product_id: string; capacity: number }>
  }>

  const products = (productsResult.data ?? []) as Array<{ id: string; name: string }>

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Events</h1>
        <p className="mt-1 text-sm text-white/40">{events.length} event{events.length !== 1 ? 's' : ''}</p>
      </div>

      <AddEventForm products={products} />

      {events.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No events yet. Add one above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {events.map((e) => (
                <tr key={e.id} className="bg-white/[0.02] hover:bg-white/5">
                  <td className="px-5 py-3 text-white/80">{e.name}</td>
                  <td className="px-5 py-3 text-white/50">{e.location ?? '—'}</td>
                  <td className="px-5 py-3 text-white/50 text-xs">{e.start_date} → {e.end_date}</td>
                  <td className="px-5 py-3 text-white/60">
                    {e.rental_event_products.map((p) => p.capacity).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${e.active ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/30'}`}>
                      {e.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
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

- [ ] **Step 3: Create `app/admin/events/[id]/page.tsx`**

```tsx
// app/admin/events/[id]/page.tsx
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/db/client'

export default async function AdminEventDetailPage({ params }: { params: { id: string } }) {
  const { data: event, error } = await supabaseAdmin
    .from('rental_events')
    .select('id, name, location, start_date, end_date, active, rental_event_products ( product_id, capacity, products ( name ) )')
    .eq('id', params.id)
    .single()

  if (error || !event) notFound()

  const e = event as {
    id: string; name: string; location: string | null
    start_date: string; end_date: string; active: boolean
    rental_event_products: Array<{ product_id: string; capacity: number; products: { name: string } | null }>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-semibold text-white">{e.name}</h1>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 space-y-2">
        <p><span className="text-white/40">Location:</span> {e.location ?? '—'}</p>
        <p><span className="text-white/40">Dates:</span> {e.start_date} → {e.end_date}</p>
        <p><span className="text-white/40">Status:</span> {e.active ? 'Active' : 'Inactive'}</p>
      </div>
      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold text-white">Product Allocations</h2>
        {e.rental_event_products.length === 0 ? (
          <p className="text-sm text-white/40">No products allocated.</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-white/40">
                  <th className="px-5 py-3 text-left">Product</th>
                  <th className="px-5 py-3 text-left">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {e.rental_event_products.map((p) => (
                  <tr key={p.product_id} className="border-b border-white/5 bg-white/[0.02]">
                    <td className="px-5 py-3 text-white/70">{p.products?.name ?? p.product_id}</td>
                    <td className="px-5 py-3 text-white/60">{p.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add Events link to `app/admin/layout.tsx`**

In the `<nav>` section of `app/admin/layout.tsx`, after the Reservations `<Link>` and before the Fleet `<Link>`:

```tsx
          <Link
            href="/admin/events"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM12 15h.008v.008H12V15zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM9.75 15h.008v.008H9.75V15zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            Events
          </Link>
```

- [ ] **Step 5: Run build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: No TypeScript errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add app/admin/events/ app/admin/layout.tsx
git commit -m "feat: add admin events pages and sidebar link"
```

---

## Blocker 3: Admin Unit Assignment

### Task 7: Unit Assignment API (TDD)

**Files:**
- Create: `app/api/admin/reservations/[id]/assign/route.ts`
- Create: `__tests__/api/admin/reservations-assign.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/reservations-assign.test.ts`:

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

import { NextRequest } from 'next/server'
const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }
const { auth } = require('@/lib/auth') as { auth: jest.Mock }

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  Object.assign(chain, overrides)
  for (const key of ['select', 'update', 'eq']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { email: 'admin@navomarine.com' } })
})

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/reservations/res-1/assign', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

it('returns 401 for non-admin', async () => {
  auth.mockResolvedValue({ user: { email: 'hacker@gmail.com' } })
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({ unit_id: 'unit-1' }), { params: { id: 'res-1' } })
  expect(res.status).toBe(401)
})

it('assigns a unit to a reservation', async () => {
  const updated = { id: 'res-1', unit_id: 'unit-1' }
  supabaseAdmin.from.mockReturnValueOnce(
    makeChain({ single: jest.fn().mockResolvedValue({ data: updated, error: null }) })
  )
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({ unit_id: 'unit-1' }), { params: { id: 'res-1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.reservation.unit_id).toBe('unit-1')
})

it('returns 400 when unit_id is missing', async () => {
  const { PATCH } = await import('@/app/api/admin/reservations/[id]/assign/route')
  const res = await PATCH(req({}), { params: { id: 'res-1' } })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern=__tests__/api/admin/reservations-assign
```

- [ ] **Step 3: Create `app/api/admin/reservations/[id]/assign/route.ts`**

```typescript
// app/api/admin/reservations/[id]/assign/route.ts
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
  { params }: { params: { id: string } },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { unit_id?: string | null }

  if (body.unit_id === undefined) {
    return NextResponse.json({ error: 'unit_id is required (pass null to unassign)' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({ unit_id: body.unit_id, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, unit_id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservation: data })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern=__tests__/api/admin/reservations-assign
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/reservations/ __tests__/api/admin/reservations-assign.test.ts
git commit -m "feat: add admin unit assignment API (PATCH reservations/[id]/assign)"
```

---

### Task 8: Unit Assignment UI

**Files:**
- Create: `app/admin/reservations/AssignUnitDropdown.tsx`
- Modify: `app/admin/reservations/page.tsx`

- [ ] **Step 1: Create `app/admin/reservations/AssignUnitDropdown.tsx`**

```tsx
// app/admin/reservations/AssignUnitDropdown.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Unit = { id: string; serial_number: string; status: string }

export function AssignUnitDropdown({
  reservationId,
  currentUnitId,
  units,
}: {
  reservationId: string
  currentUnitId: string | null
  units: Unit[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const unit_id = e.target.value || null
    setLoading(true)
    await fetch(`/api/admin/reservations/${reservationId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <select
      defaultValue={currentUnitId ?? ''}
      onChange={handleChange}
      disabled={loading}
      className="rounded border border-white/10 bg-navy-800 px-2 py-1 text-xs text-white/70 disabled:opacity-50"
    >
      <option value="">— unassigned —</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.serial_number}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Modify `app/admin/reservations/page.tsx`**

At the top, add import:

```typescript
import { AssignUnitDropdown } from './AssignUnitDropdown'
```

Extend the Supabase query to include `unit_id`:

```typescript
  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_email, status, start_date, end_date, total_cents, created_at, unit_id, products(name)')
    .order('created_at', { ascending: false })
    .limit(100)
```

After the reservations query, add a units fetch:

```typescript
  const { data: units } = await supabaseAdmin
    .from('units')
    .select('id, serial_number, status')
    .order('serial_number')
```

Update the `Reservation` type to include `unit_id`:

```typescript
type Reservation = {
  id: string
  customer_email: string
  status: string
  start_date: string | null
  end_date: string | null
  total_cents: number
  created_at: string
  unit_id: string | null
  products: { name: string } | null
}
```

Update the `<thead>` row — add a new `<th>` after "Total":

```tsx
                <th className="px-5 py-3">Unit</th>
```

Update each `<tr>` in `<tbody>` — add a new `<td>` after the Total cell:

```tsx
                  <td className="px-5 py-3">
                    <AssignUnitDropdown
                      reservationId={r.id}
                      currentUnitId={r.unit_id}
                      units={(units ?? []) as Array<{ id: string; serial_number: string; status: string }>}
                    />
                  </td>
```

- [ ] **Step 3: Run build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/reservations/
git commit -m "feat: add unit assignment dropdown to reservations page"
```

---

## Blocker 4: Admin KPI Dashboard

### Task 9: Admin KPI Dashboard

**Files:**
- Modify: `app/admin/page.tsx`

Replace the current redirect-only file with a server component that queries KPI data.

- [ ] **Step 1: Replace `app/admin/page.tsx`**

Read the current file (it's 3 lines — a redirect). Replace entirely:

```tsx
// app/admin/page.tsx
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/db/client'

export const metadata: Metadata = { title: 'Dashboard | NAVO Admin' }

function KpiCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 font-heading text-3xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/30">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboardPage() {
  const [unitsResult, reservationsResult, recentResult] = await Promise.all([
    supabaseAdmin.from('units').select('status'),
    supabaseAdmin.from('reservations').select('status'),
    supabaseAdmin
      .from('reservations')
      .select('id, customer_email, status, total_cents, created_at, products(name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const units = (unitsResult.data ?? []) as Array<{ status: string }>
  const reservations = (reservationsResult.data ?? []) as Array<{ status: string }>
  const recent = (recentResult.data ?? []) as Array<{
    id: string
    customer_email: string
    status: string
    total_cents: number
    created_at: string
    products: { name: string } | null
  }>

  // Unit KPIs
  const unitsAvailable = units.filter((u) => u.status === 'available').length
  const unitsOut = units.filter((u) => u.status === 'reserved_paid').length
  const unitsDamaged = units.filter((u) => u.status === 'damaged').length

  // Reservation KPIs
  const resPending = reservations.filter((r) => r.status === 'reserved_unpaid').length
  const resConfirmed = reservations.filter((r) => r.status === 'reserved_paid').length
  const resHold = reservations.filter((r) => r.status === 'reserved_authorized').length

  const STATUS_STYLES: Record<string, string> = {
    reserved_unpaid: 'bg-yellow-500/15 text-yellow-400',
    reserved_authorized: 'bg-amber-500/15 text-amber-400',
    reserved_paid: 'bg-green-500/15 text-green-400',
    cancelled: 'bg-red-500/15 text-red-400',
    completed: 'bg-blue-500/15 text-blue-400',
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Dashboard</h1>
      </div>

      {/* Fleet KPIs */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Fleet</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Available" value={unitsAvailable} />
          <KpiCard label="Out on Rental" value={unitsOut} />
          <KpiCard label="Damaged" value={unitsDamaged} />
        </div>
      </section>

      {/* Reservation KPIs */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Reservations</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Pending (unpaid)" value={resPending} />
          <KpiCard label="Confirmed" value={resConfirmed} />
          <KpiCard label="Hold Authorized" value={resHold} sub="awaiting capture" />
        </div>
      </section>

      {/* Recent Bookings */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Recent Bookings</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-white/40">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Package</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recent.map((r) => (
                  <tr key={r.id} className="bg-white/[0.02] hover:bg-white/5">
                    <td className="px-5 py-3 text-white/70">{r.customer_email}</td>
                    <td className="px-5 py-3 text-white/60">{r.products?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-white/10 text-white/50'}`}>
                        {r.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/70">${(r.total_cents / 100).toFixed(2)}</td>
                    <td className="px-5 py-3 text-white/40 text-xs">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: add admin KPI dashboard (fleet status, reservation counts, recent bookings)"
```

---

## Blocker 5: Webhook Integration Tests

### Task 10: Webhook integration tests using `generateTestHeaderString`

**Background:** The existing `__tests__/api/webhooks/stripe.test.ts` mocks `constructEvent`. This new test file exercises the real HMAC signature verification path using `generateTestHeaderString`.

**Critical setup notes:**
- Include `/** @jest-environment node */` — `crypto.createHmac` is unavailable in jsdom
- The test secret is a plain string — do NOT add a `whsec_` prefix before passing to both `generateTestHeaderString` and `process.env.STRIPE_WEBHOOK_SECRET`; the Stripe library does not strip prefixes
- Mock `@/lib/stripe/client` with a real Stripe instance so `constructEvent` runs for real HMAC verification
- Keep `supabaseAdmin` mocked as in existing tests

**Files:**
- Create: `__tests__/api/webhook.test.ts`
- Modify: `lib/stripe/webhook.ts` (add unknown-type warning — already done in Task 4)

- [ ] **Step 1: Create `__tests__/api/webhook.test.ts`**

```typescript
/**
 * @jest-environment node
 */

// Integration tests: real Stripe HMAC verification via generateTestHeaderString.
// supabaseAdmin and email are mocked. stripe.webhooks.constructEvent is NOT mocked.

import Stripe from 'stripe'

// Create a real Stripe instance for HMAC operations. No external API calls are made.
const testStripe = new Stripe('sk_test_00000000000000000000000000000000', {
  apiVersion: '2024-06-20' as Parameters<typeof Stripe>[1]['apiVersion'],
})

// Replace the app's stripe client with our test instance so constructEvent runs for real
jest.mock('@/lib/stripe/client', () => ({
  stripe: testStripe,
}))

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

jest.mock('@/lib/email/gmail', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/email/templates', () => ({
  bookingConfirmed: jest.fn().mockReturnValue({ to: 'a@b.com', subject: 'S', html: 'H' }),
}))

const TEST_SECRET = 'test_signing_secret_for_integration'
process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET

import { NextRequest } from 'next/server'
const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }

// ── Chain factory ──────────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  Object.assign(chain, overrides)
  for (const key of ['select', 'insert', 'update', 'eq']) {
    if (!overrides[key]) chain[key] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

// ── Helpers ────────────────────────────────────────────────────────────────

const RESERVATION_ID = 'res-int-001'
const USER_ID = 'user-int-001'
const ORDER_ID = 'order-int-001'

function makeSession(reservationType = 'rental_event') {
  return {
    id: 'cs_int_test_001',
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: 'pi_int_test_001',
    customer_email: 'sailor@integration.com',
    metadata: { reservation_type: reservationType },
  }
}

function makeStripeEventPayload(type: string, data: object): string {
  return JSON.stringify({
    id: 'evt_int_001',
    type,
    data: { object: data },
    // Stripe event shape requires these fields for constructEvent
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  })
}

function makeSignedRequest(payload: string): NextRequest {
  const timestamp = Math.floor(Date.now() / 1000)
  const sig = testStripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
    timestamp,
  })
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: payload,
    headers: { 'stripe-signature': sig },
  })
}

function setupHappyPath() {
  supabaseAdmin.from
    // 1. stripe_events idempotency check — not seen
    .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
    // 2. reservations select
    .mockReturnValueOnce(makeChain({
      single: jest.fn().mockResolvedValue({
        data: {
          id: RESERVATION_ID, user_id: USER_ID, unit_id: null,
          total_cents: 24500, customer_email: 'sailor@integration.com',
          start_date: null, end_date: null, products: { name: 'Atlas 2' },
        },
        error: null,
      }),
    }))
    // 3. reservations update
    .mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }))
    // 4. orders insert → select → single
    .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: { id: ORDER_ID }, error: null }) }))
    // 5. stripe_events insert (log)
    .mockReturnValueOnce(makeChain())
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Webhook integration tests (real HMAC via generateTestHeaderString)', () => {

  describe('checkout.session.completed → reservation reserved_paid + order created', () => {
    it('returns 200 and orderId on valid signed payload', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      const res = await POST(makeSignedRequest(payload))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.received).toBe(true)
      expect(body.orderId).toBe(ORDER_ID)
    })

    it('verifies reservations table was updated to reserved_paid', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      await POST(makeSignedRequest(payload))
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls).toContain('reservations')
      expect(calls).toContain('orders')
    })

    it('returns 400 when signature is invalid (real HMAC mismatch)', async () => {
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      // Use a tampered signature (not generated by generateTestHeaderString with TEST_SECRET)
      const req = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': 't=1234,v1=badhash' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/signature/i)
    })
  })

  describe('duplicate event is a no-op (idempotent)', () => {
    it('returns 200 with skipped:true when event was already processed', async () => {
      // stripe_events check returns an existing row
      supabaseAdmin.from.mockReturnValueOnce(
        makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'seen' }, error: null }) })
      )
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      const res = await POST(makeSignedRequest(payload))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.skipped).toBe(true)
      // No orders insert should happen
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls).not.toContain('orders')
    })
  })

  describe('unknown reservation_type in metadata', () => {
    it('logs a warning and returns 200 (does not crash)', async () => {
      setupHappyPath()
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession('unknown_type_xyz'))
      const res = await POST(makeSignedRequest(payload))
      expect(res.status).toBe(200)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown_type_xyz'),
      )
      warnSpy.mockRestore()
    })
  })

  describe('DB insert failure → 500 (Stripe retries)', () => {
    it('returns 500 when order insert fails', async () => {
      supabaseAdmin.from
        // idempotency — not seen
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        // reservations — found
        .mockReturnValueOnce(makeChain({
          single: jest.fn().mockResolvedValue({
            data: { id: RESERVATION_ID, user_id: USER_ID, unit_id: null, total_cents: 24500, customer_email: 'a@b.com', start_date: null, end_date: null, products: null },
            error: null,
          }),
        }))
        // reservations update — ok
        .mockReturnValueOnce(makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        // orders insert — FAILS
        .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) }))

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      const res = await POST(makeSignedRequest(payload))
      expect(res.status).toBe(500)
    })

    it('does not log to stripe_events when fulfillment fails (Stripe will retry)', async () => {
      supabaseAdmin.from
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        .mockReturnValueOnce(makeChain({
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST116' } }),
        }))

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const payload = makeStripeEventPayload('checkout.session.completed', makeSession())
      await POST(makeSignedRequest(payload))

      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      // stripe_events appears once (idempotency check only) — never for logging
      expect(calls.filter((c: string) => c === 'stripe_events').length).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run tests — confirm RED before Task 4 changes land**

If you are running Task 10 before Task 4 is complete (i.e., `lib/stripe/webhook.ts` does not yet have the unknown-type warning), run the tests first to confirm these specific tests FAIL:

```bash
npx jest --testPathPattern=__tests__/api/webhook.test
```

Expected FAIL on: `"unknown reservation_type in metadata — logs a warning and returns 200"` (because the `console.warn` is not yet added).

All other tests should PASS at this point (idempotency, happy path, DB failure) — those test existing behavior.

Once Task 4's `lib/stripe/webhook.ts` changes are in place (unknown-type warning added), re-run.

- [ ] **Step 3: Run tests — expect full PASS**

```bash
npx jest --testPathPattern=__tests__/api/webhook.test
```

Expected: PASS (8 tests)

Note: if you see `Cannot find module '@/app/api/webhooks/stripe/route'`, verify the file path — the route is at `app/api/webhooks/stripe/route.ts`, not `app/api/stripe/webhook/route.ts`.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: PASS with ≥ 80% coverage (previously 91%). New files bring coverage to approximately the same level.

- [ ] **Step 5: Commit**

```bash
git add __tests__/api/webhook.test.ts
git commit -m "test: add webhook integration tests using generateTestHeaderString"
```

---

## Final Steps

- [ ] **Run full test suite**

```bash
npm test
```

Expected: All tests pass, coverage ≥ 80%.

- [ ] **Run build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Manual smoke test** — Start dev server and verify:
  - `/admin` shows KPI dashboard (not a redirect)
  - `/admin/events` shows events list and Add Event form
  - `/admin/reservations` shows Assign Unit dropdown per row
  - `/admin` sidebar includes Events link

- [ ] **Final commit if any stray changes**

```bash
git status
# Stage and commit anything remaining
```

---

## Environment Variables Required (for production deploy)

Add these to Vercel before deploying:

```
GMAIL_SERVICE_ACCOUNT_KEY={"type":"service_account","client_email":"...","private_key":"..."}
GMAIL_FROM_ADDRESS=noreply@navomarine.com
ADMIN_NOTIFICATION_EMAIL=team@navomarine.com
```

After adding, redeploy to pick them up (see Section 4 of the spec: Production Go-Live Checklist, steps 6–7).

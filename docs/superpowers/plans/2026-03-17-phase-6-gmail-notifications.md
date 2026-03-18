# Phase 6: Gmail Notifications + In-App Bell

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email notifications via Gmail API for key lifecycle events (reservation created, payment confirmed, unit assigned, expiry, return reminders, damage reports) and an in-app notification bell in the Navbar that polls unread notifications.

**Architecture:** A `lib/email/gmail.ts` module wraps the Google APIs `googleapis` package using a service account key stored in `GMAIL_SERVICE_ACCOUNT_KEY` env var. All email sends are non-blocking: wrapped in try/catch, log errors, never throw. A `lib/email/templates.ts` module provides HTML email template functions. Email calls are wired into existing API routes. A `NotificationBell` client component polls `GET /api/notifications` for unread count and displays a dropdown. The pg_cron return reminder function was already deployed in Phase 1.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS (`supabaseAdmin` typed as `SupabaseClient<any>`), Tailwind v4, Jest + React Testing Library

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `lib/email/gmail.ts` | Gmail API client: `sendEmail(to, subject, htmlBody)` |
| Create | `lib/email/templates.ts` | HTML email template functions |
| Create | `app/api/notifications/route.ts` | GET: unread notifications, PATCH: mark all read |
| Create | `components/layout/NotificationBell.tsx` | Client component: bell icon with badge + dropdown |
| Modify | `components/layout/Navbar.tsx` | Include NotificationBell when session exists |
| Modify | `app/api/checkout/route.ts` | Wire: send reservation created email |
| Modify | `app/api/stripe/webhook/route.ts` | Wire: send payment confirmed + admin new booking |
| Modify | `app/api/admin/reservations/[id]/assign/route.ts` | Wire: send unit assigned email |
| Modify | `app/api/return/[id]/route.ts` | Wire: send damage reported emails |
| Create | `__tests__/lib/email/gmail.test.ts` | Unit tests for gmail client |
| Create | `__tests__/api/notifications.test.ts` | Unit tests for notifications route |

---

## Task 0: Install googleapis

- [ ] **Step 1: Install**

```bash
npm install googleapis
```

- [ ] **Step 2: Add env var to `.env.local`**

```
GMAIL_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"...","client_email":"...","token_uri":"..."}
GMAIL_FROM_ADDRESS=noreply@navomarine.com
ADMIN_NOTIFICATION_EMAIL=team@navomarine.com
CRON_SECRET=your-secret-here
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install googleapis for Gmail API"
```

---

## Task 1: Gmail Client (`lib/email/gmail.ts`)

**Files:**
- Create: `lib/email/gmail.ts`
- Create: `__tests__/lib/email/gmail.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/lib/email/gmail.test.ts
/**
 * @jest-environment node
 */

// Mock googleapis before import
jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({ data: { id: 'msg-1' } }),
        },
      },
    }),
  },
}))

describe('sendEmail', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      GMAIL_SERVICE_ACCOUNT_KEY: JSON.stringify({
        type: 'service_account',
        project_id: 'test',
        private_key: 'fake-key',
        client_email: 'test@test.iam.gserviceaccount.com',
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
      GMAIL_FROM_ADDRESS: 'test@navomarine.com',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('sends email without throwing', async () => {
    const { sendEmail } = await import('@/lib/email/gmail')
    // Should not throw (non-blocking)
    await expect(
      sendEmail('user@test.com', 'Test Subject', '<p>Hello</p>'),
    ).resolves.not.toThrow()
  })

  it('catches errors and does not throw', async () => {
    const { google } = require('googleapis')
    const mockSend = jest.fn().mockRejectedValue(new Error('API down'))
    google.gmail.mockReturnValue({
      users: { messages: { send: mockSend } },
    })

    const { sendEmail } = await import('@/lib/email/gmail')
    // Must NOT throw — non-blocking requirement
    await expect(
      sendEmail('user@test.com', 'Test', '<p>Hi</p>'),
    ).resolves.not.toThrow()
  })
})
```

```bash
npx jest --testPathPattern=email/gmail --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// lib/email/gmail.ts
import { google } from 'googleapis'

/**
 * Send an email via Gmail API using a service account.
 *
 * CRITICAL: This function is NON-BLOCKING.
 * It catches all errors internally — it will NEVER throw.
 * Callers should fire-and-forget: `sendEmail(...).catch(() => {})` is unnecessary.
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  try {
    const serviceAccountKey = process.env.GMAIL_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKey) {
      console.warn('GMAIL_SERVICE_ACCOUNT_KEY not set, skipping email')
      return
    }

    const credentials = JSON.parse(serviceAccountKey)
    const fromEmail = process.env.GMAIL_FROM_ADDRESS ?? 'noreply@navomarine.com'

    const authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
    })

    const gmail = google.gmail({ version: 'v1', auth: authClient })

    // Build RFC 2822 message
    const rawMessage = [
      `From: NAVO Marine <${fromEmail}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
    ].join('\r\n')

    // Base64url encode
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    })
  } catch (err) {
    // NON-BLOCKING: log and swallow
    console.error('Email send failed (non-blocking):', err)
  }
}
```

```bash
npx jest --testPathPattern=email/gmail --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/email/gmail.ts __tests__/lib/email/gmail.test.ts
git commit -m "feat(email): add Gmail API client — non-blocking sendEmail"
```

---

## Task 2: Email Templates (`lib/email/templates.ts`)

**Files:**
- Create: `lib/email/templates.ts`

- [ ] **Step 1: Implement templates**

```typescript
// lib/email/templates.ts

const BRAND_COLOR = '#1E6EFF'
const DARK_BG = '#0B1F2A'

function wrapper(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:${DARK_BG};font-family:Raleway,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:white;letter-spacing:2px;">NAVO MARINE</span>
    </div>
    <div style="background:#0F2C3F;border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.1);">
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:12px;color:rgba(255,255,255,0.3);">
        NAVO Marine Technologies — navomarine.com
      </p>
    </div>
  </div>
</body>
</html>`
}

export function reservationCreatedEmail(params: {
  customerName: string
  eventName: string
  sailNumber: string
  totalCents: number
}): { subject: string; html: string } {
  return {
    subject: 'Reservation Created — Complete Payment Within 24 Hours',
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">Reservation Created</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        Hi ${params.customerName}, your reservation has been created.
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Event:</strong> ${params.eventName}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Sail #:</strong> ${params.sailNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 16px;">
        <strong style="color:white;">Total:</strong> $${(params.totalCents / 100).toFixed(2)}
      </p>
      <p style="color:#FF6B6B;font-size:14px;">
        Please complete payment within 24 hours or your reservation will expire.
      </p>
    `),
  }
}

export function paymentConfirmedEmail(params: {
  customerName: string
  eventName: string
  sailNumber: string
  orderNumber: string
  totalCents: number
}): { subject: string; html: string } {
  return {
    subject: `Payment Confirmed — Order ${params.orderNumber}`,
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">Payment Confirmed</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        Hi ${params.customerName}, your payment has been received.
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Order:</strong> ${params.orderNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Event:</strong> ${params.eventName}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Sail #:</strong> ${params.sailNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 16px;">
        <strong style="color:white;">Total:</strong> $${(params.totalCents / 100).toFixed(2)}
      </p>
      <p style="color:${BRAND_COLOR};">
        A unit will be assigned to your reservation shortly.
      </p>
    `),
  }
}

export function unitAssignedEmail(params: {
  customerName: string
  eventName: string
  navoNumber: string
  sailNumber: string
}): { subject: string; html: string } {
  return {
    subject: `Unit Assigned — ${params.navoNumber}`,
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">Unit Assigned</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        Hi ${params.customerName}, a unit has been assigned to your rental.
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Unit:</strong> ${params.navoNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Event:</strong> ${params.eventName}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 16px;">
        <strong style="color:white;">Sail #:</strong> ${params.sailNumber}
      </p>
    `),
  }
}

export function reservationExpiredEmail(params: {
  customerName: string
}): { subject: string; html: string } {
  return {
    subject: 'Reservation Expired',
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">Reservation Expired</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 16px;">
        Hi ${params.customerName}, your reservation has expired because payment was not completed within 24 hours.
      </p>
      <p style="color:rgba(255,255,255,0.7);">
        You can book again anytime at <a href="https://navomarine.com/reserve" style="color:${BRAND_COLOR};">navomarine.com/reserve</a>.
      </p>
    `),
  }
}

export function returnFormReminderEmail(params: {
  customerName: string
  eventName: string
  returnLink: string
}): { subject: string; html: string } {
  return {
    subject: 'Please Submit Your Return Form',
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">Return Form Reminder</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        Hi ${params.customerName}, your event "${params.eventName}" has ended.
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 16px;">
        Please submit your return form to complete the rental process.
      </p>
      <a href="${params.returnLink}" style="display:inline-block;background:${BRAND_COLOR};color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Submit Return Form
      </a>
    `),
  }
}

export function damageReportedEmail(params: {
  customerName: string
  condition: string
  notes: string
  navoNumber: string
}): { subject: string; html: string } {
  return {
    subject: `Damage Reported — Unit ${params.navoNumber}`,
    html: wrapper(`
      <h2 style="color:#FF6B6B;margin:0 0 16px;">Damage Report Filed</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        A damage report has been filed for unit ${params.navoNumber}.
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Condition:</strong> ${params.condition}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Notes:</strong> ${params.notes || 'None'}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Submitted by:</strong> ${params.customerName}
      </p>
    `),
  }
}

export function adminNewBookingEmail(params: {
  customerEmail: string
  eventName: string
  sailNumber: string
  totalCents: number
  orderNumber: string
}): { subject: string; html: string } {
  return {
    subject: `New Booking — ${params.customerEmail}`,
    html: wrapper(`
      <h2 style="color:white;margin:0 0 16px;">New Booking Received</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Customer:</strong> ${params.customerEmail}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Event:</strong> ${params.eventName}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Sail #:</strong> ${params.sailNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Order:</strong> ${params.orderNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Total:</strong> $${(params.totalCents / 100).toFixed(2)}
      </p>
      <p style="color:${BRAND_COLOR};margin-top:16px;">
        Please assign a unit in the admin dashboard.
      </p>
    `),
  }
}

export function adminDamageReportEmail(params: {
  customerEmail: string
  navoNumber: string
  condition: string
  notes: string
}): { subject: string; html: string } {
  return {
    subject: `DAMAGE: Unit ${params.navoNumber} — ${params.condition}`,
    html: wrapper(`
      <h2 style="color:#FF6B6B;margin:0 0 16px;">Damage Report</h2>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Unit:</strong> ${params.navoNumber}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Condition:</strong> ${params.condition}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Customer:</strong> ${params.customerEmail}
      </p>
      <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
        <strong style="color:white;">Notes:</strong> ${params.notes || 'None'}
      </p>
    `),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/email/gmail.ts lib/email/templates.ts __tests__/lib/email/gmail.test.ts
git commit -m "feat(email): add email templates for all lifecycle events"
```

---

## Task 3: Wire Emails into Existing Routes

All email calls are non-blocking: `sendEmail(...)` — never `await` in the critical path if it would block the response. Instead, fire and forget.

- [ ] **Step 1: Wire `POST /api/checkout`**

In `app/api/checkout/route.ts`, after the reservation insert succeeds, add:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { reservationCreatedEmail } from '@/lib/email/templates'

// ... after reservation insert ...
const emailData = reservationCreatedEmail({
  customerName: session.user.name ?? session.user.email ?? 'Customer',
  eventName: body.reservation_type === 'rental_event' ? 'Event Rental' : 'Custom Dates',
  sailNumber: body.sail_number ?? '',
  totalCents,
})
// Non-blocking — do not await
sendEmail(session.user.email ?? '', emailData.subject, emailData.html)
```

- [ ] **Step 2: Wire `POST /api/stripe/webhook`**

In the `handleCheckoutCompleted` function, after order creation and before the stripe_events commit insert:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { paymentConfirmedEmail, adminNewBookingEmail } from '@/lib/email/templates'

// After order creation:
const confirmEmail = paymentConfirmedEmail({
  customerName: reservation.customer_email,
  eventName: metadata.reservation_type === 'rental_event' ? 'Event Rental' : 'Custom Dates',
  sailNumber: metadata.sail_number ?? '',
  orderNumber: order.order_number,
  totalCents: reservation.total_cents,
})
sendEmail(reservation.customer_email, confirmEmail.subject, confirmEmail.html)

// Admin notification
const adminEmail = adminNewBookingEmail({
  customerEmail: reservation.customer_email,
  eventName: metadata.reservation_type === 'rental_event' ? 'Event Rental' : 'Custom Dates',
  sailNumber: metadata.sail_number ?? '',
  totalCents: reservation.total_cents,
  orderNumber: order.order_number,
})
sendEmail(process.env.ADMIN_NOTIFICATION_EMAIL ?? 'team@navomarine.com', adminEmail.subject, adminEmail.html)
```

- [ ] **Step 3: Wire `PATCH /api/admin/reservations/[id]/assign`**

After successful unit assignment:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { unitAssignedEmail } from '@/lib/email/templates'

const assignEmail = unitAssignedEmail({
  customerName: reservation.customer_email,
  eventName: reservation.rental_events?.name ?? 'Rental',
  navoNumber: unitData.navo_number,
  sailNumber: reservation.sail_number ?? '',
})
sendEmail(reservation.customer_email, assignEmail.subject, assignEmail.html)
```

- [ ] **Step 4: Wire `POST /api/return/[id]`**

After return report creation, if damage is reported:

```typescript
import { sendEmail } from '@/lib/email/gmail'
import { damageReportedEmail, adminDamageReportEmail } from '@/lib/email/templates'

if (report.damage_flagged && reservation.unit_id) {
  const unitNavo = reservation.units?.navo_number ?? 'Unknown'

  const adminDmgEmail = adminDamageReportEmail({
    customerEmail: session.user.email ?? '',
    navoNumber: unitNavo,
    condition: body.condition,
    notes: body.notes ?? '',
  })
  sendEmail(
    process.env.ADMIN_NOTIFICATION_EMAIL ?? 'team@navomarine.com',
    adminDmgEmail.subject,
    adminDmgEmail.html,
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts app/api/stripe/webhook/route.ts \
  app/api/admin/reservations/[id]/assign/route.ts app/api/return/[id]/route.ts
git commit -m "feat(email): wire lifecycle emails into existing API routes"
```

---

## Task 4: Notifications API Route

**Files:**
- Create: `app/api/notifications/route.ts`
- Create: `__tests__/api/notifications.test.ts`

- [ ] **Step 1 (RED): Write test**

```typescript
// __tests__/api/notifications.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const { auth } = require('@/lib/auth') as { auth: jest.Mock }
const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    ...overrides,
  }
  for (const key of Object.keys(chain)) {
    if (!overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

const userSession = { user: { id: 'user-1', email: 'a@b.com' } }

beforeEach(() => jest.clearAllMocks())

describe('GET /api/notifications', () => {
  it('returns 401 when not authenticated', async () => {
    auth.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/notifications/route')
    const res = await GET(new NextRequest('http://localhost/api/notifications'))
    expect(res.status).toBe(401)
  })

  it('returns unread notifications', async () => {
    auth.mockResolvedValueOnce(userSession)
    const chain = makeChain({
      limit: jest.fn().mockResolvedValue({
        data: [{ id: 'n-1', message: 'Test', read: false }],
        error: null,
      }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { GET } = await import('@/app/api/notifications/route')
    const res = await GET(new NextRequest('http://localhost/api/notifications'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.notifications).toHaveLength(1)
  })
})

describe('PATCH /api/notifications', () => {
  it('marks all as read', async () => {
    auth.mockResolvedValueOnce(userSession)
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    supabaseAdmin.from.mockReturnValue(chain)

    const { PATCH } = await import('@/app/api/notifications/route')
    const res = await PATCH(new NextRequest('http://localhost/api/notifications', { method: 'PATCH' }))
    expect(res.status).toBe(200)
  })
})
```

```bash
npx jest --testPathPattern=api/notifications --no-coverage
# Expected: FAIL
```

- [ ] **Step 2 (GREEN): Implement**

```typescript
// app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/db/client'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, message, link, read, created_at')
    .eq('user_id', session.user.id ?? '')
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notifications: data ?? [] })
}

export async function PATCH(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('user_id', session.user.id ?? '')
    .eq('read', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

```bash
npx jest --testPathPattern=api/notifications --no-coverage
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/route.ts __tests__/api/notifications.test.ts
git commit -m "feat(api): add notifications route — GET unread, PATCH mark all read"
```

---

## Task 5: NotificationBell Component

**Files:**
- Create: `components/layout/NotificationBell.tsx`
- Modify: `components/layout/Navbar.tsx`

- [ ] **Step 1: Create NotificationBell**

```typescript
// components/layout/NotificationBell.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Notification = {
  id: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

const POLL_INTERVAL = 30_000 // 30 seconds

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
      }
    } catch {
      // Silently fail — non-critical
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    setOpen((prev) => !prev)
    if (!open && notifications.length > 0) {
      // Mark all as read
      try {
        await fetch('/api/notifications', { method: 'PATCH' })
        // Clear badge after marking read
        setTimeout(() => setNotifications([]), 500)
      } catch {
        // Non-critical
      }
    }
  }

  const unreadCount = notifications.length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 text-white/60 hover:text-white transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-white/10 bg-navy-800 shadow-xl z-50">
          <div className="border-b border-white/10 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Notifications
            </span>
          </div>
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/30">No new notifications</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="border-b border-white/5 last:border-0">
                  {n.link ? (
                    <a
                      href={n.link}
                      className="block px-4 py-3 text-sm text-white/70 hover:bg-white/5 transition-colors"
                    >
                      {n.message}
                      <span className="block mt-1 text-xs text-white/30">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </a>
                  ) : (
                    <div className="px-4 py-3 text-sm text-white/70">
                      {n.message}
                      <span className="block mt-1 text-xs text-white/30">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update Navbar to include NotificationBell**

In `components/layout/Navbar.tsx`, add `NotificationBell` next to the user avatar when session exists:

```tsx
import { NotificationBell } from '@/components/layout/NotificationBell'

// Inside the session?.user block, before the sign out button:
<NotificationBell />
```

The updated session block should look like:

```tsx
{session?.user ? (
  <div className="flex items-center gap-3">
    <NotificationBell />
    {session.user.image && (
      <Image ... />
    )}
    <button onClick={() => signOut({ callbackUrl: '/' })} ...>
      Sign Out
    </button>
  </div>
) : ( ... )}
```

- [ ] **Step 3: Commit**

```bash
git add components/layout/NotificationBell.tsx components/layout/Navbar.tsx
git commit -m "feat(ui): add notification bell with unread badge and dropdown"
```

---

## Task 6: E2E Gate — Email + Notification

- [ ] **Step 1: Create E2E test**

```typescript
// e2e/notifications.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Notifications', () => {
  test('notification bell is visible when logged in', async ({ page }) => {
    // Requires authenticated session
    await page.goto('/dashboard')
    await expect(page.getByLabel(/notifications/i)).toBeVisible()
  })

  test('clicking bell opens dropdown', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByLabel(/notifications/i).click()
    await expect(page.getByText('Notifications')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- --grep "Notifications"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/notifications.spec.ts
git commit -m "test(e2e): add notification bell tests"
```

---

## Task 7: Vercel Cron Worker — Send Expiry Notification Emails

**Files:**
- Create: `app/api/worker/expire-notifications/route.ts`
- Create/Update: `vercel.json`

- [ ] **Step 1: Create worker route**

```typescript
// app/api/worker/expire-notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/gmail'
import { reservationExpiredEmail } from '@/lib/email/templates'

export async function POST(req: NextRequest) {
  // Protect with secret header
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Query recently expired reservations (cancelled in the last hour, but not more than 2 hours ago)
  const { data: expired, error } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_email, user_id')
    .eq('status', 'cancelled')
    .gte('updated_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .lt('updated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('expire-notifications worker error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (expired ?? []) as { id: string; customer_email: string; user_id: string }[]

  for (const reservation of rows) {
    const email = reservationExpiredEmail({ customerName: reservation.customer_email })
    sendEmail(reservation.customer_email, email.subject, email.html)
  }

  return NextResponse.json({ processed: rows.length })
}
```

- [ ] **Step 2: Create/update `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/worker/expire-notifications",
      "schedule": "30 * * * *"
    },
    {
      "path": "/api/worker/send-return-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

> Runs at :30 past each hour — after pg_cron fires at :00 to expire unpaid reservations.

- [ ] **Step 3: Commit**

```bash
git add app/api/worker/expire-notifications/route.ts vercel.json
git commit -m "feat(worker): add Vercel Cron worker for expiry notification emails"
```

---

## Task 8: Vercel Cron Worker — Send Return Reminder Emails

**Files:**
- Create: `app/api/worker/send-return-reminders/route.ts`

- [ ] **Step 1: Create worker route**

```typescript
// app/api/worker/send-return-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/gmail'
import { returnFormReminderEmail } from '@/lib/email/templates'

export async function POST(req: NextRequest) {
  // Protect with secret header
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Query notifications inserted in the last 25 hours but not in the last hour
  // (giving pg_cron time to have fired), that are still unread and mention return form
  const { data: notifs, error } = await supabaseAdmin
    .from('notifications')
    .select('id, user_id, message')
    .ilike('message', '%return form%')
    .eq('read', false)
    .gte('created_at', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('send-return-reminders worker error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (notifs ?? []) as { id: string; user_id: string; message: string }[]

  for (const notif of rows) {
    // Look up the reservation for this user to get customer email + reservation id
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('id, customer_email, rental_events(name)')
      .eq('user_id', notif.user_id)
      .eq('status', 'reserved_paid')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (reservation) {
      const res = reservation as {
        id: string
        customer_email: string
        rental_events: { name: string } | null
      }
      const email = returnFormReminderEmail({
        customerName: res.customer_email,
        eventName: res.rental_events?.name ?? 'your rental',
        returnLink: `${process.env.NEXTAUTH_URL}/dashboard/rentals/${res.id}/return`,
      })
      sendEmail(res.customer_email, email.subject, email.html)

      // Mark notification as read
      await supabaseAdmin
        .from('notifications')
        .update({ read: true })
        .eq('id', notif.id)
    }
  }

  return NextResponse.json({ processed: rows.length })
}
```

> `vercel.json` already includes this route's schedule (added in Task 7, Step 2).
> Runs at 9am UTC daily — after pg_cron fires at 8am UTC to insert return-form notifications.

- [ ] **Step 2: Commit**

```bash
git add app/api/worker/send-return-reminders/route.ts
git commit -m "feat(worker): add Vercel Cron worker for return reminder emails"
```

---

## Summary

After completing all tasks:
- `lib/email/gmail.ts` — non-blocking Gmail API send via service account
- `lib/email/templates.ts` — 8 email templates covering the full lifecycle
- Emails wired into: checkout, webhook, unit assignment, return report
- `GET/PATCH /api/notifications` — fetch unread, mark all read
- `NotificationBell` component in Navbar with badge + dropdown, 30s polling
- All email calls are fire-and-forget: catch errors, log, never throw
- Gmail errors never block API responses
- `POST /api/worker/expire-notifications` — Vercel Cron at :30 past each hour, sends expiry emails for recently cancelled reservations
- `POST /api/worker/send-return-reminders` — Vercel Cron at 9am UTC daily, sends return form reminder emails via unread notifications
- `vercel.json` — defines cron schedules for both workers
- `CRON_SECRET` env var protects worker routes from unauthorized invocation

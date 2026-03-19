/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────

jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

jest.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}))

const { supabaseAdmin } = require('@/lib/db/client') as {
  supabaseAdmin: { from: jest.Mock }
}
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { webhooks: { constructEvent: jest.Mock } }
}

// ── Chain factory (matches project convention from checkout.test.ts) ──────
//
// makeChain returns a fresh object per from() call.
// Chainable methods (select, insert, update, eq) return the same chain.
// Terminal methods (single, maybeSingle) return resolved Promises.
//
// For update chains: override `eq` with mockResolvedValue so that
// `await from().update().eq()` resolves to { error: null }.

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  // Apply overrides — these replace the defaults above
  Object.assign(chain, overrides)
  // Re-wire chainable methods to return the chain (after overrides applied)
  for (const key of ['select', 'insert', 'update', 'eq']) {
    if (!overrides[key]) {
      chain[key] = jest.fn().mockReturnValue(chain)
    }
  }
  return chain
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const SESSION_ID = 'cs_test_abc123'
const PAYMENT_INTENT_ID = 'pi_test_def456'
const RESERVATION_ID = 'res-uuid-001'
const USER_ID = 'user-uuid-001'

function makeCompletedSession(overrides = {}) {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: PAYMENT_INTENT_ID,
    customer_email: 'sailor@test.com',
    amount_total: 24500,
    // Only include keys the actual checkout route sets in metadata
    metadata: {
      reservation_type: 'rental_event',
      product_id: 'prod-uuid-001',
      event_id: 'event-uuid-001',
      date_window_id: '',
      sail_number: 'USA-1234',
      user_id: USER_ID,
      customer_email: 'sailor@test.com',
    },
    ...overrides,
  }
}

function makeStripeEvent(type: string, data: object) {
  return { id: 'evt_test_001', type, data: { object: data } }
}

function makeRequest(body: string, sig = 'valid-sig'): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': sig },
  })
}

// ── DB call order for happy path (no unit_id) ────────────────────────────
// 1. stripe_events.select().eq().maybeSingle()   — idempotency check (not seen)
// 2. reservations.select().eq().single()          — find reservation
// 3. reservations.update().eq()                   — flip to reserved_paid (awaited directly)
// 4. orders.insert().select().single()            — create order
// 5. stripe_events.insert()                       — log event (after fulfillment)

function setupHappyPath(unitId: string | null = null) {
  supabaseAdmin.from.mockReset()
  supabaseAdmin.from
    // 1. stripe_events check — not seen before (data: null)
    .mockReturnValueOnce(makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }))
    // 2. reservations select
    .mockReturnValueOnce(makeChain({
      single: jest.fn().mockResolvedValue({
        data: { id: RESERVATION_ID, user_id: USER_ID, unit_id: unitId, total_cents: 24500, customer_email: 'sailor@test.com' },
        error: null,
      }),
    }))
    // 3. reservations update — eq is terminal (awaited directly)
    .mockReturnValueOnce(makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }))

  if (unitId) {
    supabaseAdmin.from
      // 4. units update — eq is terminal
      .mockReturnValueOnce(makeChain({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }))
  }

  supabaseAdmin.from
    // 4 or 5. orders insert → select → single
    .mockReturnValueOnce(makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'order-001' }, error: null }),
    }))
    // 5 or 6. stripe_events insert (log event) — no terminal needed
    .mockReturnValueOnce(makeChain())
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

describe('POST /api/webhooks/stripe', () => {
  describe('signature verification', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const req = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when signature verification fails', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature mismatch')
      })
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const res = await POST(makeRequest('{}', 'bad-sig'))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/signature/i)
    })
  })

  describe('idempotency', () => {
    it('returns 200 with skipped:true for already-seen event', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCompletedSession())
      )
      // stripe_events check returns an existing row
      supabaseAdmin.from.mockReturnValueOnce(
        makeChain({
          maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'seen' }, error: null }),
        })
      )

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const res = await POST(makeRequest('{}'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.skipped).toBe(true)
    })
  })

  describe('checkout.session.completed', () => {
    beforeEach(() => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCompletedSession())
      )
    })

    it('returns 200 on success', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const res = await POST(makeRequest('{}'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.received).toBe(true)
      expect(body.orderId).toBe('order-001')
    })

    it('queries reservations by stripe_checkout_session_id', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      await POST(makeRequest('{}'))
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls).toContain('reservations')
    })

    it('creates an orders row', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      await POST(makeRequest('{}'))
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls).toContain('orders')
    })

    it('logs the event to stripe_events after fulfillment', async () => {
      setupHappyPath()
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      await POST(makeRequest('{}'))
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      // stripe_events appears twice: check + log
      expect(calls.filter((c: string) => c === 'stripe_events').length).toBe(2)
      // Log call must come after orders call
      const ordersIdx = calls.lastIndexOf('orders')
      const eventsLogIdx = calls.lastIndexOf('stripe_events')
      expect(eventsLogIdx).toBeGreaterThan(ordersIdx)
    })

    it('updates unit status to reserved_paid when unit_id is set', async () => {
      setupHappyPath('unit-uuid-001')
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      await POST(makeRequest('{}'))
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls).toContain('units')
    })

    it('returns 500 when reservation is not found', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCompletedSession())
      )
      supabaseAdmin.from
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST116' } }) }))

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const res = await POST(makeRequest('{}'))
      expect(res.status).toBe(500)
    })

    it('does not log to stripe_events when fulfillment fails', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCompletedSession())
      )
      supabaseAdmin.from
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        .mockReturnValueOnce(makeChain({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST116' } }) }))

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      await POST(makeRequest('{}'))

      // stripe_events should only be called once (idempotency check), never for logging
      const calls = supabaseAdmin.from.mock.calls.map((c: string[]) => c[0])
      expect(calls.filter((c: string) => c === 'stripe_events').length).toBe(1)
    })
  })

  describe('unhandled event types', () => {
    it('returns 200 without processing', async () => {
      stripe.webhooks.constructEvent.mockReturnValue(
        makeStripeEvent('customer.created', {})
      )
      supabaseAdmin.from
        .mockReturnValueOnce(makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }))
        .mockReturnValueOnce(makeChain()) // logStripeEvent

      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const res = await POST(makeRequest('{}'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.received).toBe(true)
    })
  })
})

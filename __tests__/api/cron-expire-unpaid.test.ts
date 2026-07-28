/**
 * @jest-environment node
 *
 * The sweep route. Hard rule under test: a reservation Stripe considers paid is
 * never cancelled, and anything uncertain is left alone for a human.
 */
export {} // module scope: keeps top-level consts out of the global namespace

jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { retrieve: jest.fn() } } },
}))
jest.mock('@/lib/cron/reservation-lifecycle', () => ({
  cancelExpiredHold: jest.fn(),
  restoreReservationAsPaid: jest.fn(),
}))

const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }
const { stripe } = require('@/lib/stripe/client') as {
  stripe: { checkout: { sessions: { retrieve: jest.Mock } } }
}
const { cancelExpiredHold, restoreReservationAsPaid } = require('@/lib/cron/reservation-lifecycle') as {
  cancelExpiredHold: jest.Mock
  restoreReservationAsPaid: jest.Mock
}

const SECRET = 'test-cron-secret'

function makeRequest(opts: { auth?: string; url?: string } = {}) {
  return new Request(opts.url ?? 'http://localhost/api/cron/expire-unpaid-reservations', {
    headers: opts.auth ? { authorization: opts.auth } : {},
  })
}

/** Stubs the candidate SELECT to resolve with `rows`. */
function stubCandidates(rows: unknown[] | null, error: unknown = null) {
  supabaseAdmin.from.mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {}
    for (const m of ['select', 'eq', 'lt', 'not', 'limit', 'order']) {
      chain[m] = jest.fn(() => chain)
    }
    // `limit` terminates the builder.
    chain.limit = jest.fn(() => Promise.resolve({ data: rows, error }))
    return chain
  })
}

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    stripe_checkout_session_id: 'cs_1',
    unit_id: null,
    user_id: 'u1',
    customer_email: 'a@b.com',
    expires_at: '2026-07-01T00:00:00Z',
    ...over,
  }
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  // No resetModules(): it would give the route a fresh copy of the mocked
  // modules, disconnected from the instances configured here. The route reads
  // CRON_SECRET per request, so mutating process.env is enough.
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: SECRET }
  cancelExpiredHold.mockResolvedValue('cancelled')
  restoreReservationAsPaid.mockResolvedValue('restored')
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('auth', () => {
  it('401s with no authorization header', async () => {
    stubCandidates([])
    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    expect((await GET(makeRequest())).status).toBe(401)
  })

  it('401s with the wrong secret', async () => {
    stubCandidates([])
    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    expect((await GET(makeRequest({ auth: 'Bearer nope' }))).status).toBe(401)
  })

  it('fails closed with 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    stubCandidates([])
    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const res = await GET(makeRequest({ auth: 'Bearer anything' }))

    expect(res.status).toBe(503)
    expect(cancelExpiredHold).not.toHaveBeenCalled()
  })
})

describe('never cancels paid work', () => {
  it('restores rather than cancels when Stripe says paid', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1',
      payment_status: 'paid',
    })

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const res = await GET(makeRequest({ auth: `Bearer ${SECRET}` }))
    const body = await res.json()

    expect(cancelExpiredHold).not.toHaveBeenCalled()
    expect(restoreReservationAsPaid).toHaveBeenCalled()
    expect(body.restored).toBe(1)
    expect(body.cancelled).toBe(0)
  })

  it('restores when Stripe says no_payment_required', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1',
      payment_status: 'no_payment_required',
    })

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    await GET(makeRequest({ auth: `Bearer ${SECRET}` }))

    expect(cancelExpiredHold).not.toHaveBeenCalled()
    expect(restoreReservationAsPaid).toHaveBeenCalled()
  })

  it('leaves the row alone when the Stripe lookup throws', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockRejectedValueOnce(new Error('network'))

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const body = await (await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).json()

    // Uncertainty must never resolve to cancellation.
    expect(cancelExpiredHold).not.toHaveBeenCalled()
    expect(body.errored).toBe(1)
  })

  it('flags rather than cancels a hold with no Stripe session id', async () => {
    stubCandidates([candidate({ stripe_checkout_session_id: null })])

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const body = await (await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).json()

    expect(cancelExpiredHold).not.toHaveBeenCalled()
    expect(body.needsReview).toBe(1)
  })
})

describe('cancels genuinely abandoned holds', () => {
  it('cancels when Stripe says unpaid', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1',
      payment_status: 'unpaid',
      status: 'expired',
    })

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const body = await (await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).json()

    expect(cancelExpiredHold).toHaveBeenCalledTimes(1)
    expect(body.cancelled).toBe(1)
  })

  it('counts a lost compare-and-swap race as skipped, not cancelled', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1',
      payment_status: 'unpaid',
    })
    cancelExpiredHold.mockResolvedValueOnce('skipped')

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const body = await (await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).json()

    expect(body.cancelled).toBe(0)
    expect(body.skipped).toBe(1)
  })
})

describe('dry run', () => {
  it('reports intent without changing anything', async () => {
    stubCandidates([candidate()])
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1',
      payment_status: 'unpaid',
    })

    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const res = await GET(makeRequest({
      auth: `Bearer ${SECRET}`,
      url: 'http://localhost/api/cron/expire-unpaid-reservations?dryRun=1',
    }))
    const body = await res.json()

    expect(body.dryRun).toBe(true)
    expect(body.wouldCancel).toBe(1)
    expect(cancelExpiredHold).not.toHaveBeenCalled()
    expect(restoreReservationAsPaid).not.toHaveBeenCalled()
  })
})

describe('candidate selection', () => {
  it('returns 500 when the candidate query fails', async () => {
    stubCandidates(null, { message: 'boom' })
    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    expect((await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).status).toBe(500)
  })

  it('handles an empty candidate set', async () => {
    stubCandidates([])
    const { GET } = await import('@/app/api/cron/expire-unpaid-reservations/route')
    const body = await (await GET(makeRequest({ auth: `Bearer ${SECRET}` }))).json()
    expect(body.processed).toBe(0)
  })
})

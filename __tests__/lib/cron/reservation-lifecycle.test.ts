/**
 * @jest-environment node
 *
 * Safety contract for the expiry sweep.
 *
 * The sweep was paused because it cancelled reservations customers had paid for:
 * the webhook was failing, so paid rows sat at `reserved_unpaid` and the sweep
 * read them as abandoned. Every test here exists to make that failure mode
 * impossible, so treat a failure in this file as a money bug, not a test bug.
 */
jest.mock('@/lib/db/client', () => ({ supabaseAdmin: { from: jest.fn() } }))
jest.mock('@/lib/stripe/webhook', () => ({ fulfillCheckoutSession: jest.fn() }))

const { supabaseAdmin } = require('@/lib/db/client') as { supabaseAdmin: { from: jest.Mock } }
const { fulfillCheckoutSession } = require('@/lib/stripe/webhook') as {
  fulfillCheckoutSession: jest.Mock
}

import { cancelExpiredHold, restoreReservationAsPaid } from '@/lib/cron/reservation-lifecycle'

type Row = {
  id: string
  stripe_checkout_session_id: string | null
  unit_id: string | null
  user_id: string | null
}

const row: Row = {
  id: 'res-1',
  stripe_checkout_session_id: 'cs_test_1',
  unit_id: null,
  user_id: 'user-1',
}

/**
 * Builds a per-table chain recorder. `updateResult` drives the compare-and-swap
 * outcome: [] means the guarded UPDATE matched nothing (someone else won).
 */
function stubTables(opts: {
  updateResult?: { data: unknown[] | null; error: unknown }
  existingOrder?: { id: string } | null
} = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const eqArgs: Record<string, unknown[][]> = {}

  supabaseAdmin.from.mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    const record = (m: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args })
        if (m === 'eq') {
          eqArgs[table] = eqArgs[table] ?? []
          eqArgs[table].push(args)
        }
        return chain
      })

    for (const m of ['update', 'delete', 'insert', 'select', 'eq', 'is', 'lt', 'not']) {
      chain[m] = record(m)
    }
    chain.select = jest.fn((...args: unknown[]) => {
      calls.push({ table, method: 'select', args })
      // Terminal for the guarded update on reservations.
      if (table === 'reservations' && calls.some(c => c.table === 'reservations' && c.method === 'update')) {
        return Promise.resolve(opts.updateResult ?? { data: [{ id: row.id }], error: null })
      }
      return chain
    })
    chain.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: opts.existingOrder ?? null, error: null }),
    )
    return chain
  })

  return { calls, eqArgs }
}

beforeEach(() => jest.clearAllMocks())

describe('cancelExpiredHold — compare-and-swap safety', () => {
  it('guards the UPDATE on status = reserved_unpaid', async () => {
    const { eqArgs } = stubTables()

    await cancelExpiredHold(row)

    // Without this guard, a webhook that pays the row between SELECT and UPDATE
    // would be overwritten with 'cancelled'.
    expect(eqArgs.reservations).toEqual(
      expect.arrayContaining([
        ['id', 'res-1'],
        ['status', 'reserved_unpaid'],
      ]),
    )
  })

  it('reports cancelled when the guarded update matched the row', async () => {
    stubTables({ updateResult: { data: [{ id: 'res-1' }], error: null } })

    await expect(cancelExpiredHold(row)).resolves.toBe('cancelled')
  })

  it('reports skipped and frees nothing when it loses the race', async () => {
    // Empty data = the row is no longer reserved_unpaid, i.e. it just got paid.
    const { calls } = stubTables({ updateResult: { data: [], error: null } })

    await expect(cancelExpiredHold(row)).resolves.toBe('skipped')

    // Critically: no unit release and no reservation_units deletion, because the
    // booking now belongs to a paying customer.
    expect(calls.some(c => c.table === 'reservation_units' && c.method === 'delete')).toBe(false)
    expect(calls.some(c => c.table === 'units' && c.method === 'update')).toBe(false)
  })

  it('reports error and frees nothing when the update errors', async () => {
    const { calls } = stubTables({
      updateResult: { data: null, error: { message: 'deadlock detected' } },
    })

    await expect(cancelExpiredHold(row)).resolves.toBe('error')
    expect(calls.some(c => c.table === 'units' && c.method === 'update')).toBe(false)
  })

  it('releases the assigned unit only after the status flip succeeds', async () => {
    const { calls } = stubTables({ updateResult: { data: [{ id: 'res-1' }], error: null } })

    await cancelExpiredHold({ ...row, unit_id: 'unit-9' })

    const statusFlip = calls.findIndex(c => c.table === 'reservations' && c.method === 'update')
    const unitRelease = calls.findIndex(c => c.table === 'units' && c.method === 'update')
    expect(statusFlip).toBeGreaterThanOrEqual(0)
    expect(unitRelease).toBeGreaterThan(statusFlip)
  })
})

describe('restoreReservationAsPaid', () => {
  const paidSession = { id: 'cs_test_1', payment_status: 'paid' } as never

  it('delegates to the webhook fulfiller when no order exists yet', async () => {
    stubTables({ existingOrder: null })
    fulfillCheckoutSession.mockResolvedValueOnce({ ok: true, orderId: 'ord-1' })

    await expect(restoreReservationAsPaid(row, paidSession)).resolves.toBe('restored')
    expect(fulfillCheckoutSession).toHaveBeenCalledWith(paidSession)
  })

  it('does not double-fulfil when an order already exists', async () => {
    stubTables({ existingOrder: { id: 'ord-existing' } })

    await expect(restoreReservationAsPaid(row, paidSession)).resolves.toBe('status_corrected')
    expect(fulfillCheckoutSession).not.toHaveBeenCalled()
  })

  it('reports error when fulfilment fails, leaving the row for the next run', async () => {
    stubTables({ existingOrder: null })
    fulfillCheckoutSession.mockResolvedValueOnce({ ok: false, error: 'stripe down' })

    await expect(restoreReservationAsPaid(row, paidSession)).resolves.toBe('error')
  })
})

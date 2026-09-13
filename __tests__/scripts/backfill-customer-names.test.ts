/**
 * @jest-environment node
 */
jest.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { retrieve: jest.fn() } } },
}))
jest.mock('@/lib/db/client', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

import { stripe } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/db/client'
import { main } from '@/scripts/backfill-customer-names'

const mockRetrieve = stripe.checkout.sessions.retrieve as jest.Mock
const mockFrom = supabaseAdmin.from as unknown as jest.Mock

function makeChain(rows: Record<string, unknown>[]) {
  return {
    select: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockResolvedValue({ data: rows, error: null }),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error: null }),
  }
}

async function run(rows: Record<string, unknown>[], args: string[] = []) {
  const chain = makeChain(rows)
  mockFrom.mockReturnValue(chain)
  const originalArgv = process.argv
  process.argv = [...originalArgv.slice(0, 2), ...args]
  try {
    await main()
  } finally {
    process.argv = originalArgv
  }
  return chain
}

describe('backfill-customer-names', () => {
  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('writes customer_name from shipping_details when the email matches', async () => {
    mockRetrieve.mockResolvedValue({
      collected_information: { shipping_details: { name: 'Sarah Whitfield' } },
      customer_details: { email: 'sarah@test.com' },
    })
    const chain = await run([{ id: 'r1', customer_email: 'sarah@test.com', stripe_checkout_session_id: 'cs_1' }])

    expect(chain.update).toHaveBeenCalledWith({ customer_name: 'Sarah Whitfield' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('falls back to customer_details.name when shipping_details has none', async () => {
    mockRetrieve.mockResolvedValue({
      collected_information: null,
      customer_details: { name: 'Mara Devlin', email: 'mara@test.com' },
    })
    const chain = await run([{ id: 'r2', customer_email: 'mara@test.com', stripe_checkout_session_id: 'cs_2' }])

    expect(chain.update).toHaveBeenCalledWith({ customer_name: 'Mara Devlin' })
  })

  it('skips without writing when Stripe has no name on file', async () => {
    mockRetrieve.mockResolvedValue({ collected_information: null, customer_details: null })
    const chain = await run([{ id: 'r3', customer_email: 'ghost@test.com', stripe_checkout_session_id: 'cs_3' }])

    expect(chain.update).not.toHaveBeenCalled()
  })

  it('skips and warns when the Stripe session email does not match the reservation', async () => {
    mockRetrieve.mockResolvedValue({
      collected_information: { shipping_details: { name: 'Someone Else' } },
      customer_details: { email: 'attacker@test.com' },
    })
    const chain = await run([{ id: 'r4', customer_email: 'real@test.com', stripe_checkout_session_id: 'cs_4' }])

    expect(chain.update).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cross-check failed'))
  })

  it('--dry-run never calls update, even when a name is found', async () => {
    mockRetrieve.mockResolvedValue({
      collected_information: { shipping_details: { name: 'Sarah Whitfield' } },
      customer_details: { email: 'sarah@test.com' },
    })
    const chain = await run(
      [{ id: 'r5', customer_email: 'sarah@test.com', stripe_checkout_session_id: 'cs_5' }],
      ['--dry-run'],
    )

    expect(chain.update).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
  })

  it('does not abort the batch when one session fails to retrieve', async () => {
    mockRetrieve
      .mockRejectedValueOnce(new Error('No such checkout session: cs_bad'))
      .mockResolvedValueOnce({
        collected_information: { shipping_details: { name: 'Sarah Whitfield' } },
        customer_details: { email: 'sarah@test.com' },
      })
    const chain = await run([
      { id: 'r6', customer_email: 'bad@test.com', stripe_checkout_session_id: 'cs_bad' },
      { id: 'r7', customer_email: 'sarah@test.com', stripe_checkout_session_id: 'cs_7' },
    ])

    expect(chain.update).toHaveBeenCalledTimes(1)
    expect(chain.eq).toHaveBeenCalledWith('id', 'r7')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('r6'))
  })

  it('only queries reservations with no name yet and a Stripe session on file', async () => {
    mockRetrieve.mockResolvedValue({ collected_information: null, customer_details: null })
    const chain = await run([])

    expect(chain.select).toHaveBeenCalledWith('id, customer_email, stripe_checkout_session_id')
    expect(chain.is).toHaveBeenCalledWith('customer_name', null)
    expect(chain.not).toHaveBeenCalledWith('stripe_checkout_session_id', 'is', null)
  })
})

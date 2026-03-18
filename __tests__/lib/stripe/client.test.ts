/**
 * @jest-environment node
 */

describe('stripe client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv, STRIPE_SECRET_KEY: 'sk_test_fake' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('exports a Stripe instance', async () => {
    const { stripe } = await import('@/lib/stripe/client')
    expect(stripe).toBeDefined()
    expect(typeof stripe.checkout).toBe('object')
  })
})

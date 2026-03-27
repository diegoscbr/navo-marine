import { bookingPending, bookingConfirmed, paymentRequest } from '@/lib/email/templates'

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
    const result = bookingConfirmed({ ...base, orderId: 'ord-xyz-456' })
    expect(result.to).toBe('sailor@test.com')
    expect(result.subject).toContain('confirmed')
  })

  it('html contains product name, dates, amount, orderId, reservationId', () => {
    const { html } = bookingConfirmed({ ...base, orderId: 'ord-xyz-456' })
    expect(html).toContain('Atlas 2 Rental')
    expect(html).toContain('2026-04-10')
    expect(html).toContain('2026-04-14')
    expect(html).toContain('$245.00')
    expect(html).toContain('ord-xyz-456')
    expect(html).toContain('res-abc-123')
  })

  it('handles null dates gracefully', () => {
    const { html } = bookingConfirmed({ ...base, orderId: 'ord-xyz-456', startDate: null, endDate: null })
    expect(html).toContain('See event details')
  })
})

describe('paymentRequest', () => {
  const paymentBase = {
    ...base,
    paymentUrl: 'https://checkout.stripe.com/c/pay_test123',
  }

  it('returns correct to and subject', () => {
    const result = paymentRequest(paymentBase)
    expect(result.to).toBe('sailor@test.com')
    expect(result.subject).toBe('Complete your payment - Atlas 2 Rental')
  })

  it('html contains product name, dates, amount, reservationId, and payment link', () => {
    const { html } = paymentRequest(paymentBase)
    expect(html).toContain('Atlas 2 Rental')
    expect(html).toContain('2026-04-10')
    expect(html).toContain('2026-04-14')
    expect(html).toContain('$245.00')
    expect(html).toContain('res-abc-123')
    expect(html).toContain('https://checkout.stripe.com/c/pay_test123')
  })

  it('contains a Complete Your Payment CTA link', () => {
    const { html } = paymentRequest(paymentBase)
    expect(html).toContain('Complete Your Payment')
    expect(html).toContain('href="https://checkout.stripe.com/c/pay_test123"')
  })

  it('handles null dates gracefully', () => {
    const { html } = paymentRequest({ ...paymentBase, startDate: null, endDate: null })
    expect(html).toContain('See booking details')
    expect(html).not.toContain('2026-04-10')
  })
})

import { daysBetween, isValidDate, formatDateRange } from '@/lib/utils/dates'

describe('daysBetween', () => {
  it('returns 1 for same day', () => {
    expect(daysBetween('2026-03-20', '2026-03-20')).toBe(1)
  })

  it('returns 5 for a 5-day range', () => {
    expect(daysBetween('2026-03-20', '2026-03-24')).toBe(5)
  })

  it('returns 1 minimum even if end is before start (guard)', () => {
    expect(daysBetween('2026-03-24', '2026-03-20')).toBe(1)
  })
})

describe('isValidDate', () => {
  it('returns true for valid ISO date string', () => {
    expect(isValidDate('2026-03-20')).toBe(true)
  })

  it('returns false for garbage string', () => {
    expect(isValidDate('not-a-date')).toBe(false)
  })

  it('returns false for invalid date like 2026-13-45', () => {
    expect(isValidDate('2026-13-45')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidDate('')).toBe(false)
  })

  it('returns false for impossible calendar date like Feb 30', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
  })
})

describe('formatDateRange', () => {
  it('formats a multi-day range', () => {
    const result = formatDateRange('2026-03-20', '2026-03-24')
    expect(result).toContain('Mar')
    expect(result).toContain('20')
    expect(result).toContain('24')
    expect(result).toContain('2026')
  })

  it('formats a same-day range without dash', () => {
    const result = formatDateRange('2026-03-20', '2026-03-20')
    expect(result).toContain('Mar 20')
    expect(result).toContain('2026')
    expect(result).not.toContain('–')
  })
})

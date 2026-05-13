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
  it('formats same-day as a single date with year', () => {
    expect(formatDateRange('2026-03-20', '2026-03-20')).toBe('Mar 20, 2026')
  })

  it('formats same month + year as a compressed range', () => {
    expect(formatDateRange('2026-03-20', '2026-03-24')).toBe('Mar 20–24, 2026')
  })

  it('formats same year, different month as two dates', () => {
    expect(formatDateRange('2026-03-28', '2026-04-02')).toBe('Mar 28 – Apr 2, 2026')
  })

  it('formats different years with full dates on both sides', () => {
    expect(formatDateRange('2025-12-30', '2026-01-05')).toBe('Dec 30, 2025 – Jan 5, 2026')
  })

  it('never emits the broken "year (day: N)" intl artifact', () => {
    expect(formatDateRange('2026-06-25', '2026-06-27')).not.toMatch(/day:/i)
    expect(formatDateRange('2026-06-25', '2026-06-27')).toBe('Jun 25–27, 2026')
  })
})

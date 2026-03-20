/**
 * Number of days in a date range, inclusive (same day = 1).
 * Always returns at least 1.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const msPerDay = 1000 * 60 * 60 * 24
  const diff = Math.round((end.getTime() - start.getTime()) / msPerDay)
  return Math.max(1, diff + 1)
}

/**
 * Returns true if the string is a valid YYYY-MM-DD calendar date.
 * Uses noon UTC to avoid timezone-related Invalid Date edge cases.
 * Performs a round-trip check so Feb 30 → fails (JS would coerce to Mar 2).
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr + 'T12:00:00Z')
  if (isNaN(d.getTime())) return false
  const [year, month, day] = dateStr.split('-').map(Number)
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  )
}

/**
 * Human-readable date range label, e.g. "Mar 20–24, 2026" or "Mar 20, 2026".
 * Parses as noon UTC to prevent off-by-one display in US timezones.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T12:00:00Z')
  const end = new Date(endDate + 'T12:00:00Z')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', opts)
  }

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })
  return `${startStr}–${endStr}`
}

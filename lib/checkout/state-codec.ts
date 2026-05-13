import { isValidDate } from '@/lib/utils/dates'

// API constraints from app/api/checkout/route.ts — codec mirrors them exactly
const EXTRA_DAYS_MAX = 14
const QUANTITY_MIN = 1
const QUANTITY_MAX = 8

// Self-loop destinations that must never appear as callbackUrl
const SELF_LOOP_PATHS = ['/login', '/auth/redirect']

export type RentalEventSelection = {
  reservation_type: 'rental_event'
  product_id: string
  event_id: string
  sail_number: string
  extra_days?: number
}

export type RentalCustomSelection = {
  reservation_type: 'rental_custom'
  product_id: string
  date_window_id: string
  sail_number: string
  extra_days?: number
}

export type RegattaPackageSelection = {
  reservation_type: 'regatta_package'
  product_id: string
  start_date: string
  end_date: string
}

export type PurchaseSelection = {
  reservation_type: 'purchase'
  product_id: string
  quantity: number
  warranty_selected: boolean
}

export type Selection =
  | RentalEventSelection
  | RentalCustomSelection
  | RegattaPackageSelection
  | PurchaseSelection

function isNonEmptyTrimmed(value: string | null): value is string {
  return value !== null && value.trim().length > 0
}

function parseBool(value: string | null): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseExtraDays(value: string | null): number | null {
  if (value === null) return null
  const n = Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < 0 || n > EXTRA_DAYS_MAX) return null
  return n
}

function parseQuantity(value: string | null): number | null {
  if (value === null) return null
  const n = Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < QUANTITY_MIN || n > QUANTITY_MAX) return null
  return n
}

export function encodeSelection(selection: Selection): URLSearchParams {
  const params = new URLSearchParams()
  params.set('reservation_type', selection.reservation_type)
  params.set('product_id', selection.product_id)

  switch (selection.reservation_type) {
    case 'rental_event':
      params.set('event_id', selection.event_id)
      params.set('sail_number', selection.sail_number)
      if (selection.extra_days !== undefined) {
        params.set('extra_days', String(selection.extra_days))
      }
      break
    case 'rental_custom':
      params.set('date_window_id', selection.date_window_id)
      params.set('sail_number', selection.sail_number)
      if (selection.extra_days !== undefined) {
        params.set('extra_days', String(selection.extra_days))
      }
      break
    case 'regatta_package':
      params.set('start_date', selection.start_date)
      params.set('end_date', selection.end_date)
      break
    case 'purchase':
      params.set('quantity', String(selection.quantity))
      params.set('warranty_selected', String(selection.warranty_selected))
      break
  }
  return params
}

export function decodeSelection(params: URLSearchParams): Selection | null {
  const kind = params.get('reservation_type')
  const productId = params.get('product_id')
  if (!isNonEmptyTrimmed(productId)) return null

  switch (kind) {
    case 'rental_event': {
      const eventId = params.get('event_id')
      const sailNumber = params.get('sail_number')
      if (!isNonEmptyTrimmed(eventId) || !isNonEmptyTrimmed(sailNumber)) return null
      const base: RentalEventSelection = {
        reservation_type: 'rental_event',
        product_id: productId.trim(),
        event_id: eventId.trim(),
        sail_number: sailNumber.trim(),
      }
      if (!params.has('extra_days')) return base
      const extraDays = parseExtraDays(params.get('extra_days'))
      if (extraDays === null) return null
      return { ...base, extra_days: extraDays }
    }
    case 'rental_custom': {
      const windowId = params.get('date_window_id')
      const sailNumber = params.get('sail_number')
      if (!isNonEmptyTrimmed(windowId) || !isNonEmptyTrimmed(sailNumber)) return null
      const base: RentalCustomSelection = {
        reservation_type: 'rental_custom',
        product_id: productId.trim(),
        date_window_id: windowId.trim(),
        sail_number: sailNumber.trim(),
      }
      if (!params.has('extra_days')) return base
      const extraDays = parseExtraDays(params.get('extra_days'))
      if (extraDays === null) return null
      return { ...base, extra_days: extraDays }
    }
    case 'regatta_package': {
      const startDate = params.get('start_date')
      const endDate = params.get('end_date')
      if (!startDate || !endDate) return null
      // isValidDate from lib/utils/dates.ts does round-trip validation (catches Feb-30, etc.)
      if (!isValidDate(startDate) || !isValidDate(endDate)) return null
      if (new Date(endDate) < new Date(startDate)) return null
      return {
        reservation_type: 'regatta_package',
        product_id: productId.trim(),
        start_date: startDate,
        end_date: endDate,
      }
    }
    case 'purchase': {
      const quantity = parseQuantity(params.get('quantity'))
      const warranty = parseBool(params.get('warranty_selected'))
      if (quantity === null || warranty === null) return null
      return {
        reservation_type: 'purchase',
        product_id: productId.trim(),
        quantity,
        warranty_selected: warranty,
      }
    }
    default:
      return null
  }
}

export function buildLoginUrl(currentPath: string, selection: Selection): string {
  const stateParams = encodeSelection(selection)
  const callbackUrl = `${currentPath}?${stateParams.toString()}`
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
}

/**
 * Validates that a callback URL is a safe same-origin path.
 *
 * Defenses:
 * - Must start with `/`.
 * - Reject protocol-relative (`//evil.com`, `\\evil.com`) and percent-encoded variants.
 * - Reject control-character prefixes some browsers strip.
 * - Reject self-loops to /login and /auth/redirect (prevents redirect loops).
 * - Reject path-traversal segments (`/..`).
 * - Normalize via URL constructor and assert same-origin.
 */
export function isSafeCallbackUrl(url: string): boolean {
  if (url.length === 0) return false
  if (!url.startsWith('/')) return false

  // Reject control chars (tab/newline/etc.) — some browsers strip them.
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) < 0x20) return false
  }

  // Reject protocol-relative variants and their encodings.
  if (url.startsWith('//') || url.startsWith('/\\')) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('/%2f') || lower.startsWith('/%5c')) return false

  // Reject path traversal.
  if (url.includes('/..') || url.includes('/%2e%2e') || lower.includes('/%2e.')) {
    return false
  }

  // Normalize via URL parser; ensure origin stays on the synthetic host.
  let parsed: URL
  try {
    parsed = new URL(url, 'http://x.invalid')
  } catch {
    return false
  }
  if (parsed.origin !== 'http://x.invalid') return false

  // Reject self-loops (would trap the user in a redirect cycle).
  const pathname = parsed.pathname
  if (SELF_LOOP_PATHS.includes(pathname)) return false

  return true
}

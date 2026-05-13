/**
 * @jest-environment node
 */
import {
  encodeSelection,
  decodeSelection,
  buildLoginUrl,
  isSafeCallbackUrl,
  type Selection,
} from '@/lib/checkout/state-codec'

describe('encodeSelection / decodeSelection — round trips', () => {
  it('rental_event', () => {
    const selection: Selection = {
      reservation_type: 'rental_event',
      product_id: 'prod-uuid-1',
      event_id: 'event-uuid-1',
      sail_number: 'US-12345',
      extra_days: 2,
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })

  it('rental_event without optional extra_days', () => {
    const selection: Selection = {
      reservation_type: 'rental_event',
      product_id: 'prod-uuid-1',
      event_id: 'event-uuid-1',
      sail_number: 'US-12345',
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })

  it('rental_custom', () => {
    const selection: Selection = {
      reservation_type: 'rental_custom',
      product_id: 'prod-uuid-1',
      date_window_id: 'window-uuid-1',
      sail_number: 'US-12345',
      extra_days: 1,
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })

  it('regatta_package', () => {
    const selection: Selection = {
      reservation_type: 'regatta_package',
      product_id: 'pkg-uuid-1',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })

  it('purchase', () => {
    const selection: Selection = {
      reservation_type: 'purchase',
      product_id: 'atlas-2',
      quantity: 2,
      warranty_selected: true,
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })

  it('purchase with warranty_selected=false', () => {
    const selection: Selection = {
      reservation_type: 'purchase',
      product_id: 'atlas-2',
      quantity: 1,
      warranty_selected: false,
    }
    expect(decodeSelection(encodeSelection(selection))).toEqual(selection)
  })
})

describe('decodeSelection — rejection cases', () => {
  it('returns null when reservation_type is missing', () => {
    expect(decodeSelection(new URLSearchParams('product_id=x'))).toBeNull()
  })

  it('returns null when reservation_type is unknown', () => {
    expect(decodeSelection(new URLSearchParams('reservation_type=membership&product_id=x'))).toBeNull()
  })

  it('returns null when rental_event is missing required fields', () => {
    expect(decodeSelection(new URLSearchParams('reservation_type=rental_event&product_id=x'))).toBeNull()
  })

  it('returns null when extra_days exceeds 14 (API cap)', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=rental_event&product_id=x&event_id=e&sail_number=US-1&extra_days=15',
    ))).toBeNull()
  })

  it('returns null when extra_days is negative', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=rental_event&product_id=x&event_id=e&sail_number=US-1&extra_days=-1',
    ))).toBeNull()
  })

  it('returns null when sail_number is whitespace-only', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=rental_event&product_id=x&event_id=e&sail_number=%20%20',
    ))).toBeNull()
  })

  it('returns null when regatta_package date is impossible (Feb 30)', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=regatta_package&product_id=x&start_date=2026-02-30&end_date=2026-04-12',
    ))).toBeNull()
  })

  it('returns null when regatta_package end_date is before start_date', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=regatta_package&product_id=x&start_date=2026-05-10&end_date=2026-05-09',
    ))).toBeNull()
  })

  it('returns null when purchase quantity is 0', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=purchase&product_id=x&quantity=0&warranty_selected=true',
    ))).toBeNull()
  })

  it('returns null when purchase quantity exceeds 8 (API cap)', () => {
    expect(decodeSelection(new URLSearchParams(
      'reservation_type=purchase&product_id=x&quantity=9&warranty_selected=true',
    ))).toBeNull()
  })
})

describe('buildLoginUrl', () => {
  it('builds /login URL with selection embedded inside callbackUrl', () => {
    const selection: Selection = {
      reservation_type: 'rental_event',
      product_id: 'p1',
      event_id: 'e1',
      sail_number: 'US-1',
    }
    const url = buildLoginUrl('/reserve', selection)
    expect(url.startsWith('/login?callbackUrl=')).toBe(true)
    const callbackUrl = decodeURIComponent(url.split('callbackUrl=')[1])
    expect(callbackUrl.startsWith('/reserve?')).toBe(true)
    expect(decodeSelection(new URLSearchParams(callbackUrl.split('?')[1]))).toEqual(selection)
  })
})

describe('isSafeCallbackUrl', () => {
  it('accepts same-origin paths', () => {
    expect(isSafeCallbackUrl('/reserve')).toBe(true)
    expect(isSafeCallbackUrl('/reserve?event_id=x')).toBe(true)
    expect(isSafeCallbackUrl('/products/atlas-2?quantity=1')).toBe(true)
  })

  it('rejects absolute URLs (http/https)', () => {
    expect(isSafeCallbackUrl('https://evil.com')).toBe(false)
    expect(isSafeCallbackUrl('http://example.com/reserve')).toBe(false)
  })

  it('rejects protocol-relative URLs', () => {
    expect(isSafeCallbackUrl('//evil.com/path')).toBe(false)
  })

  it('rejects encoded protocol-relative tricks', () => {
    expect(isSafeCallbackUrl('/%2F%2Fevil.com')).toBe(false)
    expect(isSafeCallbackUrl('/%5C%5Cevil.com')).toBe(false)
  })

  it('rejects backslash variants', () => {
    expect(isSafeCallbackUrl('/\\evil.com')).toBe(false)
    expect(isSafeCallbackUrl('\\\\evil.com')).toBe(false)
  })

  it('rejects URLs that do not start with /', () => {
    expect(isSafeCallbackUrl('reserve')).toBe(false)
    expect(isSafeCallbackUrl('')).toBe(false)
  })

  it('rejects whitespace/control-char prefixes', () => {
    expect(isSafeCallbackUrl('/\t//evil.com')).toBe(false)
    expect(isSafeCallbackUrl('/\n/evil.com')).toBe(false)
  })

  it('rejects self-loops to /login and /auth/redirect', () => {
    expect(isSafeCallbackUrl('/login')).toBe(false)
    expect(isSafeCallbackUrl('/login?callbackUrl=/reserve')).toBe(false)
    expect(isSafeCallbackUrl('/auth/redirect')).toBe(false)
  })

  it('rejects path traversal segments', () => {
    expect(isSafeCallbackUrl('/../etc/passwd')).toBe(false)
    expect(isSafeCallbackUrl('/reserve/../admin')).toBe(false)
  })

  it('rejects dot-prefixed paths that browsers may normalize as protocol-relative', () => {
    expect(isSafeCallbackUrl('/.//evil.com')).toBe(false)
    expect(isSafeCallbackUrl('/./evil.com')).toBe(false)
    expect(isSafeCallbackUrl('/.well-known/openid-configuration')).toBe(false)
  })
})

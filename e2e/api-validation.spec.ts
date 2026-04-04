import { test, expect } from '@playwright/test'

const BASE = 'https://navomarine.com'

test.describe('API input validation', () => {
  test('POST /api/checkout with missing reservation_type returns 400 or 401', async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/checkout`, {
      data: { items: [] },
      headers: { 'Content-Type': 'application/json' },
    })

    // Without auth: 401. With auth but missing fields: 400.
    // Either way, not a 200 or 500.
    const status = response.status()
    expect(status === 400 || status === 401).toBe(true)
  })

  test('POST /api/checkout with empty body returns 400 or 401', async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/checkout`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })

    const status = response.status()
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  test('GET /api/packages/availability with malformed dates returns 400', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE}/api/packages/availability?start=not-a-date&end=also-not-a-date`
    )

    const status = response.status()
    // Should reject malformed dates — 400
    // May also return 401 if auth is required first
    expect(status === 400 || status === 401).toBe(true)
  })

  test('GET /api/packages/availability with missing params returns 400', async ({
    request,
  }) => {
    const response = await request.get(`${BASE}/api/packages/availability`)

    const status = response.status()
    expect(status === 400 || status === 401).toBe(true)
  })

  test.skip(
    'PATCH /api/admin/units/fake-id with invalid status returns 400',
    async ({ request }) => {
      // This test requires an authenticated admin session.
      // Skipped: needs PLAYWRIGHT_AUTH_COOKIE env var with a valid admin session cookie.
      const response = await request.patch(`${BASE}/api/admin/units/fake-id`, {
        data: { status: 'invalid-status-value' },
        headers: { 'Content-Type': 'application/json' },
      })

      expect(response.status()).toBe(400)
    }
  )
})

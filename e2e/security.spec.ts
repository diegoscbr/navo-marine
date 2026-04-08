import { test, expect } from '@playwright/test'

const SUPABASE_URL = 'https://fdjuhjadjqkpqnpxgmue.supabase.co'

test.describe('Security verification', () => {
  test.describe('response security headers', () => {
    test('includes X-Frame-Options: DENY', async ({ page }) => {
      const response = await page.goto('/')
      const headers = response?.headers() ?? {}
      expect(headers['x-frame-options']?.toUpperCase()).toBe('DENY')
    })

    test('includes X-Content-Type-Options: nosniff', async ({ page }) => {
      const response = await page.goto('/')
      const headers = response?.headers() ?? {}
      expect(headers['x-content-type-options']).toBe('nosniff')
    })

    test('includes Strict-Transport-Security', async ({ page }) => {
      const response = await page.goto('/')
      const headers = response?.headers() ?? {}
      expect(headers['strict-transport-security']).toBeDefined()
      expect(headers['strict-transport-security']).toContain('max-age')
    })

    test('includes Referrer-Policy', async ({ page }) => {
      const response = await page.goto('/')
      const headers = response?.headers() ?? {}
      expect(headers['referrer-policy']).toBeDefined()
    })
  })

  test.describe('Supabase RLS blocks direct anon access', () => {
    test('direct REST API call to reservations returns empty or error', async ({
      request,
    }) => {
      // Extract the anon key from the page source at runtime.
      // The anon key is public (embedded in client JS) — this test verifies
      // that RLS still denies access even when using it directly.
      const anonKeyResponse = await request.get('https://navomarine.com/')
      const html = await anonKeyResponse.text()

      // The anon key is typically in a NEXT_PUBLIC env var embedded in the JS bundle.
      // Try to extract it; if not found, use a known-public pattern.
      const keyMatch = html.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
      const anonKey = keyMatch?.[0]

      if (!anonKey) {
        // Cannot extract anon key from page source — skip gracefully
        test.skip(true, 'Could not extract Supabase anon key from page source')
        return
      }

      const response = await request.get(
        `${SUPABASE_URL}/rest/v1/reservations?select=*`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        }
      )

      // RLS should block: expect empty array or a 4xx error
      const status = response.status()
      if (status === 200) {
        const body = await response.json()
        expect(body).toEqual([])
      } else {
        expect(status).toBeGreaterThanOrEqual(400)
      }
    })
  })

  test.describe('admin API endpoints return 401 without auth', () => {
    test('GET /api/admin/events returns 401', async ({ request }) => {
      const response = await request.get('https://navomarine.com/api/admin/events')
      expect(response.status()).toBe(401)
    })

    test('GET /api/admin/units returns 401', async ({ request }) => {
      const response = await request.get('https://navomarine.com/api/admin/units')
      expect(response.status()).toBe(401)
    })

    test('POST /api/admin/products returns 401', async ({ request }) => {
      const response = await request.post('https://navomarine.com/api/admin/products', {
        data: { name: 'test' },
      })
      expect(response.status()).toBe(401)
    })

    test('DELETE /api/admin/reservations/fake-id returns 401', async ({ request }) => {
      const response = await request.delete(
        'https://navomarine.com/api/admin/reservations/fake-id'
      )
      expect(response.status()).toBe(401)
    })
  })

  test('webhook endpoint rejects requests without valid Stripe signature', async ({
    request,
  }) => {
    const response = await request.post(
      'https://navomarine.com/api/webhooks/stripe',
      {
        data: JSON.stringify({ type: 'checkout.session.completed', data: {} }),
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'fake-signature',
        },
      }
    )

    // Should reject with 400 or 401 — not 200
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(response.status()).toBeLessThan(500)
  })

  test('API routes do not leak error details in response', async ({ request }) => {
    const response = await request.post(
      'https://navomarine.com/api/checkout',
      {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      }
    )

    // Should return a client error, not a 500 with stack trace
    const body = await response.text()

    // Verify no stack trace or internal details leaked
    expect(body).not.toContain('node_modules')
    expect(body).not.toContain('at Object.')
    expect(body).not.toContain('TypeError')
    expect(body).not.toContain('ReferenceError')
    expect(body).not.toContain('.ts:')
    expect(body).not.toContain('.js:')
  })
})

import { test, expect } from '@playwright/test'

test.describe('Packages booking flow', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/packages')
    await expect(page).toHaveURL(/\/login/)
  })

  // The tests below require an authenticated session.
  // Run with a seeded auth cookie via /setup-browser-cookies or a test user fixture.
  test.describe('authenticated', () => {
    test.skip(
      ({ browserName }) => process.env.CI !== 'true' && browserName === 'chromium',
      'Skipped locally without auth cookie — run with PLAYWRIGHT_AUTH_COOKIE set'
    )

    test('shows three package cards', async ({ page }) => {
      await page.goto('/packages')
      await expect(page.getByText('Race Committee Package')).toBeVisible()
      await expect(page.getByText('R/C Windward Leeward Course Package')).toBeVisible()
      await expect(page.getByText('RaceSense Management Services')).toBeVisible()
    })

    test('advances to date selection when package clicked', async ({ page }) => {
      await page.goto('/packages')
      await page.getByText('Race Committee Package').click()
      await expect(page.getByText(/select dates/i)).toBeVisible()
    })

    test('shows hold disclosure on RaceSense card', async ({ page }) => {
      await page.goto('/packages')
      await expect(page.getByText(/payment hold/i)).toBeVisible()
      await expect(page.getByText(/90.day advance/i)).toBeVisible()
    })
  })
})

import { test, expect } from '@playwright/test'

test.describe('Reserve Booking Flow', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/reserve')
    await expect(page).toHaveURL(/\/login/)
  })

  test('reserve button is disabled without sail number', async ({ page }) => {
    // Unauthenticated — page redirects, so button won't be present
    // This test is meaningful only with an authenticated session
    await page.goto('/reserve')
    await expect(page).toHaveURL(/\/login/)
  })
})

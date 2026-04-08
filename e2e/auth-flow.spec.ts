import { test, expect } from '@playwright/test'

test.describe('Authentication behavior', () => {
  test.describe('protected routes redirect unauthenticated users to /login', () => {
    test('/dashboard redirects to /login', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/login/)
    })

    test('/admin redirects to /login', async ({ page }) => {
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/login/)
    })

    test('/reserve redirects to /login', async ({ page }) => {
      await page.goto('/reserve')
      await expect(page).toHaveURL(/\/login/)
    })

    test('/packages redirects to /login', async ({ page }) => {
      await page.goto('/packages')
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test('login page shows Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    // Look for a Google sign-in button or link
    const googleButton = page.getByRole('button', { name: /google/i }).or(
      page.getByRole('link', { name: /google/i })
    )
    await expect(googleButton).toBeVisible()
  })

  test.describe('public pages are accessible without authentication', () => {
    const publicRoutes = [
      { path: '/', name: 'homepage' },
      { path: '/products', name: 'products listing' },
      { path: '/products/atlas-2', name: 'product detail' },
      { path: '/capabilities', name: 'capabilities' },
      { path: '/contact', name: 'contact' },
    ]

    for (const route of publicRoutes) {
      test(`${route.name} (${route.path}) loads without redirect`, async ({ page }) => {
        const response = await page.goto(route.path)
        expect(response?.ok()).toBe(true)
        // Should NOT redirect to /login
        expect(page.url()).not.toContain('/login')
      })
    }
  })
})

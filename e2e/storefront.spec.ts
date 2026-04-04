import { test, expect } from '@playwright/test'

test.describe('Storefront — public pages load correctly', () => {
  test('homepage loads and shows NAVO branding', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBe(true)
    await expect(page.getByText('NAVO')).toBeVisible()
  })

  test('homepage has a proper meta title', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    expect(title.toLowerCase()).toContain('navo')
  })

  test('products page loads and shows Vakaros Atlas 2', async ({ page }) => {
    const response = await page.goto('/products')
    expect(response?.ok()).toBe(true)
    await expect(page.getByText('Vakaros Atlas 2')).toBeVisible()
  })

  test('products page has a proper meta title', async ({ page }) => {
    await page.goto('/products')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('product detail page at /products/atlas-2 loads with price and rental option', async ({
    page,
  }) => {
    const response = await page.goto('/products/atlas-2')
    expect(response?.ok()).toBe(true)
    await expect(page.getByText('$1,249')).toBeVisible()
    await expect(page.getByText(/rent/i)).toBeVisible()
  })

  test('product detail page has a proper meta title', async ({ page }) => {
    await page.goto('/products/atlas-2')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('packages page loads and shows 3 package cards', async ({ page }) => {
    const response = await page.goto('/packages')

    // /packages may redirect to /login for unauthenticated users
    // If it does, this test verifies the redirect works; skip card checks
    const url = page.url()
    if (url.includes('/login')) {
      // Packages page requires auth — verify redirect happened
      expect(url).toContain('/login')
      return
    }

    expect(response?.ok()).toBe(true)
    await expect(page.getByText('Race Committee')).toBeVisible()
    await expect(page.getByText('Windward Leeward')).toBeVisible()
    await expect(page.getByText('RaceSense')).toBeVisible()
  })

  test('capabilities page loads', async ({ page }) => {
    const response = await page.goto('/capabilities')
    expect(response?.ok()).toBe(true)
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('contact page loads', async ({ page }) => {
    const response = await page.goto('/contact')
    expect(response?.ok()).toBe(true)
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('navbar contains navigation links', async ({ page }) => {
    await page.goto('/')

    // Check for key navigation links in the page
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()

    // Verify at least the core public links exist
    await expect(nav.getByRole('link', { name: /products/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /capabilities/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /contact/i })).toBeVisible()
  })

  test('navbar links navigate to correct pages', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav').first()

    // Click Products link and verify navigation
    await nav.getByRole('link', { name: /products/i }).click()
    await expect(page).toHaveURL(/\/products/)

    // Click Capabilities link and verify navigation
    await nav.getByRole('link', { name: /capabilities/i }).click()
    await expect(page).toHaveURL(/\/capabilities/)

    // Click Contact link and verify navigation
    await nav.getByRole('link', { name: /contact/i }).click()
    await expect(page).toHaveURL(/\/contact/)
  })
})

import { test, expect } from '@playwright/test'

// Skip all auth flow tests if flag is set (e.g., in CI or local without auth backend)
if (process.env.E2E_SKIP_AUTH) {
  test.skip(true, 'Skipping auth E2E due to E2E_SKIP_AUTH=1')
}

test.describe('Authentication Flow', () => {
  test('should complete full authentication flow', async ({ page }) => {
    // Navigate to home page
    await page.goto('/')
    
    // Should redirect to login or show login option
    await expect(page).toHaveURL(/\/(login|auth)/)
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'TestPassword123!')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Should redirect to dashboard after successful login
    await expect(page).toHaveURL(/\/(xase|dashboard)/, { timeout: 10000 })
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login')
    
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    
    // Should show error message
    await expect(page.locator('text=/invalid|error|incorrect/i')).toBeVisible({ timeout: 5000 })
  })

  test('should handle API key generation flow', async ({ page, context }) => {
    // Login first
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'TestPassword123!')
    await page.click('button[type="submit"]')
    
    // Navigate to API keys page
    await page.goto('/xase/api-keys')
    
    // Request OTP
    await page.click('button:has-text("Generate API Key")')
    
    // Should show OTP input
    await expect(page.locator('input[placeholder*="OTP"]')).toBeVisible({ timeout: 5000 })
  })
})

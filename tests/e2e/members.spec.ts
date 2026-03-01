/**
 * E2E Tests - Members Management
 * Playwright tests for RBAC member management
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

test.describe('Members Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`);
    
    // Navigate to members page
    await page.goto(`${BASE_URL}/members`);
  });

  test('should display members list', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Team Members');
    await expect(page.locator('button:has-text("Invite Member")')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('should open invite modal', async ({ page }) => {
    await page.click('button:has-text("Invite Member")');
    
    await expect(page.locator('h2:has-text("Invite Team Member")')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('select[name="role"]')).toBeVisible();
  });

  test('should validate email in invite form', async ({ page }) => {
    await page.click('button:has-text("Invite Member")');
    
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email')).toBeVisible();
  });

  test('should successfully invite member', async ({ page }) => {
    const timestamp = Date.now();
    const email = `newmember${timestamp}@example.com`;
    
    await page.click('button:has-text("Invite Member")');
    
    await page.fill('input[name="email"]', email);
    await page.selectOption('select[name="role"]', 'MEMBER');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invitation sent successfully')).toBeVisible();
  });

  test('should display member roles', async ({ page }) => {
    const roles = ['Owner', 'Admin', 'Member', 'Viewer'];
    
    for (const role of roles) {
      await expect(page.locator(`text=${role}`).first()).toBeVisible();
    }
  });

  test('should update member role', async ({ page }) => {
    // Find first member row
    const firstMemberRow = page.locator('tbody tr').first();
    const roleSelect = firstMemberRow.locator('select');
    
    await roleSelect.selectOption('ADMIN');
    
    await expect(page.locator('text=Role updated successfully')).toBeVisible();
  });

  test('should remove member with confirmation', async ({ page }) => {
    // Mock confirm dialog
    page.on('dialog', dialog => dialog.accept());
    
    const removeButton = page.locator('button:has-text("Remove")').first();
    await removeButton.click();
    
    await expect(page.locator('text=Member removed successfully')).toBeVisible();
  });

  test('should cancel member removal', async ({ page }) => {
    // Mock confirm dialog to cancel
    page.on('dialog', dialog => dialog.dismiss());
    
    const initialRowCount = await page.locator('tbody tr').count();
    
    const removeButton = page.locator('button:has-text("Remove")').first();
    await removeButton.click();
    
    // Row count should remain the same
    const finalRowCount = await page.locator('tbody tr').count();
    expect(finalRowCount).toBe(initialRowCount);
  });

  test('should display custom permissions for custom role', async ({ page }) => {
    await page.click('button:has-text("Invite Member")');
    
    await page.selectOption('select[name="role"]', 'CUSTOM');
    
    await expect(page.locator('text=Custom Permissions')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();
  });

  test('should select custom permissions', async ({ page }) => {
    await page.click('button:has-text("Invite Member")');
    
    await page.selectOption('select[name="role"]', 'CUSTOM');
    
    // Select some permissions
    await page.check('input[value="datasets:read"]');
    await page.check('input[value="datasets:write"]');
    await page.check('input[value="leases:read"]');
    
    const checkedBoxes = await page.locator('input[type="checkbox"]:checked').count();
    expect(checkedBoxes).toBeGreaterThan(0);
  });

  test('should show member permissions count', async ({ page }) => {
    const permissionsText = page.locator('text=/\\d+ permissions/').first();
    await expect(permissionsText).toBeVisible();
  });

  test('should filter members by search', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('admin');
      
      // Wait for filtered results
      await page.waitForTimeout(500);
      
      const visibleRows = await page.locator('tbody tr').count();
      expect(visibleRows).toBeGreaterThan(0);
    }
  });
});

test.describe('Member Permissions', () => {
  test('viewer cannot invite members', async ({ page }) => {
    // Login as viewer
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', 'viewer@example.com');
    await page.fill('input[name="password"]', 'Viewer123!');
    await page.click('button[type="submit"]');
    
    await page.goto(`${BASE_URL}/members`);
    
    // Invite button should not be visible or disabled
    const inviteButton = page.locator('button:has-text("Invite Member")');
    const isVisible = await inviteButton.isVisible();
    
    if (isVisible) {
      await expect(inviteButton).toBeDisabled();
    }
  });

  test('member cannot remove other members', async ({ page }) => {
    // Login as member
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', 'member@example.com');
    await page.fill('input[name="password"]', 'Member123!');
    await page.click('button[type="submit"]');
    
    await page.goto(`${BASE_URL}/members`);
    
    // Remove buttons should not be visible
    const removeButtons = page.locator('button:has-text("Remove")');
    const count = await removeButtons.count();
    expect(count).toBe(0);
  });
});

test.describe('Invite Acceptance', () => {
  test('should accept invitation via link', async ({ page }) => {
    const inviteToken = 'test-invite-token-123';
    
    await page.goto(`${BASE_URL}/invite/${inviteToken}`);
    
    await expect(page.locator('h1:has-text("Accept Invitation")')).toBeVisible();
    await expect(page.locator('button:has-text("Accept")')).toBeVisible();
  });

  test('should reject expired invitation', async ({ page }) => {
    const expiredToken = 'expired-token-123';
    
    await page.goto(`${BASE_URL}/invite/${expiredToken}`);
    
    await expect(page.locator('text=Invitation expired')).toBeVisible();
  });
});

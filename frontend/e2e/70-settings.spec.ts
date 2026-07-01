import { test, expect } from '@playwright/test';

test.describe('Settings pages', () => {
  test('settings page loads with navigation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('LLM endpoints page loads', async ({ page }) => {
    await page.goto('/settings/endpoints');
    // Wait for page content to render
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('MCP servers page loads', async ({ page }) => {
    await page.goto('/settings/mcp-servers');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('users page loads', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('knowledge page loads', async ({ page }) => {
    await page.goto('/settings/knowledge');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });
});

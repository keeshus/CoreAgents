import { test, expect } from '@playwright/test';

test.describe('Settings pages', () => {
  test('settings page loads with navigation tabs', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/settings/i)).toBeVisible();
  });

  test('LLM endpoints page shows empty state or list', async ({ page }) => {
    await page.goto('/settings/endpoints');

    // Should show either an empty state or a list of endpoints
    const heading = page.getByText(/llm|endpoint/i);
    await expect(heading).toBeVisible();
  });

  test('MCP servers page loads', async ({ page }) => {
    await page.goto('/settings/mcp-servers');
    const heading = page.getByText(/mcp/i);
    await expect(heading).toBeVisible();
  });

  test('users page loads', async ({ page }) => {
    await page.goto('/settings/users');
    const heading = page.getByText(/users/i);
    await expect(heading).toBeVisible();
  });

  test('knowledge page loads', async ({ page }) => {
    await page.goto('/settings/knowledge');
    const heading = page.getByText(/knowledge|vector/i);
    await expect(heading).toBeVisible();
  });

  test('navigation between settings tabs works', async ({ page }) => {
    await page.goto('/settings');

    // Click on each tab/link
    const tabs = page.locator('nav a, [role="tab"]');
    const tabCount = await tabs.count();
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      const tab = tabs.nth(i);
      await tab.click();
      await page.waitForTimeout(500);
      // Verify page loaded (no error boundary)
      const errorBoundary = page.locator('[class*="error"]');
      await expect(errorBoundary).toHaveCount(0);
    }
  });
});

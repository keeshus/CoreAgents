import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Settings pages', () => {
  const cleanupGroupIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of cleanupGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    cleanupGroupIds.length = 0;
  });

  test('settings page loads with navigation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('LLM endpoints page loads', async ({ page }) => {
    await page.goto('/settings/endpoints');
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

  // ═══════════════════════════════════════════════════════════════
  // ─── Group filter tests ──────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('endpoints page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `EP-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/endpoints');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('knowledge page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `KN-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/knowledge');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('mcp servers page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `MCP-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/mcp-servers');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });
});

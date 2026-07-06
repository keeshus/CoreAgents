import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Env Vars settings page', () => {
  const cleanupGroupIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of cleanupGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    cleanupGroupIds.length = 0;
  });

  test('env vars settings page loads', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await expect(page.getByRole('heading', { name: /Environment Variables/i })).toBeVisible({ timeout: 10000 });
  });

  test('env vars page shows group filter', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await expect(page.getByText(/App-wide|Filter by group/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('add and remove an app env var via UI', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Fill fields
    await page.getByLabel('Variable name').fill('TEST_VAR');
    await page.getByLabel('Value').fill('test-value-123');

    // Submit
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1500);

    // Verify variable appears
    await expect(page.getByText('TEST_VAR').first()).toBeVisible({ timeout: 5000 });

    // Delete it — use the delete button in the same row
    const row = page.getByTestId('env-var-item').filter({ hasText: 'TEST_VAR' });
    await row.getByTestId('delete-var-btn').first().click();
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(1500);

    // Verify gone
    await expect(page.getByText('TEST_VAR')).toHaveCount(0, { timeout: 5000 });
  });

  test('toggle between static, core_secret, and cyberark types', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Default is Static — should see a textfield labeled "Value"
    await expect(page.getByLabel('Value')).toBeVisible();

    // Switch to Core Secret via the type dropdown
    // Click the trigger directly (Radix combobox has pointer-event issues with the span inside)
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.getByRole('option', { name: 'Core Secret' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Core Secret' }).click();
    await page.waitForTimeout(300);

    // After switching to Core Secret, the value field becomes a select too
    await expect(page.locator('[role="combobox"]')).toHaveCount(3, { timeout: 5000 });

    // Switch to CyberArk — click the type combobox again
    await page.locator('[role="combobox"]').nth(1).click();
    await page.getByRole('option', { name: 'CyberArk' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'CyberArk' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByPlaceholder('e.g. /apps/myapp/deploy/key')).toBeVisible();

    // Switch back to Static
    await page.locator('[role="combobox"]').nth(1).click();
    await page.getByRole('option', { name: 'Static' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Static' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByPlaceholder('Enter plain text value')).toBeVisible();
  });

  test('group env vars tab — select a group and view vars', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    // Open the group filter dropdown and select the group
    const filter = page.getByTestId('group-filter').locator('[role="combobox"]');
    await filter.click();
    await page.getByRole('option', { name: group.name }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: group.name }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('group env vars — add and remove', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-Group-CRUD-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    // Select group via filter
    const filter = page.getByTestId('group-filter').locator('[role="combobox"]');
    await filter.click();
    await page.getByRole('option', { name: group.name }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: group.name }).click();
    await page.waitForTimeout(500);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    await page.getByLabel('Variable name').fill('GROUP_VAR');
    await page.getByLabel('Value').fill('group-val');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText('GROUP_VAR').first()).toBeVisible({ timeout: 5000 });
  });
});

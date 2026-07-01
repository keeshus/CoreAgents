import { test, expect } from '@playwright/test';

test.describe('Co-Pilot AI Assistant', () => {
  test('assistant button is visible on the flows page', async ({ page }) => {
    await page.goto('/');
    const assistantBtn = page.locator('button:has-text("Co-Pilot"), button[aria-label*="assistant"], button:has([class*="assistant"])').first();
    await expect(assistantBtn).toBeVisible();
  });

  test('clicking assistant button opens the panel', async ({ page }) => {
    await page.goto('/');
    const assistantBtn = page.locator('button:has-text("Co-Pilot"), button[aria-label*="assistant"], button:has([class*="assistant"])').first();
    await assistantBtn.click();

    // Panel should slide in
    const panel = page.locator('[class*="panel"], [class*="sidebar"], [role="dialog"]').first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('assistant panel has an input field', async ({ page }) => {
    await page.goto('/');
    const assistantBtn = page.locator('button:has-text("Co-Pilot"), button[aria-label*="assistant"], button:has([class*="assistant"])').first();
    await assistantBtn.click();

    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('sending a message shows the message in the panel', async ({ page }) => {
    await page.goto('/');
    const assistantBtn = page.locator('[data-testid="assistant-toggle"], button[aria-label*="assistant"]').first();
    if (await assistantBtn.isVisible()) {
      await assistantBtn.click();
    }

    const input = page.locator('textarea').first();
    await expect(input).toBeVisible({ timeout: 5000 });

    await input.fill('What page is this?');
    await page.keyboard.press('Enter');

    // The sent message should appear in the panel
    await expect(page.getByText('What page is this?')).toBeVisible({ timeout: 5000 });
  });
});

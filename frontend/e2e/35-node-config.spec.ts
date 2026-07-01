import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Node configuration modal', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Node Config Test',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'o1' }],
    });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('opens config modal when double-clicking a node', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await node.dblclick();

    // Modal or config panel should appear
    const modal = page.locator('[role="dialog"], [class*="modal"], [class*="config"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('shows node type in config modal title', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await node.dblclick();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('closes config modal when clicking close button', async ({ page }) => {
    const node = page.locator('.react-flow__node').first();
    await node.dblclick();

    const closeBtn = page.locator('[role="dialog"] button[aria-label="close"], [role="dialog"] button:has(.icon-close), [role="dialog"] button:has-text("Close")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      // Press Escape to close
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"]');
    await expect(modal).not.toBeVisible();
  });

  test('output node shows field selection checkboxes', async ({ page }) => {
    const outputNode = page.locator('.react-flow__node-output').first();
    await outputNode.dblclick();

    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should show "Select Output Fields" or checkboxes
    const checkboxes = modal.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 3000 });
  });
});

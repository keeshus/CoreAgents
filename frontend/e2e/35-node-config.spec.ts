import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

test.describe('Node configuration modal', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Node Config Test'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
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

  test('opens config modal when clicking a node', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    const node = page.locator('.react-flow__node').first();
    await node.click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
  });

  test('closes config modal when pressing Escape', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('output node shows field selection checkboxes', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    const outputNode = page.locator('.react-flow__node-output').first();
    await outputNode.click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    const checkboxes = modal.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 3000 });
  });
});

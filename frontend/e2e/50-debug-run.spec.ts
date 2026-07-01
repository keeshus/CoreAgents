import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

test.describe('Debug run', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Debug Run Test'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['trigger.message'] } } },
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

  test('debug button is visible on the editor', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await expect(page.getByTestId('debug-btn')).toBeVisible();
  });

  test('clicking debug opens the debug panel', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('debug-btn').click();
    await expect(page.getByText('Debug Run')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('debug-run-btn')).toBeVisible({ timeout: 5000 });
  });

  test('runs a simple trigger → output flow', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('debug-btn').click();
    await expect(page.getByTestId('debug-run-btn')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('debug-run-btn').click();
    // Steps should appear — at minimum the output step should complete
    const steps = page.locator('[class*="StepCard"], [class*="step"]');
    await expect(steps.first()).toBeVisible({ timeout: 20000 });
  });
});

import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

test.describe('Flow save and reload', () => {
  let flowId: string;
  let flowName: string;

  test.beforeEach(async ({ page, request }) => {
    flowName = uniqueFlowName('Save Load Test');
    const res = await createFlow(request, {
      name: flowName,
      description: 'Testing persistence',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 50 }, data: { label: 'My Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 50 }, data: { label: 'My Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    flowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('flow editor loads nodes and edges from saved flow', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });
  });

  test('node labels appear on canvas as saved', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('My Trigger')).toBeVisible();
    await expect(page.getByText('My Output')).toBeVisible();
  });

  test('flow name appears in the editor header', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Flow name')).toHaveValue(flowName, { timeout: 5000 });
  });

  test('reload preserves canvas state', async ({ page }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });
});

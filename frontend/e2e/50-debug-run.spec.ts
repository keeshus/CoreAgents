import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Debug run', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: 'Debug Run Test',
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

  test('run button is visible on the editor', async ({ page }) => {
    const runBtn = page.getByRole('button', { name: /run/i });
    await expect(runBtn).toBeVisible();
  });

  test('clicking run opens debug panel', async ({ page }) => {
    // Wait for canvas to load
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10000 });

    const runBtn = page.getByRole('button', { name: /run/i });
    await runBtn.click();

    // Debug panel should appear
    const debugPanel = page.locator('[class*="debug"], [class*="execution"], [class*="output"]').first();
    await expect(debugPanel).toBeVisible({ timeout: 10000 });
  });

  test('executes a simple trigger → output flow via run', async ({ page }) => {
    // Wait for canvas
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10000 });

    // Click Run
    const runBtn = page.getByRole('button', { name: /run/i });
    await runBtn.click();

    // Steps should appear in the debug panel
    const stepCards = page.locator('[class*="step"], [class*="StepCard"]');
    await expect(stepCards.first()).toBeVisible({ timeout: 15000 });

    // After execution, the output node step should show a completed state
    const completedStep = page.locator('[class*="completed"], [class*="success"], [class*="status"]:has-text("completed")').first();
    await expect(completedStep).toBeVisible({ timeout: 20000 });
  });

  test('run button is disabled during execution', async ({ page }) => {
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10000 });

    const runBtn = page.getByRole('button', { name: /run/i });
    await runBtn.click();

    // Run button should be disabled or show "Running..." while executing
    const runningBtn = page.getByRole('button', { name: /running/i });
    await expect(runningBtn).toBeVisible({ timeout: 5000 });
  });
});

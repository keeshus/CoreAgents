import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

const overlay = (page: any) => page.getByTestId('debug-overlay');

async function createCodeFlow(request: any, code: string) {
  const res = await createFlow(request, {
    name: uniqueFlowName('Debug Code Flow'),
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
      { id: 'c1', type: 'code', position: { x: 400, y: 0 }, data: { label: 'Compute', type: 'code', config: { code } } },
      { id: 'o1', type: 'output', position: { x: 800, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
    ],
    edges: [
      { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
      { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
    ],
  });
  return res.json();
}

async function expandStep(page: any, label: string) {
  await overlay(page).getByRole('button').filter({ hasText: label }).click();
}

test.describe('Debug run', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Debug Run Test'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['trigger.message'] } } },
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

  test('debug button is visible on the editor', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await expect(page.getByTestId('debug-btn')).toBeVisible();
  });

  test('clicking debug opens the debug panel', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('debug-btn').click();
    await expect(page.getByTestId('debug-run-btn')).toBeVisible({ timeout: 5000 });
  });

  test('runs a simple trigger → output flow and completes', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('debug-btn').click();
    await expect(page.getByTestId('debug-run-btn')).toBeVisible({ timeout: 5000 });

    // Fill the manual trigger input so the output node has a value to return
    await page.getByPlaceholder(/Enter the message to send to the flow/).fill('hello-debug');
    await page.getByTestId('debug-run-btn').click();

    // Execution completes and the output node step shows a completed status
    await expect(overlay(page).getByText('Completed').first()).toBeVisible({ timeout: 20000 });
    await expect(overlay(page).getByText('Final Output')).toBeVisible({ timeout: 5000 });
    await expect(overlay(page).getByText('hello-debug').first()).toBeVisible();
  });

  test('shows step output values from a code node', async ({ page, request }) => {
    const flow = await createCodeFlow(request, 'return { value: 42 };');
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('debug-btn').click();
    await page.getByTestId('debug-run-btn').click();

    await expect(overlay(page).getByText('Completed').first()).toBeVisible({ timeout: 20000 });

    // Expand the Compute step card and assert the computed output is shown
    await expandStep(page, 'Compute');
    await expect(overlay(page).getByText(/"value": 42/).first()).toBeVisible({ timeout: 5000 });

    await deleteFlow(request, flow.id);
  });

  test('steps appear in execution order', async ({ page, request }) => {
    const flow = await createCodeFlow(request, 'return input;');
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('debug-btn').click();
    await page.getByTestId('debug-run-btn').click();

    await expect(overlay(page).getByText('Completed').first()).toBeVisible({ timeout: 20000 });

    // Step cards are rendered in topological execution order: t1 → c1 → o1
    const labels = await overlay(page).locator('span.text-sm.font-medium').allTextContents();
    expect(labels).toEqual(['Trigger', 'Compute', 'Output']);

    await deleteFlow(request, flow.id);
  });

  test('debug input message is used by the flow', async ({ page, request }) => {
    const flow = await createCodeFlow(request, 'return { received: input.message };');
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('debug-btn').click();
    await expect(page.getByTestId('debug-run-btn')).toBeVisible({ timeout: 5000 });

    // Edit the trigger input in the debug panel
    await page.getByPlaceholder(/Enter the message to send to the flow/).fill('debug-hello-42');
    await page.getByTestId('debug-run-btn').click();
    await expect(overlay(page).getByText('Completed').first()).toBeVisible({ timeout: 20000 });

    // The code node received the filled message as input
    await expandStep(page, 'Compute');
    await expect(overlay(page).getByText('debug-hello-42').first()).toBeVisible({ timeout: 5000 });

    await deleteFlow(request, flow.id);
  });

  test('code node errors are displayed in the panel', async ({ page, request }) => {
    // A real throwing code node: the sandbox reports a non-zero exit code, the step
    // fails, and the error text (with the original exception) surfaces in the panel.
    const flow = await createCodeFlow(request, 'throw new Error("boom from code node");');
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('debug-btn').click();
    await page.getByTestId('debug-run-btn').click();

    // Panel status flips to Failed
    await expect(overlay(page).getByText('Failed').first()).toBeVisible({ timeout: 20000 });

    // The failing step shows the error message once expanded
    await expandStep(page, 'Compute');
    await expect(overlay(page).getByText(/boom from code node/).first()).toBeVisible({ timeout: 5000 });

    await deleteFlow(request, flow.id);
  });
});

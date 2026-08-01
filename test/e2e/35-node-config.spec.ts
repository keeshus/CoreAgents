import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

/**
 * Click the editor's Save button and wait for the flow to persist.
 * The editor occasionally loses its save handler after in-canvas edits (see report);
 * re-opening and closing a node's config modal refreshes it, so we retry that way.
 */
async function saveFlowAndWait(page: any, request: any, flowId: string, isSaved: (flow: any) => boolean, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    await page.getByRole('button', { name: 'Save' }).click();
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const r = await request.get(`${API_URL}/flows/${flowId}`);
      if (r.ok()) {
        const f = await r.json();
        if (isSaved(f)) return;
      }
      await page.waitForTimeout(400);
    }
    if (i < attempts - 1) {
      await page.locator('.react-flow__node').first().click();
      await page.getByTestId('node-config-modal').waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.getByTestId('node-config-modal').waitFor({ state: 'hidden', timeout: 3000 });
    }
  }
  throw new Error('Flow was not saved after multiple attempts');
}

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

  test('node name and code changes persist after save and reload', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Persist Config'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 400, y: 0 }, data: { label: 'Compute', type: 'code', config: { code: 'return input;' } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Edit the code node's name and code
    const codeNode = page.locator('.react-flow__node').filter({ hasText: 'Compute' });
    await codeNode.click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Node name').fill('Persisted Compute');
    await page.getByLabel('JavaScript Code').fill('return { persisted: true };');
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });

    // Save the flow via the editor's Save button
    await saveFlowAndWait(page, request, flow.id, (f) => {
      const node = f.nodes?.find((n: any) => n.id === 'c1');
      return node?.data?.config?.code?.includes('persisted');
    });

    // Reload and reopen the modal — values must have persisted
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await page.locator('.react-flow__node').filter({ hasText: 'Persisted Compute' }).click();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Node name')).toHaveValue('Persisted Compute');
    await expect(page.getByLabel('JavaScript Code')).toHaveValue('return { persisted: true };');

    await deleteFlow(request, flow.id);
  });

  test('duplicate node label shows inline validation error in the modal', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Dup Label'),
      nodes: [
        { id: 'c1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'DupLabel', type: 'code', config: { code: 'return 1;' } } },
        { id: 'c2', type: 'code', position: { x: 400, y: 0 }, data: { label: 'DupLabel', type: 'code', config: { code: 'return 2;' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    await page.locator('.react-flow__node').filter({ hasText: 'DupLabel' }).first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText('Label "DupLabel" is already used by another node')).toBeVisible({ timeout: 5000 });

    await deleteFlow(request, flow.id);
  });

  test('trigger config modal switches trigger type and shows per-type options', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').filter({ hasText: 'Trigger' }).click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const triggerSelect = page.locator('[data-field-label="Trigger Type"]');
    await expect(triggerSelect).toBeVisible();
    // Default is Manual → Input Message field present
    await expect(page.getByLabel('Input Message')).toBeVisible({ timeout: 3000 });

    // Webhook: shows secret, personal key section, webhook URL and input schema
    await triggerSelect.click();
    await page.getByRole('option', { name: 'Webhook' }).click();
    await expect(page.getByLabel('Webhook Secret')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Your Personal API Key')).toBeVisible();
    await expect(page.getByText('Webhook URL', { exact: true })).toBeVisible();
    await expect(page.getByText('Expected Input Schema')).toBeVisible();

    // Schedule: shows cron expression field
    await triggerSelect.click();
    await page.getByRole('option', { name: 'Schedule' }).click();
    const cronField = page.getByLabel('Cron Expression');
    await expect(cronField).toBeVisible({ timeout: 3000 });
    await cronField.fill('0 9 * * *');
    await expect(cronField).toHaveValue('0 9 * * *');

    // Chat: no extra config options, select shows the selected value
    await triggerSelect.click();
    await page.getByRole('option', { name: 'Chat' }).click();
    await expect(triggerSelect).toContainText('Chat', { timeout: 3000 });

    // Back to manual: input message returns
    await triggerSelect.click();
    await page.getByRole('option', { name: 'Manual' }).click();
    await expect(page.getByLabel('Input Message')).toBeVisible({ timeout: 3000 });
  });

  test('deletes a node from the config modal', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // Output node is deletable (trigger nodes are not)
    await page.locator('.react-flow__node-output').first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(modal).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('.react-flow__node-trigger')).toHaveCount(1);
  });
});

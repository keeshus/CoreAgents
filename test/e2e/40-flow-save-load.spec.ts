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

  test('editor Save button persists canvas changes for a new flow', async ({ page, request }) => {
    await page.goto('/flows/new/edit');
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    // The new-flow page starts with a single trigger node
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });

    // Add a node on the canvas
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText('code1')).toBeVisible();

    // Opening and closing a node's config modal ensures the editor is in a
    // consistent state before saving (see report: Save button stale-closure issue)
    await page.locator('.react-flow__node-trigger').click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });

    // Click the editor's Save button — creates the flow and redirects to its editor
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/new/'), { timeout: 15000 });
    const createdId = new URL(page.url()).pathname.split('/')[2];
    expect(createdId).toBeTruthy();

    // Persisted via API
    await expect.poll(async () => {
      const r = await request.get(`${API_URL}/flows/${createdId}`);
      if (!r.ok()) return null;
      const f = await r.json();
      return f.nodes?.length === 2 ? f : null;
    }, { timeout: 10000 }).not.toBeNull();

    // Reload — nodes survive
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText('code1')).toBeVisible();

    await deleteFlow(request, createdId);
  });

  test('editor Save button persists added nodes on an existing flow', async ({ page, request }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });

    // Opening and closing a node's config modal ensures the editor is in a
    // consistent state before saving (see report: Save button stale-closure issue)
    await page.locator('.react-flow__node-output').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });

    await saveFlowAndWait(page, request, flowId, (f) => f.nodes?.length === 3);

    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });
  });

  test('renaming a flow from the editor persists', async ({ page, request }) => {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Flow name')).toHaveValue(flowName, { timeout: 5000 });

    // Rename via the Flow Settings modal: type the new name, then trigger an
    // autosave by editing the description field (settings changes persist immediately)
    await page.getByTestId('flow-settings-btn').click();
    const modal = page.locator('div.fixed.inset-0.z-50');
    const newName = uniqueFlowName('Renamed Flow');
    await modal.getByRole('textbox', { name: 'Flow name' }).fill(newName);
    await modal.getByRole('textbox', { name: 'Description' }).fill('Renamed by E2E test');

    // Name updated in the API
    await expect.poll(async () => {
      const r = await request.get(`${API_URL}/flows/${flowId}`);
      if (!r.ok()) return null;
      const f = await r.json();
      return f.name === newName ? f.name : null;
    }, { timeout: 10000 }).toBe(newName);

    // Name updated in the header after reload
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Flow name')).toHaveValue(newName, { timeout: 5000 });
  });
});

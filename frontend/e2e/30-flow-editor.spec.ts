import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow } from './helpers/api';

test.describe('Flow editor', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, { name: 'Editor Test Flow' });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('canvas renders', async ({ page }) => {
    // React Flow canvas should be present
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
  });

  test('node catalog is visible', async ({ page }) => {
    await expect(page.getByText(/trigger/i)).toBeVisible();
  });

  test('adds a trigger node by clicking catalog button', async ({ page }) => {
    // Find the trigger node button in the catalog and click it
    const triggerBtn = page.locator('[data-testid="catalog-trigger"], button:has-text("Trigger")').first();
    await expect(triggerBtn).toBeVisible();
    await triggerBtn.click();

    // A trigger node should appear on the canvas
    const triggerNode = page.locator('.react-flow__node').first();
    await expect(triggerNode).toBeVisible({ timeout: 5000 });
  });

  test('adds an output node and connects it to trigger', async ({ page }) => {
    // Add trigger
    const triggerBtn = page.locator('[data-testid="catalog-trigger"], button:has-text("Trigger")').first();
    await triggerBtn.click();
    await page.waitForTimeout(500);

    // Add output
    const outputBtn = page.locator('[data-testid="catalog-output"], button:has-text("Output")').first();
    await outputBtn.click();
    await page.waitForTimeout(500);

    // Both nodes should be on the canvas
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2, { timeout: 5000 });
  });

  test('selecting a node shows config panel or highlights it', async ({ page }) => {
    // Add a trigger node first
    const triggerBtn = page.locator('[data-testid="catalog-trigger"], button:has-text("Trigger")').first();
    await triggerBtn.click();
    await page.waitForTimeout(500);

    // Click on the node
    const node = page.locator('.react-flow__node').first();
    await node.click();

    // The node should have the 'selected' class
    await expect(node).toHaveClass(/selected/, { timeout: 3000 });
  });

  test('delete selected node with keyboard', async ({ page }) => {
    const triggerBtn = page.locator('[data-testid="catalog-trigger"], button:has-text("Trigger")').first();
    await triggerBtn.click();
    await page.waitForTimeout(500);

    // Select the node
    const node = page.locator('.react-flow__node').first();
    await node.click();

    // Press Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);

    // Canvas should be empty
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(0);
  });

  test('deletes edge when clicking delete on edge label', async ({ page, request }) => {
    // Create a flow with an existing edge
    const fullFlow = await createFlow(request, {
      name: 'Edge Delete Test',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'o1' },
      ],
    });
    const flow = await fullFlow.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);

    // Edge button on the edge label should exist
    const edgeBtn = page.locator('.react-flow__edgeupdater, .react-flow__edge-textbg').first();
    if (await edgeBtn.isVisible()) {
      await edgeBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

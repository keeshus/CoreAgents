import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

test.describe('Flow editor', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const name = uniqueFlowName('Editor');
    const res = await createFlow(request, { name });
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
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 10000 });
  });

  test('add node button is visible', async ({ page }) => {
    await expect(page.getByTestId('add-node-btn')).toBeVisible({ timeout: 5000 });
  });

  test('opens node catalog when clicking + button', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await expect(page.getByTestId('catalog-code')).toBeVisible({ timeout: 5000 });
  });

  test('adds a code node from catalog', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
  });

  test('adds multiple nodes', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-output').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });

  test('selects a node by clicking it', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    const node = page.locator('.react-flow__node').first();
    await node.click();
    await expect(node).toHaveClass(/selected/, { timeout: 3000 });
  });

  test('keyboard delete removes a selected node', async ({ page }) => {
    // Add two code nodes
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // Clicking a node opens its config modal and selects it
    const codeNode = page.locator('.react-flow__node').filter({ hasText: 'code' }).first();
    await codeNode.click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await expect(codeNode).toHaveClass(/selected/);

    // Press Delete — React Flow listens on the document and deletes selected nodes
    await page.keyboard.press('Delete');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.react-flow__node').filter({ hasText: 'code' })).toHaveCount(1);
    // The config modal closes once the node is gone
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('dragging a node updates its canvas position', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('DragPos'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 400, y: 0 }, data: { label: 'Draggable', type: 'code', config: { code: 'return input;' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    const nodeEl = page.locator('.react-flow__node').filter({ hasText: 'Draggable' });
    await expect(nodeEl).toBeVisible({ timeout: 5000 });
    const box = await nodeEl.boundingBox();
    expect(box).not.toBeNull();

    // Read current position + viewport zoom from canvas state
    const before = await page.evaluate(() => {
      const nodes: any[] = (window as any).__flowCanvasNodes || [];
      const n = nodes.find((x: any) => x.id === 'c1');
      const vp = document.querySelector('.react-flow__viewport');
      const m = vp ? new DOMMatrixReadOnly(getComputedStyle(vp).transform) : null;
      return { x: n?.position?.x, y: n?.position?.y, zoom: m ? m.a : 1 };
    });

    // Drag the node by (150, 100) screen pixels
    const dx = 150;
    const dy = 100;
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const nodes: any[] = (window as any).__flowCanvasNodes || [];
      const n = nodes.find((x: any) => x.id === 'c1');
      return { x: n?.position?.x, y: n?.position?.y };
    });

    // Position change in flow coordinates = screen delta / zoom
    const expX = before.x + dx / before.zoom;
    const expY = before.y + dy / before.zoom;
    expect(Math.abs(after.x - expX)).toBeLessThanOrEqual(40);
    expect(Math.abs(after.y - expY)).toBeLessThanOrEqual(40);
    // Sanity check in screen pixels: the node must have moved a meaningful distance
    expect(Math.abs(after.x - before.x) * before.zoom).toBeGreaterThan(50);
    expect(Math.abs(after.y - before.y) * before.zoom).toBeGreaterThan(50);

    await deleteFlow(request, flow.id);
  });
});

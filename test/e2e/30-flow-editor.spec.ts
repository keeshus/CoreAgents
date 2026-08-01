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
    await expect(page.getByTestId('catalog-trigger')).toBeVisible({ timeout: 5000 });
  });

  test('adds a trigger node from catalog', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
  });

  test('adds multiple nodes', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-output').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });

  test('selects a node by clicking it', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    const node = page.locator('.react-flow__node').first();
    await node.click();
    await expect(node).toHaveClass(/selected/, { timeout: 3000 });
  });

  test('keyboard delete removes a selected node', async ({ page }) => {
    // Add a trigger (not deletable) and a code node
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // Clicking the code node opens its config modal and selects it
    const codeNode = page.locator('.react-flow__node').filter({ hasText: 'code' });
    await codeNode.click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await expect(codeNode).toHaveClass(/selected/);

    // Press Delete — React Flow listens on the document and deletes selected nodes
    await page.keyboard.press('Delete');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.react-flow__node').filter({ hasText: 'code' })).toHaveCount(0);
    // The config modal closes once the node is gone
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('undo removes the last added node and redo restores it', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText('code1')).toBeVisible();

    // Ctrl+Z — last added node (code1) disappears
    await page.keyboard.press('Control+z');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByText('code1')).not.toBeVisible();

    // Ctrl+Shift+Z — redo brings it back
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText('code1')).toBeVisible();
  });

  test('undo/redo buttons also work', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-code').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });

    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });

  test('connects two nodes by dragging between handles', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('HandleDrag'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 400, y: 0 }, data: { label: 'Processor', type: 'code', config: { code: 'return input;' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    const sourceHandle = page.locator('.react-flow__node').filter({ hasText: 'Start' }).locator('.react-flow__handle.source');
    // Code nodes have a feedback-input target handle too — connect via the regular input-0 handle
    const targetHandle = page.locator('.react-flow__node').filter({ hasText: 'Processor' }).locator('.react-flow__handle.target[data-handleid="input-0"]');
    await expect(sourceHandle).toBeVisible({ timeout: 5000 });
    await expect(targetHandle).toBeVisible({ timeout: 5000 });

    const src = await sourceHandle.boundingBox();
    const tgt = await targetHandle.boundingBox();
    expect(src).not.toBeNull();
    expect(tgt).not.toBeNull();
    await page.mouse.move(src!.x + src!.width / 2, src!.y + src!.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgt!.x + tgt!.width / 2, tgt!.y + tgt!.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });
    const edges = await page.evaluate(() => (window as any).__flowCanvasEdges || []);
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe('t1');
    expect(edges[0].target).toBe('c1');

    await deleteFlow(request, flow.id);
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

  test('displays nodes loaded from a saved flow', async ({ page, request }) => {
    const fullFlow = await createFlow(request, {
      name: uniqueFlowName('PrePopulated'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'My Trigger', type: 'trigger', config: {} } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'My Output', type: 'output', config: {} } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await fullFlow.json();
    await page.goto(`/flows/${flow.id}/edit`);

    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText('My Trigger')).toBeVisible();
    await expect(page.getByText('My Output')).toBeVisible();

    await deleteFlow(request, flow.id);
  });
});

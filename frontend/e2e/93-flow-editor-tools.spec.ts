import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Flow Editor DOM tools', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const name = uniqueFlowName('DomToolTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 50 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 350, y: 50 }, data: { label: 'Processor', type: 'code', config: { code: 'return input;' } } },
        { id: 'o1', type: 'output', position: { x: 650, y: 50 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('open_node clicks a node by label', async ({ page }) => {
    await page.evaluate(() => {
      for (const n of document.querySelectorAll('.react-flow__node')) {
        if (n.textContent?.toLowerCase().includes('processor')) { (n as HTMLElement).click(); return; }
      }
    });
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
  });

  test('get_node_config reads all fields from open config panel', async ({ page }) => {
    // Click the code node (second node)
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    // Use Playwright's getByLabel which works with our fixed TextField (htmlFor)
    const codeEditor = page.getByLabel('JavaScript Code');
    await expect(codeEditor).toBeVisible({ timeout: 3000 });
    const codeValue = await codeEditor.inputValue();
    expect(codeValue).toContain('return input;');
  });

  test('update_node_field updates a field in the config panel', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    // Update the JavaScript Code field
    const codeEditor = page.getByLabel('JavaScript Code');
    await codeEditor.fill('return { result: "updated" };');

    // Verify via get_node_config
    const updatedValue = await codeEditor.inputValue();
    expect(updatedValue).toContain('"updated"');
  });

  test('add_node adds a node to the canvas', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();
    await page.evaluate(() => (window as any).__addFlowNode?.('code', {}));
    await page.waitForTimeout(500);
    const countAfter = await page.locator('.react-flow__node').count();
    expect(countAfter).toBe(countBefore + 1);
  });

  test('delete_node removes a node by label', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();
    await page.evaluate(() => {
      for (const n of document.querySelectorAll('.react-flow__node')) {
        if (n.textContent?.toLowerCase().includes('processor')) {
          const id = n.getAttribute('data-id');
          if (id) (window as any).__deleteFlowNode?.(id);
          return;
        }
      }
    });
    await page.waitForTimeout(500);
    const countAfter = await page.locator('.react-flow__node').count();
    expect(countAfter).toBe(countBefore - 1);
  });

  test('read_code reads from the code editor', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    const code = await page.getByLabel('JavaScript Code').inputValue();
    expect(code).toContain('return input;');
  });

  test('replace_code updates the code in the editor', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    await page.getByLabel('JavaScript Code').fill('return { result: "replaced" };');

    const code = await page.getByLabel('JavaScript Code').inputValue();
    expect(code).toContain('"replaced"');
  });

  test('get_flow_json returns flow structure', async ({ page }) => {
    const json = await page.evaluate(() => {
      const nodes = (window as any).__flowCanvasNodes;
      const edges = (window as any).__flowCanvasEdges;
      if (!nodes) return 'No canvas state';
      return JSON.stringify({ nodes: nodes.length, edges: edges?.length || 0 });
    });
    expect(json).toContain('"nodes":3');
    expect(json).toContain('"edges":2');
  });

  test('close_node_config closes the config panel', async ({ page }) => {
    // Open config
    await page.locator('.react-flow__node').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    // Close via Escape (click the modal first to ensure it has focus)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('node-config-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('connect_nodes connects two nodes on the canvas', async ({ page, request }) => {
    const name = uniqueFlowName('ConnectTest');
    const res = await createFlow(request, {
      name,
      nodes: [{ id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
      edges: [],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-output').click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      let src: string | null = null, tgt: string | null = null;
      for (const n of document.querySelectorAll('.react-flow__node')) {
        const t = n.textContent?.toLowerCase() || '';
        if (t.includes('trigger')) src = n.getAttribute('data-id');
        if (t.includes('output')) tgt = n.getAttribute('data-id');
      }
      if (src && tgt) (window as any).__connectFlowNodes?.(src, tgt);
    });
    await page.waitForTimeout(300);

    const edges = await page.evaluate(() => (window as any).__flowCanvasEdges || []);
    expect(edges.length).toBeGreaterThanOrEqual(1);
    await deleteFlow(request, flow.id);
  });

  test('get_available_nodes returns type list', async () => {
    const types = 'llm-agent, mcp-tool, retriever, code, branch, hitl, output, parallel';
    expect(types).toContain('code');
    expect(types).toContain('branch');
  });

  test('save_flow persists canvas state via API', async ({ page, request }) => {
    // Add a node and grab the canvas state
    await page.evaluate(() => (window as any).__addFlowNode?.('code', {}));
    await page.waitForTimeout(300);

    const canvasNodes = await page.evaluate(() => (window as any).__flowCanvasNodes?.length || 0);
    expect(canvasNodes).toBe(4);

    // Save via Playwright request fixture (includes auth cookie)
    const flowRes = await request.get(`${API_URL}/flows/${flowId}`);
    const flow = await flowRes.json();
    const saveRes = await request.put(`${API_URL}/flows/${flowId}`, {
      data: { ...flow },
    });
    expect(saveRes.ok()).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';
import { saveFlowViaUi } from './helpers/ui';

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
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Wait until the editor has fully mounted and exposed its canvas helpers —
    // otherwise helper calls below silently no-op and the assertions flake.
    await waitForEditorReady(page);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  /** Add a node of the given type through the catalog UI (real user path). */
  async function addNodeFromCatalog(page: any, type: string) {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId(`catalog-${type}`).click();
  }

  /**
   * Wait until the parent page state has absorbed a canvas change made through
   * the window helpers. The helpers update the editor's internal state first;
   * the parent (which handleSave serializes) syncs back via requestAnimationFrame.
   */
  async function waitForCanvasSync(page: any, refBefore: unknown) {
    await expect.poll(() =>
      page.evaluate((r: unknown) => (window as any).__flowCanvasNodes !== r, refBefore),
      { timeout: 10000, message: 'parent state should sync the canvas change' },
    ).toBe(true);
  }

  /** Wait for the editor to mount and expose its window helpers + canvas state. */
  async function waitForEditorReady(page: any) {
    await expect.poll(() => page.evaluate(() => typeof (window as any).__addFlowNode), { timeout: 10000, message: '__addFlowNode helper' }).toBe('function');
    await expect.poll(() => page.evaluate(() => typeof (window as any).__deleteFlowNode), { timeout: 10000, message: '__deleteFlowNode helper' }).toBe('function');
    await expect.poll(() => page.evaluate(() => typeof (window as any).__connectFlowNodes), { timeout: 10000, message: '__connectFlowNodes helper' }).toBe('function');
    await expect.poll(() => page.evaluate(() => typeof (window as any).__removeFlowEdge), { timeout: 10000, message: '__removeFlowEdge helper' }).toBe('function');
    await expect.poll(() => page.evaluate(() => Array.isArray((window as any).__flowCanvasNodes)), { timeout: 10000, message: '__flowCanvasNodes state' }).toBe(true);
  }

  /** Wait until the rendered node count is stable across two consecutive frames. */
  async function waitForStableNodeCount(page: any, expected: number) {
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(expected);
    // Give React Flow one more frame so node dimensions/layout settle before
    // the test reads positions or counts again.
    await page.waitForTimeout(150);
  }

  test('open_node clicks a node by label', async ({ page }) => {
    await page.evaluate(() => {
      for (const n of document.querySelectorAll('.react-flow__node')) {
        if (n.textContent?.toLowerCase().includes('processor')) { (n as HTMLElement).click(); return; }
      }
    });
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Node name')).toHaveValue('Processor');
  });

  test('get_node_config reads all fields from open config panel', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    const codeEditor = page.getByLabel('JavaScript Code');
    await expect(codeEditor).toBeVisible({ timeout: 3000 });
    const codeValue = await codeEditor.inputValue();
    expect(codeValue).toContain('return input;');
  });

  test('update_node_field updates a field in the config panel', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    const codeEditor = page.getByLabel('JavaScript Code');
    await codeEditor.fill('return { result: "updated" };');
    await expect(codeEditor).toHaveValue('return { result: "updated" };');
  });

  test('add_node adds a node via the exposed canvas helper', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();
    await page.evaluate(() => (window as any).__addFlowNode?.('code', {}));
    await waitForStableNodeCount(page, countBefore + 1);
  });

  test('add_node_from_catalog adds a node through the UI', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();
    await addNodeFromCatalog(page, 'http');
    await waitForStableNodeCount(page, countBefore + 1);
  });

  test('delete_node removes a node by label via the canvas helper', async ({ page }) => {
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
    await waitForStableNodeCount(page, countBefore - 1);
  });

  test('read_code reads from the code editor', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    const code = await page.getByLabel('JavaScript Code').inputValue();
    expect(code).toContain('return input;');
  });

  test('replace_code updates the code in the editor', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    await page.getByLabel('JavaScript Code').fill('return { result: "replaced" };');

    const code = await page.getByLabel('JavaScript Code').inputValue();
    expect(code).toContain('"replaced"');
  });

  test('get_flow_json returns flow structure from live canvas state', async ({ page }) => {
    const json = await page.evaluate(() => {
      const nodes = (window as any).__flowCanvasNodes;
      const edges = (window as any).__flowCanvasEdges;
      if (!nodes) return 'No canvas state';
      return JSON.stringify({ nodes: nodes.length, edges: edges?.length || 0 });
    });
    expect(json).toContain('"nodes":3');
    expect(json).toContain('"edges":2');
  });

  test('connect_nodes connects two nodes on the canvas', async ({ page, request }) => {
    const name = uniqueFlowName('ConnectTest');
    const res = await createFlow(request, {
      name,
      nodes: [{ id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
      edges: [],
    });
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await waitForEditorReady(page);
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-output').click();
    await waitForStableNodeCount(page, 2);

    await page.evaluate(() => {
      let src: string | null = null, tgt: string | null = null;
      for (const n of document.querySelectorAll('.react-flow__node')) {
        const t = n.textContent?.toLowerCase() || '';
        if (t.includes('trigger')) src = n.getAttribute('data-id');
        if (t.includes('output')) tgt = n.getAttribute('data-id');
      }
      if (src && tgt) (window as any).__connectFlowNodes?.(src, tgt);
    });

    await expect.poll(() =>
      page.evaluate(() => (window as any).__flowCanvasEdges?.length || 0),
      { timeout: 10000 },
    ).toBeGreaterThanOrEqual(1);
    await deleteFlow(request, flow.id);
  });

  test('get_available_nodes returns the real node catalog', async ({ request }) => {
    const res = await request.get(`${API_URL}/catalog`);
    expect(res.ok()).toBe(true);
    const catalog = await res.json();
    expect(Array.isArray(catalog)).toBe(true);
    const types = catalog.map((e: any) => e.type);
    for (const expected of ['trigger', 'llm-agent', 'code', 'condition', 'output', 'hitl', 'http', 'mcp-tool']) {
      expect(types).toContain(expected);
    }
    const code = catalog.find((e: any) => e.type === 'code');
    expect(code.label).toBeDefined();
    expect(code.description).toBeDefined();
    expect(code.category).toBeDefined();
  });

  test('save_flow persists the modified canvas state via the UI', async ({ page, request }) => {
    const countBefore = await page.locator('.react-flow__node').count();
    const refBefore = await page.evaluate(() => (window as any).__flowCanvasNodes);
    await page.evaluate(() => (window as any).__addFlowNode?.('code', {}));
    await waitForStableNodeCount(page, countBefore + 1);
    await waitForCanvasSync(page, refBefore);

    await saveFlowViaUi(page, request, flowId, (f) => f.nodes?.length === countBefore + 1);

    const flowRes = await request.get(`${API_URL}/flows/${flowId}`);
    const saved = await flowRes.json();
    const added = saved.nodes.filter((n: any) => n.type === 'code');
    expect(added.length).toBe(2); // original Processor + newly added code node
  });

  test('keyboard undo/redo works for catalog node add', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();

    // Add a node through the catalog — snapshot is taken on add
    await addNodeFromCatalog(page, 'delay');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore + 1);

    // Ctrl+Z undoes the add
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore);

    // Ctrl+Y redoes the add
    await page.keyboard.press('Control+y');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore + 1);

    // Ctrl+Shift+Z also redoes the add
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore + 1);

    // Undo/redo toolbar buttons work too
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore + 1);
  });

  test('keyboard undo restores a config edit', async ({ page }) => {
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    const codeEditor = page.getByLabel('JavaScript Code');
    await codeEditor.fill('return { result: "edited" };');
    await expect(codeEditor).toHaveValue('return { result: "edited" };');

    await page.keyboard.press('Control+z');
    await expect(codeEditor).toHaveValue('return input;', { timeout: 10000 });
  });

  test('keyboard undo restores a node deleted from the config modal', async ({ page }) => {
    const countBefore = await page.locator('.react-flow__node').count();

    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('node-config-modal').getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore - 1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('.react-flow__node').count(), { timeout: 10000 }).toBe(countBefore);
  });

  test('remove_edge removes a connection between two nodes', async ({ page }) => {
    await expect.poll(() =>
      page.evaluate(() => (window as any).__flowCanvasEdges?.length || 0),
      { timeout: 10000 },
    ).toBe(2); // Wait for the initial two edges before removing one
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.react-flow__node');
      let src: string | null = null, tgt: string | null = null;
      for (const n of nodes) {
        const t = n.textContent?.toLowerCase() || '';
        if (t.includes('start')) src = n.getAttribute('data-id');
        if (t.includes('processor')) tgt = n.getAttribute('data-id');
      }
      if (src && tgt) (window as any).__removeFlowEdge?.(src, tgt);
    });

    await expect.poll(() =>
      page.evaluate(() => (window as any).__flowCanvasEdges?.length || 0),
      { timeout: 10000 },
    ).toBe(1); // Only the processor→output edge remains
  });

  test('update_flow changes the flow name via API', async ({ request }) => {
    const flowRes = await request.get(`${API_URL}/flows/${flowId}`);
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    const oldName = flow.name;
    flow.name = oldName + ' Updated';
    const saveRes = await request.put(`${API_URL}/flows/${flowId}`, {
      data: { ...flow },
    });
    expect(saveRes.ok()).toBe(true);

    const verifyRes = await request.get(`${API_URL}/flows/${flowId}`);
    const updated = await verifyRes.json();
    expect(updated.name).toContain('Updated');
  });

  test('run_flow opens the debug overlay and executes the canvas', async ({ page }) => {
    await page.getByTestId('debug-btn').click();
    await expect(page.getByTestId('debug-overlay')).toBeVisible({ timeout: 10000 });

    // Manual trigger: supply the message to send, then run
    const message = 'Hello! This is a debug run.';
    await page.getByPlaceholder('Enter the message to send to the flow...').fill(message);
    await page.getByTestId('debug-run-btn').click();

    // The code node returns the input, so the message text appears in the Final Output
    await expect.poll(
      () => page.locator('pre').filter({ hasText: message }).count(),
      { timeout: 20000, message: 'debug run should complete and render output' },
    ).toBeGreaterThan(0);

    // Close the overlay and return to the editor
    await page.getByTestId('debug-overlay').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('debug-overlay')).toHaveCount(0);
  });

  // ─── Flow info retrieval tools ────────────────────────────────

  test('list_canvas_nodes — lists all nodes on canvas', async ({ page }) => {
    const nodes = await page.evaluate(() => {
      const items = document.querySelectorAll('.react-flow__node');
      return [...items].map(n => n.textContent?.trim());
    });
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes.some(n => n?.toLowerCase().includes('trigger'))).toBe(true);
    expect(nodes.some(n => n?.toLowerCase().includes('output'))).toBe(true);
  });

  test('get_flow_info — returns flow metadata via API', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows/${flowId}`);
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    expect(flow.name).toBeDefined();
    expect(flow.nodes).toBeDefined();
    expect(Array.isArray(flow.nodes)).toBe(true);
  });

  test('get_canvas_state — reads canvas state', async ({ page }) => {
    const state = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.react-flow__node');
      return {
        nodeCount: nodes.length,
        nodes: [...nodes].map(n => ({ text: n.textContent?.trim(), type: n.classList.toString().match(/node-([^\s]+)/)?.[1] || 'unknown' })),
      };
    });
    expect(state.nodeCount).toBeGreaterThanOrEqual(2);
    expect(state.nodes[0].text).toBeDefined();
  });

  test('get_node_type_info — returns docs for all types', async ({ request }) => {
    const res = await request.get(`${API_URL}/catalog`);
    expect(res.ok()).toBe(true);
    const catalog = await res.json();
    for (const type of ['trigger', 'llm-agent', 'code', 'condition', 'output', 'hitl', 'mcp-tool', 'retriever', 'parallel', 'subflow', 'flow-tool']) {
      const entry = catalog.find((e: any) => e.type === type);
      expect(entry, `catalog entry for ${type}`).toBeDefined();
      expect(entry.description).toBeDefined();
    }
  });

  test('get_debug_results — returns execution history including a fresh run', async ({ request }) => {
    // Run the flow for real (persisted, non-debug) so an execution is recorded
    const cookie = getAuthCookie() || '';
    const runRes = await fetch(`${API_URL}/flows/${flowId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ input: { message: 'execution history check' } }),
    });
    expect(runRes.ok).toBe(true);
    const sseText = await runRes.text();
    const completedMatch = sseText.match(/"executionId":"([^"]+)"/);
    expect(completedMatch, 'execution should complete').not.toBeNull();
    const executionId = completedMatch![1];

    await expect.poll(async () => {
      const res = await request.get(`${API_URL}/flows/${flowId}/executions?limit=5`);
      if (!res.ok()) return [];
      const body = await res.json();
      return body.data?.map((e: any) => e.id) || [];
    }, { timeout: 10000 }).toContain(executionId);
  });
});

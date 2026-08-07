import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot get_node_output_shape tool', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E Output Shape LLM',
        providerType: 'openai',
        baseUrl: 'http://mock-llm-e2e:3002/v1',
        apiKey: 'mock-key',
        defaultModel: 'mock-gpt-4',
        models: ['mock-gpt-4'],
      },
    });
    expect(llmRes.ok()).toBe(true);
    const ep = await llmRes.json();
    mockEndpointId = ep.id;
    const setDefault = await request.put(`${API_URL}/llm-endpoints/${ep.id}`, {
      data: { isDefault: true },
    });
    expect(setDefault.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) {
      await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`).catch(() => {});
    }
  });

  const createdFlowIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdFlowIds) {
      await deleteFlow(request, id).catch(() => {});
    }
    createdFlowIds.length = 0;
  });

  /** The co-pilot panel container. */
  function panel(page: any) {
    return page.locator('div.fixed.bottom-24.right-6');
  }

  /** Open the Co-Pilot panel from the floating FAB (must be done BEFORE opening any node config). */
  async function openPanel(page: any) {
    const toggleBtn = page.getByTestId('co-pilot-toggle');
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();
    const textarea = page.getByPlaceholder('Ask anything...');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Co-Pilot').first()).toBeVisible();
    // No endpoint badge means the default endpoint is wired up
    await expect(page.getByText('No endpoint')).toHaveCount(0, { timeout: 5000 });
    return textarea;
  }

  /** Open the editor and wait until the live canvas state is exposed to the tools. */
  async function openEditor(page: any, flowId: string) {
    await page.goto(`/flows/${flowId}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
    await expect.poll(
      () => page.locator('.react-flow__node').count(),
      { timeout: 15000, message: '3 nodes should render on the canvas' },
    ).toBe(3);
    await expect.poll(
      () => page.evaluate(() => (window as any).__flowCanvasNodes?.length || 0),
      { timeout: 15000, message: '__flowCanvasNodes should be populated' },
    ).toBe(3);
    await expect.poll(
      () => page.evaluate(() => (window as any).__flowCanvasEdges?.length || 0),
      { timeout: 15000, message: '__flowCanvasEdges should be populated' },
    ).toBe(2);
  }

  /** Send a MOCK_TOOL_CALL message and wait for the tool bubble to render. */
  async function sendToolCall(page: any, textarea: any, message: string) {
    await textarea.fill(message);
    await page.keyboard.press('Enter');
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/🔧 get_node_output_shape/).first()).toBeVisible({ timeout: 15000 });
  }

  /**
   * Read the FULL (untruncated) get_node_output_shape result from the panel's
   * React state. The rendered tool bubble truncates long results at 200 chars
   * (AssistantPanel), so deep fields like "referenceExample", "upstreamInputs"
   * and the no-label referencing guide are only reachable through the live
   * message state. The messages array lives in the AssistantProvider's useState
   * hook, so we walk the React fiber tree from the panel DOM and scan hook
   * states for a 'tool' message with the given name.
   */
  async function toolResultContent(page: any, toolName: string): Promise<string | null> {
    return page.evaluate((name: string) => {
      const seen = new Set<any>();
      const scanHooks = (fiber: any): string | null => {
        let hook = fiber?.memoizedState;
        while (hook) {
          const v = hook.memoizedState;
          if (Array.isArray(v)) {
            for (const m of v) {
              if (
                m && typeof m === 'object' &&
                m.role === 'tool' && m.name === name &&
                typeof m.content === 'string'
              ) {
                return m.content;
              }
            }
          }
          hook = hook.next;
        }
        return null;
      };
      for (const el of document.querySelectorAll('div')) {
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactFiber$')) continue;
          let fiber = (el as any)[key];
          let depth = 0;
          while (fiber && depth < 80) {
            if (!seen.has(fiber)) {
              seen.add(fiber);
              const found = scanHooks(fiber);
              if (found) return found;
            }
            fiber = fiber.return;
            depth++;
          }
        }
      }
      return null;
    }, toolName);
  }

  /** Create the standard shape-test flow: Start (manual trigger) → Transform (code) → Output. */
  async function createShapeFlow(request: any, withSchema: boolean) {
    const codeConfig: any = { code: 'return { result: 42 };' };
    if (withSchema) {
      codeConfig.outputSchema = JSON.stringify({
        type: 'object',
        properties: { result: { type: 'number' }, label: { type: 'string' } },
      });
    }
    const res = await createFlow(request, {
      name: uniqueFlowName('OutputShape'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Transform', type: 'code', config: codeConfig } },
        { id: 'o1', type: 'output', position: { x: 500, y: 0 }, data: { label: 'Output', type: 'output', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    createdFlowIds.push(flow.id);
    return flow;
  }

  test('reports code node fields from the output schema', async ({ page, request }) => {
    const flow = await createShapeFlow(request, true);
    await openEditor(page, flow.id);
    const textarea = await openPanel(page);

    // Open the Transform config — the panel was opened first so it stacks
    // above the node-config modal and stays interactive.
    await page.locator('.react-flow__node').nth(1).click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 10000 });

    await sendToolCall(page, textarea, 'MOCK_TOOL_CALL: get_node_output_shape {"label":"Transform"}');

    // The pretty-printed result bubble shows the first schema field
    await expect(panel(page).getByText(/"result"/).first()).toBeVisible({ timeout: 10000 });

    // The bubble truncates at 200 chars — read the full result from React state
    await expect.poll(
      () => toolResultContent(page, 'get_node_output_shape'),
      { timeout: 15000, message: 'tool result should be available in panel state' },
    ).toContain('referenceExample');
    const result = await toolResultContent(page, 'get_node_output_shape');
    expect(result).toContain('"name": "label"');
    expect(result).toContain('"node": "Transform"');
    expect(result).toContain('"kind": "fields"');
  });

  test('reports raw output for code nodes without a schema', async ({ page, request }) => {
    const flow = await createShapeFlow(request, false);
    await openEditor(page, flow.id);
    const textarea = await openPanel(page);

    await sendToolCall(page, textarea, 'MOCK_TOOL_CALL: get_node_output_shape {"label":"Transform"}');

    // Raw fallback note renders in the visible bubble
    await expect(panel(page).getByText(/any \(determined by return value\)/).first()).toBeVisible({ timeout: 10000 });

    // No schema fields are invented — "result" never appears in the result
    await expect(panel(page).getByText(/"result"/)).toHaveCount(0);

    const result = await toolResultContent(page, 'get_node_output_shape');
    expect(result).toContain('"kind": "raw"');
    expect(result).toContain('any (determined by return value)');
    expect(result).not.toContain('"result"');
  });

  test('shows upstream inputs in depth-first order', async ({ page, request }) => {
    const flow = await createShapeFlow(request, false);
    await openEditor(page, flow.id);
    const textarea = await openPanel(page);

    await sendToolCall(page, textarea, 'MOCK_TOOL_CALL: get_node_output_shape {"label":"Output"}');

    // The output node's pass-through note renders in the visible bubble
    await expect(panel(page).getByText(/pass-through — same as input/).first()).toBeVisible({ timeout: 10000 });

    await expect.poll(
      () => toolResultContent(page, 'get_node_output_shape'),
      { timeout: 15000, message: 'tool result should be available in panel state' },
    ).toContain('upstreamInputs');
    const result = await toolResultContent(page, 'get_node_output_shape');
    // Depth-first order: the direct source (Transform) first, then its source (Start)
    expect(result!.indexOf('"source": "Transform"')).toBeLessThan(result!.indexOf('"source": "Start"'));
    expect(result).toContain('"raw": "any (determined by return value)"');
  });

  test('without a label reports all nodes plus the referencing guide', async ({ page, request }) => {
    const flow = await createShapeFlow(request, true);
    await openEditor(page, flow.id);
    const textarea = await openPanel(page);

    await sendToolCall(page, textarea, 'MOCK_TOOL_CALL: get_node_output_shape {}');

    // The first node's report is visible in the bubble
    await expect(panel(page).getByText(/"node": "Start"/).first()).toBeVisible({ timeout: 10000 });

    await expect.poll(
      () => toolResultContent(page, 'get_node_output_shape'),
      { timeout: 15000, message: 'tool result should be available in panel state' },
    ).toContain('Referencing: use "<NodeLabel>.<field>"');
    const result = await toolResultContent(page, 'get_node_output_shape');
    // All three nodes are reported
    expect(result).toContain('"node": "Start"');
    expect(result).toContain('"node": "Transform"');
    expect(result).toContain('"node": "Output"');
    // The guide shows the exact referencing convention
    expect(result).toContain('["Transform.result"]');
    expect(result).toContain('{{input.<NodeLabel>.<field>}}');
  });
});

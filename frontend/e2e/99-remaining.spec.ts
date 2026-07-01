import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Remaining features', () => {
  let mcpServerId: string | null = null;
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const mcpRes = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'E2E Mock MCP', url: 'http://mock-mcp-e2e:3003/sse', transport: 'sse', enabled: true },
    });
    if (mcpRes.ok()) { const s = await mcpRes.json(); mcpServerId = s.id; }

    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mcpServerId) await request.delete(`${API_URL}/mcp-servers/${mcpServerId}`);
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  // ── HITL via approval page ──────────────────────────────────────

  test('hitl node pauses and can be approved via approvals page', async ({ page, request }) => {
    const name = uniqueFlowName('HITLTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'HITL', type: 'hitl', config: { prompt: 'Approve?', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['hitl.decision'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();

    const { executeUntilPaused, pollExecution } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'test' }, cookie);
    expect(executionId).toBeTruthy();

    await page.goto('/approvals');
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 10000 });
    const approveBtn = page.locator('button:has-text("Approve")').first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();

    const exec = await pollExecution(request, executionId, 30000);
    expect(exec.status).toBe('completed');
    await deleteFlow(request, flow.id);
  });

  // ── Edge connection on canvas ───────────────────────────────────

  test('connect two nodes on the canvas', async ({ page, request }) => {
    const name = uniqueFlowName('EdgeTest');
    const res = await createFlow(request, { name });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.waitForTimeout(300);

    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2, { timeout: 5000 });
    await deleteFlow(request, flow.id);
  });

  // ── Error states ────────────────────────────────────────────────

  test('shows error for non-existent flow edit page', async ({ page }) => {
    await page.goto('/flows/nonexistent-id-12345/edit');
    await expect(page.getByText(/Flow not found/i)).toBeVisible({ timeout: 15000 });
  });

  test('returns 404 for non-existent flow via API', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows/nonexistent-flow-id-67890`);
    expect(res.status()).toBe(404);
  });

  // ── MCP Tool node ───────────────────────────────────────────────

  test('mcp tool node calls a tool on a configured server', async ({ request }) => {
    test.skip(!mcpServerId, 'Mock MCP server not available');
    const name = uniqueFlowName('MCPTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'm1', type: 'mcp-tool', position: { x: 300, y: 0 }, data: { label: 'MCP Tool', type: 'mcp-tool', config: { serverId: mcpServerId, toolName: 'echo', parameters: { message: 'hello mcp' } } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['mcp_tool.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e2', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  // ── Retriever node ──────────────────────────────────────────────

  test('retriever node executes against a Qdrant collection', async ({ request }) => {
    const name = uniqueFlowName('RetrieverTest');
    const flowRes = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'r1', type: 'retriever', position: { x: 300, y: 0 }, data: { label: 'Retriever', type: 'retriever', config: { collectionName: 'default', topK: 3, minScore: 0 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['retriever.count'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'r1', targetHandle: 'input-0' },
        { id: 'e2', source: 'r1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'hello' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    await deleteFlow(request, flow.id);
  });
});

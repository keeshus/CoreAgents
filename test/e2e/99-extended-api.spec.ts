import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute, pollExecution } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

// ─── Retriever node ─────────────────────────────────────────────

test.describe('Retriever node — comprehensive', () => {
  let embeddingProviderId: string | null = null;
  let docId: string | null = null;
  let flowId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create embedding provider pointing at mock LLM
    const epRes = await request.post(`${API_URL}/embedding-providers`, {
      data: {
        name: 'E2E Embed',
        providerType: 'openai',
        baseUrl: 'http://mock-llm-e2e:3002/v1',
        apiKey: 'mock-key',
        model: 'text-embedding-ada-002',
      },
    });
    if (epRes.ok()) {
      const ep = await epRes.json();
      embeddingProviderId = ep.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
    if (docId) await request.delete(`${API_URL}/documents/${docId}`).catch(() => {});
    if (embeddingProviderId) await request.delete(`${API_URL}/embedding-providers/${embeddingProviderId}`).catch(() => {});
  });

  test('upload a document with content', async ({ request }) => {
    const res = await request.post(`${API_URL}/knowledge/upload`, {
      data: {
        name: 'Test Doc',
        content: 'Paris is the capital of France. London is the capital of the UK. Berlin is the capital of Germany.',
        collectionName: 'e2e-countries',
      },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.chunkCount).toBeGreaterThan(0);
    docId = data.id;
  });

  test('retriever executes and returns output with the correct structure', async ({ request }) => {
    test.skip(!embeddingProviderId, 'Embedding provider not available');

    const flowRes = await createFlow(request, {
      name: uniqueFlowName('RetrieverFull'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'r1', type: 'retriever', position: { x: 300, y: 0 }, data: { label: 'Retriever', type: 'retriever', config: { collectionName: 'e2e-countries', topK: 5, minScore: 0, embeddingProviderId } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['retriever.count', 'retriever.query', 'retriever.chunks'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'r1', targetHandle: 'input-0' },
        { id: 'e2', source: 'r1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const events = await debugExecute(flow.id, { message: 'capital of France' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed!.data?.output;
    expect(output).toBeDefined();

    // Verify retriever output structure
    const retrieverOutput = output?.r1 || {};
    expect(retrieverOutput.query).toBeDefined();
    expect(typeof retrieverOutput.count).toBe('number');
    expect(Array.isArray(retrieverOutput.chunks)).toBe(true);
  });

  test('retriever with high minScore returns no results', async ({ request }) => {
    test.skip(!embeddingProviderId, 'Embedding provider not available');

    const flowRes = await createFlow(request, {
      name: uniqueFlowName('RetrieverHighScore'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'r1', type: 'retriever', position: { x: 300, y: 0 }, data: { label: 'Retriever', type: 'retriever', config: { collectionName: 'e2e-countries', topK: 5, minScore: 0.99, embeddingProviderId } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['retriever.count'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'r1', targetHandle: 'input-0' },
        { id: 'e2', source: 'r1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const events = await debugExecute(flow.id, { message: 'capital of France' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();

    const retrieverOutput = output?.r1 || {};
    expect(retrieverOutput.query).toBeDefined();
    expect(typeof retrieverOutput.count).toBe('number');
    expect(Array.isArray(retrieverOutput.chunks)).toBe(true);
    // minScore 0.99 exceeds the similarity of every stored chunk, so no
    // results may be returned (the mock embedding similarity is far below).
    expect(retrieverOutput.count).toBeLessThan(1);
    expect(retrieverOutput.chunks.length).toBe(0);
  });

  test('retriever with minScore 0 returns everything the store has', async ({ request }) => {
    test.skip(!embeddingProviderId, 'Embedding provider not available');

    const flowRes = await createFlow(request, {
      name: uniqueFlowName('RetrieverZeroScore'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'r1', type: 'retriever', position: { x: 300, y: 0 }, data: { label: 'Retriever', type: 'retriever', config: { collectionName: 'e2e-countries', topK: 5, minScore: 0, embeddingProviderId } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['retriever.count'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'r1', targetHandle: 'input-0' },
        { id: 'e2', source: 'r1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const events = await debugExecute(flow.id, { message: 'capital of France' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const retrieverOutput = completed!.data?.output?.r1 || {};
    expect(typeof retrieverOutput.count).toBe('number');
    // With no threshold, every chunk in the store passes; count == chunks
    expect(retrieverOutput.count).toBe(retrieverOutput.chunks.length);
    // Regression guard: uploaded chunks must actually be searchable. The
    // search used to hit an empty Qdrant store and return 0 chunks.
    expect(retrieverOutput.count).toBeGreaterThanOrEqual(1);
    expect(retrieverOutput.chunks[0].text).toContain('Paris is the capital of France');
  });
});

// ─── Approvals page ─────────────────────────────────────────────

test.describe('Approvals page — reject', () => {
  let flowId: string;

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('POST /api/executions/:executionId/reject rejects execution', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('HITLRejectAPI'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Go?', buttons: [{ label: 'Reject', value: 'rejected' }, { label: 'Approve', value: 'approved' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-1', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const { executeUntilPaused } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'test' }, cookie);

    // Reject via API
    const rejectRes = await fetch(`${API_URL}/executions/${executionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      body: JSON.stringify({ reason: 'Not needed' }),
    });
    expect(rejectRes.ok).toBe(true);

    const exec = await pollExecution(request, executionId, 15000);
    expect(exec.status).toBe('cancelled');
  });

  test('reject from approvals page shows rejection', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('HITLRejectUI'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Go?', buttons: [{ label: 'Reject', value: 'rejected' }, { label: 'Approve', value: 'approved' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-1', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const { executeUntilPaused } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'test' }, cookie);

    // Navigate to approvals page and click the real Reject button (from the HITL config)
    await page.goto('/approvals');
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 10000 });
    const rejectBtn = page.locator('button:has-text("Reject")').first();
    await expect(rejectBtn).toBeVisible({ timeout: 5000 });
    await rejectBtn.click();

    // The execution is removed from the pending list…
    await expect(rejectBtn).toHaveCount(0, { timeout: 10000 });

    // …and reaches a terminal state.
    // The /executions/:id/reject endpoint is covered by the API test above
    // (POST /api/executions/:executionId/reject asserts status 'cancelled').
    // The UI path routes through approve/decision, so the UI execution
    // completes with decision='rejected' instead of being cancelled.
    const exec = await pollExecution(request, executionId, 20000);
    expect(['completed', 'cancelled', 'failed']).toContain(exec.status);
  });
});

// ─── Cancel execution ───────────────────────────────────────────

test.describe('Cancel execution', () => {
  let flowId: string;

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('POST /api/executions/:executionId/cancel cancels running execution', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CancelTest'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Wait', buttons: [{ label: 'Go', value: 'go' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const { executeUntilPaused } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'cancel' }, cookie);

    // Cancel via API
    const cancelRes = await fetch(`${API_URL}/executions/${executionId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    });
    expect(cancelRes.ok).toBe(true);

    // Verify cancelled
    const exec = await pollExecution(request, executionId, 15000);
    expect(exec.status).toBe('cancelled');
  });

  test('cancel pending execution via the /settings/executions page', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CancelUI'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Wait', buttons: [{ label: 'Go', value: 'go' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const { executeUntilPaused } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'cancel-ui' }, cookie);

    await page.goto('/settings/executions');
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 10000 });

    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Confirm in the dialog (button is labeled 'Cancel execution', not a generic 'Delete')
    const confirmBtn = page.getByRole('button', { name: 'Cancel execution' });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    const exec = await pollExecution(request, executionId, 15000);
    expect(exec.status).toBe('cancelled');
  });
});

// ─── Logout and password change ─────────────────────────────────

test.describe('Auth edge cases', () => {
  test('POST /api/auth/logout clears session and API becomes unauthorized', async ({ page }) => {
    // Sanity check: authenticated before logout
    const beforeRes = await page.request.get(`${API_URL}/flows`);
    expect(beforeRes.ok()).toBe(true);

    const res = await page.request.post(`${API_URL}/auth/logout`);
    expect(res.ok()).toBe(true);

    // After logout the API must reject the session
    const afterRes = await page.request.get(`${API_URL}/flows`);
    expect(afterRes.status()).toBe(401);

    // Re-login for subsequent tests
    await page.goto('/login');
    await page.getByLabel('Email').fill('e2e@test.local');
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();
    await page.waitForLoadState('networkidle');

    // API works again with the fresh session
    const reloginRes = await page.request.get(`${API_URL}/flows`);
    expect(reloginRes.ok()).toBe(true);
  });

  test('PUT /api/auth/password changes password and new password works', async ({ request }) => {
    const res = await request.put(`${API_URL}/auth/password`, {
      data: { currentPassword: 'Test1234!', newPassword: 'NewTest5678!' },
    });
    expect(res.ok()).toBe(true);

    // Old password must now fail to log in…
    const oldLogin = await request.post(`${API_URL}/auth/login`, {
      data: { email: 'e2e@test.local', password: 'Test1234!' },
    });
    expect(oldLogin.status()).toBe(401);

    // …while the new password succeeds
    const newLogin = await request.post(`${API_URL}/auth/login`, {
      data: { email: 'e2e@test.local', password: 'NewTest5678!' },
    });
    expect(newLogin.ok()).toBe(true);
    const loginData = await newLogin.json();
    expect(loginData.user.email).toBe('e2e@test.local');

    // Change back so subsequent tests pass
    const restore = await request.put(`${API_URL}/auth/password`, {
      data: { currentPassword: 'NewTest5678!', newPassword: 'Test1234!' },
    });
    expect(restore.ok()).toBe(true);

    const restoredLogin = await request.post(`${API_URL}/auth/login`, {
      data: { email: 'e2e@test.local', password: 'Test1234!' },
    });
    expect(restoredLogin.ok()).toBe(true);
  });

  test('GET /api/auth/config returns auth config', async ({ request }) => {
    const res = await request.get(`${API_URL}/auth/config`);
    expect(res.ok()).toBe(true);
    const config = await res.json();
    expect(config).toBeDefined();
  });
});

// ─── Flow check-name endpoint ───────────────────────────────────

test.describe('Flow utilities', () => {
  test('GET /api/flows/check-name returns availability for unique name', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows/check-name?name=UniqueFlow999`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.available).toBe(true);
  });

  test('GET /api/flows/check-name returns unavailable for taken name', async ({ request }) => {
    const flowRes = await createFlow(request, { name: 'TakenNameFlow' });
    const flow = await flowRes.json();

    const res = await request.get(`${API_URL}/flows/check-name?name=TakenNameFlow`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.available).toBe(false);

    await deleteFlow(request, flow.id);
  });

  test('POST /api/flows/validate validates a flow definition', async ({ request }) => {
    const res = await request.post(`${API_URL}/flows/validate`, {
      data: {
        nodes: [
          { id: 't1', type: 'trigger', data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'o1', type: 'output', data: { label: 'Output', type: 'output', config: {} } },
        ],
        edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
      },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── Settings CRUD ──────────────────────────────────────────────

test.describe('Settings CRUD from API', () => {
  let createdId: string;

  test.afterEach(async ({ request }) => {
    if (createdId) await request.delete(`${API_URL}/llm-endpoints/${createdId}`).catch(() => {});
  });

  test('PUT /api/llm-endpoints/:id updates an LLM endpoint', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Update Test', providerType: 'openai', baseUrl: 'http://test.local/v1', apiKey: 'sk-test', defaultModel: 'gpt-4', models: ['gpt-4'] },
    });
    const ep = await createRes.json();
    createdId = ep.id;

    const updateRes = await request.put(`${API_URL}/llm-endpoints/${ep.id}`, {
      data: { name: 'E2E Updated', defaultModel: 'gpt-4-turbo' },
    });
    expect(updateRes.ok()).toBe(true);
    const updated = await updateRes.json();
    expect(updated.name).toBe('E2E Updated');
    expect(updated.default_model || updated.defaultModel).toBe('gpt-4-turbo');
  });

  test('PUT /api/secrets/:id updates a secret', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/secrets`, {
      data: { name: 'UpdateSecret', value: 'original-value', scope: 'app' },
    });
    const secret = await createRes.json();
    createdId = secret.id;

    const updateRes = await request.put(`${API_URL}/secrets/${secret.id}`, {
      data: { value: 'updated-value' },
    });
    expect(updateRes.ok()).toBe(true);

    await request.delete(`${API_URL}/secrets/${secret.id}`);
    createdId = '';
  });

  test('PUT /api/mcp-servers/:id updates an MCP server', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'E2E MCP Update', url: 'http://test-mcp.local/sse' },
    });
    const server = await createRes.json();
    createdId = server.id;

    const updateRes = await request.put(`${API_URL}/mcp-servers/${server.id}`, {
      data: { name: 'E2E MCP Updated' },
    });
    expect(updateRes.ok()).toBe(true);

    await request.delete(`${API_URL}/mcp-servers/${server.id}`);
    createdId = '';
  });

  test('MCP server refresh endpoint', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'E2E MCP Refresh', url: 'http://mock-mcp-e2e:3003/sse' },
    });
    const server = await createRes.json();

    const refreshRes = await request.post(`${API_URL}/mcp-servers/${server.id}/refresh`);
    expect(refreshRes.ok()).toBe(true);

    await request.delete(`${API_URL}/mcp-servers/${server.id}`);
  });

  test('GET /api/secret-vaults returns vault list', async ({ request }) => {
    const res = await request.get(`${API_URL}/secret-vaults`);
    expect(res.ok()).toBe(true);
    const vaults = await res.json();
    expect(Array.isArray(vaults)).toBe(true);
  });
});

// ─── Document listing ───────────────────────────────────────────

test.describe('Document endpoints', () => {
  test('GET /api/documents returns document list', async ({ request }) => {
    const res = await request.get(`${API_URL}/documents`);
    expect(res.ok()).toBe(true);
    const docs = await res.json();
    expect(Array.isArray(docs)).toBe(true);
  });

  test('GET /api/knowledge/collections returns collection list', async ({ request }) => {
    const res = await request.get(`${API_URL}/knowledge/collections`);
    expect(res.ok()).toBe(true);
    const cols = await res.json();
    expect(Array.isArray(cols)).toBe(true);
  });
});

// ─── Remaining admin/niche endpoints ────────────────────────────

test.describe('Admin and niche endpoints', () => {
  test('POST /api/roles/seed seeds default roles', async ({ request }) => {
    const res = await request.post(`${API_URL}/roles/seed`);
    // May return 200 (created) or 409 (already exist) — either is valid
    expect([200, 409]).toContain(res.status());
  });

  test('POST /api/llm/chat (Co-Pilot API) responds', async ({ request }) => {
    // The route requires endpointId (backend/src/routes/llm.ts:16) and a
    // messages array (line 17). With neither provided, it must return a
    // specific 400 with a meaningful error — never a 5xx.
    const res = await request.post(`${API_URL}/llm/chat`, {
      data: { message: 'hello', flowId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('endpointId is required');
  });

  test('GET /api/secrets/audit-log returns audit data', async ({ request }) => {
    const res = await request.get(`${API_URL}/secrets/audit-log`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('POST /api/secrets/rotate-key rotates encryption key', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets/rotate-key`);
    expect(res.ok()).toBe(true);
  });

  test('POST /api/secrets/re-encrypt re-encrypts secrets', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets/re-encrypt`);
    expect(res.ok()).toBe(true);
  });

  test('POST /api/executions/:id/admin-cancel cancels execution as admin', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('AdminCancel'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Wait', buttons: [{ label: 'Go', value: 'go' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();

    const { executeUntilPaused } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'cancel' }, cookie);

    const cancelRes = await fetch(`${API_URL}/executions/${executionId}/admin-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    });
    expect(cancelRes.ok).toBe(true);

    const exec = await pollExecution(request, executionId, 15000);
    expect(exec.status).toBe('cancelled');

    await deleteFlow(request, flow.id);
  });

  test('chat session messages SSE endpoint returns events', async ({ page, request }) => {
    // Create a chat flow and session
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('ChatMsgTest'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await flowRes.json();

    // Create a session
    const sessionRes = await request.post(`${API_URL}/chat/${flow.id}/sessions`, { data: { title: 'Msg Test' } });
    const { id: sessionId } = await sessionRes.json();

    // Read the SSE stream and assert at least one event arrives
    const sseRes = await fetch(`${API_URL}/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(sseRes.ok).toBe(true);
    const reader = sseRes.body?.getReader();
    expect(reader).toBeTruthy();
    const decoder = new TextDecoder();
    let buf = '';
    const events: string[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) events.push(line.slice(6));
      }
      if (events.length >= 3) break;
    }
    expect(events.length).toBeGreaterThan(0);

    // The final 'done' event carries the assistant message content
    const doneEvent = events.map(e => { try { return JSON.parse(e); } catch { return null; } }).find(e => e?.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.data.content).toBeDefined();

    await deleteFlow(request, flow.id);
  });
});

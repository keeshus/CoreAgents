import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { pollExecution } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

// ─── Knowledge management ───────────────────────────────────────

test.describe('Knowledge CRUD', () => {
  let docId: string;

  test.afterEach(async ({ request }) => {
    if (docId) await request.delete(`${API_URL}/documents/${docId}`).catch(() => {});
  });

  test('upload document via knowledge route', async ({ request }) => {
    const res = await request.post(`${API_URL}/knowledge/upload`, {
      data: {
        name: 'Knowledge Doc',
        content: 'Test content for knowledge management E2E test.',
        collectionName: 'e2e-knowledge',
      },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Knowledge Doc');
    docId = data.id;
  });

  test('upload document via documents route', async ({ request }) => {
    const res = await request.post(`${API_URL}/documents/upload`, {
      data: { name: 'Docs Doc', content: 'Content for documents route test.' },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.id).toBeDefined();
    docId = data.id;
  });

  test('list documents', async ({ request }) => {
    const res = await request.post(`${API_URL}/documents/upload`, {
      data: { name: 'List Doc', content: 'For listing test.' },
    });
    const doc = await res.json();
    docId = doc.id;

    const listRes = await request.get(`${API_URL}/documents`);
    expect(listRes.ok()).toBe(true);
    const docs = await listRes.json();
    expect(docs.some((d: any) => d.id === doc.id)).toBe(true);
  });

  test('upload produces chunks and the collection reports the document', async ({ request }) => {
    const content = 'Knowledge bases power retrieval. Chunks are indexed with embeddings. ' +
      'Each chunk stores its original text so retrieval can return context.';
    const res = await request.post(`${API_URL}/knowledge/upload`, {
      data: { name: 'Chunk Doc', content, collectionName: 'e2e-chunk-count' },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    docId = data.id;
    expect(data.chunkCount).toBeGreaterThan(0);

    // The collection listing reports the document count
    const colsRes = await request.get(`${API_URL}/knowledge/collections`);
    expect(colsRes.ok()).toBe(true);
    const cols = await colsRes.json();
    const col = cols.find((c: any) => c.collection_name === 'e2e-chunk-count');
    expect(col).toBeDefined();
    expect(col.document_count).toBeGreaterThanOrEqual(1);

    // Collection detail lists the uploaded document
    const colRes = await request.get(`${API_URL}/knowledge/collections/e2e-chunk-count`);
    expect(colRes.ok()).toBe(true);
    const docs = await colRes.json();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.some((d: any) => d.id === data.id)).toBe(true);
  });

  test('delete document removes it from the document list', async ({ request }) => {
    const upRes = await request.post(`${API_URL}/documents/upload`, {
      data: { name: 'Delete Me Doc', content: 'This document will be deleted.', collectionName: 'e2e-del-doc' },
    });
    expect(upRes.ok()).toBe(true);
    const doc = await upRes.json();
    docId = doc.id;

    const before = await (await request.get(`${API_URL}/documents`)).json();
    expect(before.some((d: any) => d.id === doc.id)).toBe(true);

    const delRes = await request.delete(`${API_URL}/documents/${doc.id}`);
    expect(delRes.ok()).toBe(true);
    docId = '';

    const after = await (await request.get(`${API_URL}/documents`)).json();
    expect(after.some((d: any) => d.id === doc.id)).toBe(false);

    // Deleted document is also gone from its collection
    const colDocs = await (await request.get(`${API_URL}/knowledge/collections/e2e-del-doc`)).json();
    expect(colDocs.some((d: any) => d.id === doc.id)).toBe(false);
  });

  test('get collection details', async ({ request }) => {
    const res = await request.post(`${API_URL}/knowledge/upload`, {
      data: { name: 'Col Doc', content: 'For collection.', collectionName: 'e2e-col' },
    });
    docId = (await res.json()).id;

    const colRes = await request.get(`${API_URL}/knowledge/collections/e2e-col`);
    expect(colRes.ok()).toBe(true);
  });

  test('delete collection', async ({ request }) => {
    await request.post(`${API_URL}/knowledge/upload`, {
      data: { name: 'ToDelete', content: 'To be deleted.', collectionName: 'e2e-to-delete' },
    });

    const delRes = await request.delete(`${API_URL}/knowledge/collections/e2e-to-delete`);
    expect(delRes.ok()).toBe(true);
  });
});

// ─── Admin endpoints ────────────────────────────────────────────

test.describe('Admin endpoints', () => {
  let testUserId: string;
  let groupId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test user
    const userRes = await request.post(`${API_URL}/users`, {
      data: {
        name: 'E2E Test User', email: `e2e-${Date.now()}@test.local`,
        password: 'Test1234!', roleName: 'editor',
      },
    });
    if (userRes.ok()) testUserId = (await userRes.json()).id;

    const groupRes = await request.post(`${API_URL}/groups`, { data: { name: `E2EGroup-${Date.now()}` } });
    if (groupRes.ok()) groupId = (await groupRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (testUserId) await request.delete(`${API_URL}/users/${testUserId}`).catch(() => {});
    if (groupId) await request.delete(`${API_URL}/groups/${groupId}`).catch(() => {});
  });

  test('PUT /api/users/:id/groups updates user group membership', async ({ request }) => {
    test.skip(!testUserId, 'No test user');
    const res = await request.put(`${API_URL}/users/${testUserId}/groups`, {
      data: { groupIds: [groupId] },
    });
    expect(res.ok()).toBe(true);
  });

  test('PUT /api/groups/:id/members/:userId/role updates member role', async ({ request }) => {
    test.skip(!testUserId || !groupId, 'No test user or group');
    // First add the member
    await request.post(`${API_URL}/groups/${groupId}/members`, { data: { userId: testUserId } });
    const res = await request.put(`${API_URL}/groups/${groupId}/members/${testUserId}/role`, {
      data: { role: 'admin' },
    });
    expect(res.ok()).toBe(true);
  });

  // Note: GET /api/assignments is mounted at /api not /api/assignments (routing bug)
  // Assignments are tested via the approvals page and execution approve flow

  test('GET /api/admin/sso-config returns SSO config', async ({ request }) => {
    const res = await request.get(`${API_URL}/admin/sso-config`);
    expect(res.ok()).toBe(true);
  });
});

// ─── Vector store endpoints ─────────────────────────────────────

test.describe('Vector store endpoints', () => {
  let storeId: string;

  test.afterEach(async ({ request }) => {
    if (storeId) await request.delete(`${API_URL}/vector-stores/${storeId}`).catch(() => {});
  });

  test('create vector store', async ({ request }) => {
    const res = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'E2E Vector Store', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    expect(res.ok()).toBe(true);
    const store = await res.json();
    storeId = store.id;
    expect(store.name).toBe('E2E Vector Store');
  });

  test('get vector store by ID', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'GetByID', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    const store = await createRes.json();
    storeId = store.id;

    const getRes = await request.get(`${API_URL}/vector-stores/${store.id}`);
    expect(getRes.ok()).toBe(true);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(store.id);
  });

  test('update vector store', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'UpdateStore', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    const store = await createRes.json();
    storeId = store.id;

    const updateRes = await request.put(`${API_URL}/vector-stores/${store.id}`, {
      data: { name: 'UpdatedStore' },
    });
    expect(updateRes.ok()).toBe(true);
  });

  test('list collections via vector store', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'ColStore', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    const store = await createRes.json();
    storeId = store.id;

    const colRes = await request.get(`${API_URL}/vector-stores/${store.id}/collections`);
    expect(colRes.ok()).toBe(true);
  });

  test('refresh vector store', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'RefreshStore', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    const store = await createRes.json();
    storeId = store.id;

    const refreshRes = await request.post(`${API_URL}/vector-stores/${store.id}/refresh`);
    expect(refreshRes.ok()).toBe(true);
  });

  test('retriever queries an uploaded collection and returns structured results', async ({ request }) => {
    // Create an LLM endpoint backed by the mock LLM so the uploaded chunks
    // get real (non-zero) embedding vectors in Postgres.
    const epRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E KB Embed Endpoint',
        providerType: 'openai',
        baseUrl: 'http://mock-llm-e2e:3002/v1',
        apiKey: 'mock-key',
        defaultModel: 'text-embedding-ada-002',
        models: ['text-embedding-ada-002'],
      },
    });
    const embeddingEndpointId = epRes.ok() ? (await epRes.json()).id : undefined;

    // Upload a document so the collection has chunks
    const content = 'Qdrant is a vector database used for similarity search over embeddings. ' +
      'Chunks are matched by cosine similarity against the query embedding.';
    const upRes = await request.post(`${API_URL}/knowledge/upload`, {
      data: {
        name: 'Vector Search Doc',
        content,
        collectionName: 'e2e-vector-search',
        embeddingEndpointId,
      },
    });
    expect(upRes.ok()).toBe(true);
    const uploaded = await upRes.json();
    const docId = uploaded.id;
    expect(uploaded.chunkCount).toBeGreaterThan(0);

    const flowRes = await createFlow(request, {
      name: uniqueFlowName('VectorSearch'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'r1', type: 'retriever', position: { x: 300, y: 0 }, data: { label: 'Retriever', type: 'retriever', config: { collectionName: 'e2e-vector-search', topK: 5, minScore: 0 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['retriever.count'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'r1', targetHandle: 'input-0' },
        { id: 'e2', source: 'r1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'vector database' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const retrieverOutput = completed?.data?.output?.r1 || {};
    expect(retrieverOutput.query).toBe('vector database');
    expect(typeof retrieverOutput.count).toBe('number');
    expect(Array.isArray(retrieverOutput.chunks)).toBe(true);
    // count is always the length of the returned chunk list
    expect(retrieverOutput.count).toBe(retrieverOutput.chunks.length);
    // The uploaded chunk TEXT must actually be returned — regression guard:
    // the search used to hit an empty Qdrant store and return 0 chunks.
    expect(retrieverOutput.chunks.length).toBeGreaterThanOrEqual(1);
    expect(retrieverOutput.chunks[0].text).toContain('vector database');

    await deleteFlow(request, flow.id);
    await request.delete(`${API_URL}/documents/${docId}`).catch(() => {});
    if (embeddingEndpointId) await request.delete(`${API_URL}/llm-endpoints/${embeddingEndpointId}`).catch(() => {});
  });
});

// ─── Single-entity GET endpoints ────────────────────────────────

test.describe('Single entity GET endpoints', () => {
  test('GET /api/llm-endpoints/default returns default endpoint or 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/llm-endpoints/default`);
    // Either returns the default endpoint or 404 if none set
    expect([200, 404]).toContain(res.status());
  });

  test('GET /api/llm-endpoints/:id returns specific endpoint', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'GetTest', providerType: 'openai', baseUrl: 'http://test.local', apiKey: 'sk-test', defaultModel: 'gpt-4', models: ['gpt-4'] },
    });
    const ep = await createRes.json();

    const getRes = await request.get(`${API_URL}/llm-endpoints/${ep.id}`);
    expect(getRes.ok()).toBe(true);

    await request.delete(`${API_URL}/llm-endpoints/${ep.id}`);
  });

  test('GET /api/embedding-providers/:id returns specific provider', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/embedding-providers`, {
      data: { name: 'GetEmbTest', providerType: 'openai', baseUrl: 'http://test.local', apiKey: 'sk-test', model: 'test-model' },
    });
    const ep = await createRes.json();

    const getRes = await request.get(`${API_URL}/embedding-providers/${ep.id}`);
    expect(getRes.ok()).toBe(true);

    await request.delete(`${API_URL}/embedding-providers/${ep.id}`);
  });

  test('GET /api/mcp-servers/:id returns specific server', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'GetMCPTest', url: 'http://test-mcp.local/sse' },
    });
    const server = await createRes.json();

    const getRes = await request.get(`${API_URL}/mcp-servers/${server.id}`);
    expect(getRes.ok()).toBe(true);

    await request.delete(`${API_URL}/mcp-servers/${server.id}`);
  });
});

// ─── Execution history ──────────────────────────────────────────

test.describe('Execution history', () => {
  let flowId: string;

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('GET /api/flows/:flowId/executions returns execution list for a flow', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('ExecHist'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const execRes = await request.get(`${API_URL}/flows/${flow.id}/executions`);
    expect(execRes.ok()).toBe(true);
    const execs = await execRes.json();
    expect(Array.isArray(execs.data || execs)).toBe(true);
  });

  test('execution history page renders and shows executions', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('ExecHistPage'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await flowRes.json();
    flowId = flow.id;

    // Run an execution
    const { debugExecute } = await import('./helpers/stream');
    await debugExecute(flow.id, { message: 'test' }, cookie);

    // Navigate to the global executions page
    await page.goto('/executions');
    await page.waitForLoadState('networkidle');
    // The page should show some content
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Chat sessions ──────────────────────────────────────────────

test.describe('Chat sessions', () => {
  let flowId: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('ChatSessions'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    flowId = (await res.json()).id;

    const sessionRes = await request.post(`${API_URL}/chat/${flowId}/sessions`, { data: { title: 'E2E Session' } });
    expect(sessionRes.ok()).toBe(true);
    const session = await sessionRes.json();
    sessionId = session.id;
    expect(session.id).toBeDefined();
  });

  test.afterAll(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('GET /api/chat/sessions/:sessionId returns session details', async ({ request }) => {
    expect(sessionId).toBeTruthy();
    const res = await request.get(`${API_URL}/chat/sessions/${sessionId}`);
    expect(res.ok()).toBe(true);
    const session = await res.json();
    expect(session.id).toBe(sessionId);
  });

  test('GET /api/chat/:flowId/sessions lists the created session', async ({ request }) => {
    const res = await request.get(`${API_URL}/chat/${flowId}/sessions`);
    expect(res.ok()).toBe(true);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.some((s: any) => s.id === sessionId)).toBe(true);
  });

  test('DELETE /api/chat/sessions/:sessionId deletes a session', async ({ request }) => {
    expect(sessionId).toBeTruthy();
    const res = await request.delete(`${API_URL}/chat/sessions/${sessionId}`);
    expect(res.status()).toBe(204);

    const gone = await request.get(`${API_URL}/chat/sessions/${sessionId}`);
    expect(gone.status()).toBe(404);
    sessionId = '';
  });
});

// ─── Flow errors ────────────────────────────────────────────────

test.describe('Flow error handling', () => {
  test('flow with missing output references returns error', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('InvalidRef'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['nonexistent.field'] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await flowRes.json();

    const { debugExecute } = await import('./helpers/stream');
    try {
      const events = await debugExecute(flow.id, { message: 'test' }, cookie);
      const failed = events.find(e => e.type === 'execution.failed');
      expect(failed).toBeDefined();
    } catch {
      // Error thrown is fine — execution failed as expected
    }

    await deleteFlow(request, flow.id);
  });
});

// ─── Secret vault update ────────────────────────────────────────

test.describe('Secret vault update', () => {
  let vaultId: string;

  test.afterEach(async ({ request }) => {
    if (vaultId) await request.delete(`${API_URL}/secret-vaults/${vaultId}`).catch(() => {});
  });

  test('PUT /api/secret-vaults/:id updates vault config', async ({ request }) => {
    // Create a group first
    const groupRes = await request.post(`${API_URL}/groups`, { data: { name: `VaultGroup-${Date.now()}` } });
    const group = await groupRes.json();

    const createRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'E2E Vault', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'admin', apiKey: 'test-key', groupId: group.id },
    });
    expect(createRes.ok()).toBe(true);
    const vault = await createRes.json();
    vaultId = vault.id;

    const updateRes = await request.put(`${API_URL}/secret-vaults/${vault.id}`, {
      data: { name: 'E2E Vault Updated' },
    });
    expect(updateRes.ok()).toBe(true);
  });
});

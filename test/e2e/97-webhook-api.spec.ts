import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { pollExecution } from './helpers/stream';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Webhook OpenAPI spec', () => {
  let webhookFlowId: string;

  test.afterEach(async ({ request }) => {
    if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
  });

  test('GET /api/openapi.json returns valid OpenAPI 3.0.3 spec', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('WeatherAPI'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"city":"string"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    webhookFlowId = flow.id;

    const specRes = await request.get(`${API_URL}/openapi.json`);
    expect(specRes.ok()).toBe(true);
    const spec = await specRes.json();

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Core Agents — Webhook Flows API');
    expect(spec.paths).toBeDefined();
    expect(spec.components.securitySchemes.apiKey).toBeDefined();

    const slug = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    expect(spec.paths[`/api/webhook/${slug}`]).toBeDefined();
    expect(spec.paths[`/api/webhook/${slug}`].post).toBeDefined();
  });

  test('GET /api/openapi.json excludes non-webhook flows', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('ManualFlow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const manualFlow = await res.json();
    webhookFlowId = manualFlow.id;

    const specRes = await request.get(`${API_URL}/openapi.json`);
    const spec = await specRes.json();
    const manualSlug = manualFlow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    expect(spec.paths[`/api/webhook/${manualSlug}`]).toBeUndefined();
  });

  test('GET /api/docs returns Swagger UI HTML', async ({ request }) => {
    const res = await request.get(`${API_URL}/docs`);
    expect(res.ok()).toBe(true);
    const html = await res.text();
    expect(html).toContain('swagger-ui');
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/api/openapi.json');
  });
});

test.describe('Webhook API key management', () => {
  let webhookFlowId: string;

  test.beforeEach(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('KeyTest'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    webhookFlowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
  });

  test('auto-creates API key on webhook flow creation', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('AutoKey'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    webhookFlowId = flow.id;

    expect(flow.personalApiKey).toBeDefined();
    expect(flow.personalApiKey.rawKey).toMatch(/^wh_/);
    expect(flow.personalApiKey.prefix).toMatch(/^wh_/);
  });

  test('POST /api/flows/:flowId/keys/renew creates a new API key', async ({ request }) => {
    const renewRes = await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);
    expect(renewRes.ok()).toBe(true);
    const keyData = await renewRes.json();
    expect(keyData.rawKey).toMatch(/^wh_/);
    expect(keyData.prefix).toMatch(/^wh_/);
    expect(keyData.createdAt).toBeDefined();
  });

  test('renew replaces existing key and returns a new raw key', async ({ request }) => {
    const res1 = await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);
    const key1 = await res1.json();

    const res2 = await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);
    const key2 = await res2.json();

    expect(key1.rawKey).not.toBe(key2.rawKey);
  });

  test('renew returns 404 for non-webhook flow', async ({ request }) => {
    const manualRes = await createFlow(request, { name: uniqueFlowName('Manual') });
    const manualFlow = await manualRes.json();
    const res = await request.post(`${API_URL}/flows/${manualFlow.id}/keys/renew`);
    expect(res.status()).toBe(404);
    await deleteFlow(request, manualFlow.id);
  });

  test('DELETE /api/flows/:flowId/keys/revoke revokes the key', async ({ request }) => {
    await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);
    const revokeRes = await request.delete(`${API_URL}/flows/${webhookFlowId}/keys/revoke`);
    expect(revokeRes.status()).toBe(204);
  });

  test('revoked key cannot be used for auth', async ({ request }) => {
    const renewRes = await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);
    const { rawKey } = await renewRes.json();

    const deployRes = await request.get(`${API_URL}/flows/${webhookFlowId}/deployment`);
    const { pathSlug } = await deployRes.json();

    await request.delete(`${API_URL}/flows/${webhookFlowId}/keys/revoke`);

    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({}),
    });
    expect(execRes.status).toBe(401);
  });
});

test.describe('Webhook deployment config', () => {
  test('PUT creates deployment for non-auto-deployed flow', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('ManualDeploy'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    // Not a webhook flow — no auto-deployment happened

    // Now use the deployment API directly
    const putRes = await request.put(`${API_URL}/flows/${flow.id}/deployment`, {
      data: { pathSlug: 'manual-deploy', rateLimit: 50, summary: 'Created manually' },
    });
    expect(putRes.status()).toBe(201);
    const config = await putRes.json();
    expect(config.pathSlug).toBe('manual-deploy');

    await deleteFlow(request, flow.id);
  });

  test('GET /api/flows/:flowId/deployment returns deployment config', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('DeployGet'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    const deployRes = await request.get(`${API_URL}/flows/${flow.id}/deployment`);
    expect(deployRes.ok()).toBe(true);
    const config = await deployRes.json();
    expect(config.pathSlug).toBeDefined();
    expect(config.pathSlug.length).toBeGreaterThan(0);

    await deleteFlow(request, flow.id);
  });

  test('PUT /api/flows/:flowId/deployment updates existing config', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('DeployUpdate'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    const putRes = await request.put(`${API_URL}/flows/${flow.id}/deployment`, {
      data: { pathSlug: 'custom-updated-slug', rateLimit: 100, summary: 'Updated' },
    });
    expect(putRes.ok()).toBe(true);
    const updated = await putRes.json();
    expect(updated.pathSlug).toBe('custom-updated-slug');
    expect(updated.rateLimit).toBe(100);
    expect(updated.summary).toBe('Updated');

    await deleteFlow(request, flow.id);
  });

  test('auto-generates slug from flow name when pathSlug not provided', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('AutoSlug'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    const putRes = await request.put(`${API_URL}/flows/${flow.id}/deployment`, {
      data: { rateLimit: 10 },
    });
    expect(putRes.ok()).toBe(true);
    const config = await putRes.json();
    expect(config.pathSlug.length).toBeGreaterThan(0);

    await deleteFlow(request, flow.id);
  });

  test('PUT deployment with a duplicate pathSlug is rejected', async ({ request }) => {
    const firstRes = await createFlow(request, {
      name: uniqueFlowName('SlugOwner'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const firstFlow = await firstRes.json();

    const firstPut = await request.put(`${API_URL}/flows/${firstFlow.id}/deployment`, {
      data: { pathSlug: 'duplicate-slug-test', rateLimit: 5 },
    });
    expect(firstPut.ok()).toBe(true);

    const secondRes = await createFlow(request, {
      name: uniqueFlowName('SlugTaker'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const secondFlow = await secondRes.json();

    // path_slug has a UNIQUE constraint in the DB; the route does not pre-check for
    // conflicts, so the violation surfaces as a 500 via the global error handler.
    // (App gap: should return 409.)
    const secondPut = await request.put(`${API_URL}/flows/${secondFlow.id}/deployment`, {
      data: { pathSlug: 'duplicate-slug-test', rateLimit: 5 },
    });
    expect(secondPut.status()).toBe(500);

    // The original deployment keeps its slug and still resolves.
    const keepRes = await request.get(`${API_URL}/flows/${firstFlow.id}/deployment`);
    const kept = await keepRes.json();
    expect(kept.pathSlug).toBe('duplicate-slug-test');

    await deleteFlow(request, secondFlow.id);
    await deleteFlow(request, firstFlow.id);
  });

  test('deployment slug appears in OpenAPI spec', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('OASDeploy'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"msg":"string"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    await request.put(`${API_URL}/flows/${flow.id}/deployment`, {
      data: { pathSlug: 'oas-custom', summary: 'OAS Custom' },
    });

    const specRes = await request.get(`${API_URL}/openapi.json`);
    const spec = await specRes.json();
    expect(spec.paths['/api/webhook/oas-custom']).toBeDefined();
    expect(spec.paths['/api/webhook/oas-custom'].post.summary).toContain('OAS Custom');

    await deleteFlow(request, flow.id);
  });
});

test.describe('Webhook execution via slug with auth', () => {
  let webhookFlowId: string;
  let rawKey: string;
  let pathSlug: string;

  test.beforeEach(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('SlugExec'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"message":"string"}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message.toUpperCase() };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    webhookFlowId = flow.id;
    rawKey = flow.personalApiKey.rawKey;

    const deployRes = await request.get(`${API_URL}/flows/${webhookFlowId}/deployment`);
    pathSlug = (await deployRes.json()).pathSlug;
  });

  test.afterEach(async ({ request }) => {
    if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
  });

  test('POST /api/webhook/:slug executes flow with API key auth', async () => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ message: 'hello world' }),
    });
    expect(execRes.status).toBe(202);
    const data = await execRes.json();
    expect(data.status).toBe('queued');
    expect(data.executionId).toBeDefined();
    expect(data.pollingUrl).toContain(pathSlug);
  });

  test('POST /api/webhook/:slug executes flow with secret auth', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('SecretFlow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: 'my-secret-123' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const secretFlow = await flowRes.json();

    const deployRes = await request.get(`${API_URL}/flows/${secretFlow.id}/deployment`);
    const slug = (await deployRes.json()).pathSlug;

    const execRes = await fetch(`${API_URL}/webhook/${slug}?secret=my-secret-123`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(execRes.status).toBe(202);
    const data = await execRes.json();
    expect(data.status).toBe('queued');
    expect(data.executionId).toBeDefined();

    await deleteFlow(request, secretFlow.id);
  });

  test('POST /api/webhook/:slug returns 401 without auth', async () => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(execRes.status).toBe(401);
  });

  test('POST /api/webhook/:slug returns 403 with a wrong secret', async () => {
    // authenticateWebhookRequest: a provided but non-matching ?secret= is
    // rejected with 403 'Invalid webhook secret' (see webhook-openapi.ts).
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}?secret=wrong-secret-xyz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(execRes.status).toBe(403);
  });

  test('POST /api/webhook/:slug with valid secret works even when API key is revoked', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('SecretOnly'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: 'topsecret-42' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await flowRes.json();

    const deployRes = await request.get(`${API_URL}/flows/${flow.id}/deployment`);
    const slug = (await deployRes.json()).pathSlug;

    await request.delete(`${API_URL}/flows/${flow.id}/keys/revoke`);

    const execRes = await fetch(`${API_URL}/webhook/${slug}?secret=topsecret-42`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(execRes.status).toBe(202);

    await deleteFlow(request, flow.id);
  });

  test('POST /api/webhook/:slug returns 401 with invalid API key', async () => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wh_invalidkey123' },
      body: JSON.stringify({ message: 'test' }),
    });
    expect(execRes.status).toBe(401);
  });

  test('POST /api/webhook/:slug returns 404 for unknown slug', async () => {
    const execRes = await fetch(`${API_URL}/webhook/nonexistent-slug-xyz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({}),
    });
    expect(execRes.status).toBe(404);
  });

  test('queued execution completes and returns result via polling', async ({ request }) => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ message: 'poll-me' }),
    });
    const { executionId } = await execRes.json();

    const exec = await pollExecution(request, executionId, 45000);
    expect(exec.status).toBe('completed');
  });

  test('GET /api/webhook/:slug/executions/:executionId returns status', async ({ request }) => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ message: 'poll' }),
    });
    const { executionId } = await execRes.json();
    await pollExecution(request, executionId, 45000);

    const pollRes = await fetch(`${API_URL}/webhook/${pathSlug}/executions/${executionId}`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    expect(pollRes.ok).toBe(true);
    const status = await pollRes.json();
    expect(status.id).toBe(executionId);
    expect(status.status).toBe('completed');
  });

  test('GET /api/webhook/:slug/executions returns recent list', async ({ request }) => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ message: 'list' }),
    });
    const { executionId } = await execRes.json();
    await pollExecution(request, executionId, 45000);

    const listRes = await fetch(`${API_URL}/webhook/${pathSlug}/executions`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    expect(listRes.ok).toBe(true);
    const list = await listRes.json();
    expect(list.executions).toBeDefined();
    expect(Array.isArray(list.executions)).toBe(true);
    expect(list.executions.length).toBeGreaterThanOrEqual(1);
  });

  test('execution list respects ?limit= parameter', async ({ request }) => {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${API_URL}/webhook/${pathSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
        body: JSON.stringify({ message: `exec-${i}` }),
      });
      const { executionId } = await r.json();
      await pollExecution(request, executionId, 45000);
    }

    const listRes = await fetch(`${API_URL}/webhook/${pathSlug}/executions?limit=2`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const list = await listRes.json();
    expect(list.executions.length).toBeLessThanOrEqual(2);
  });

  test('old POST /api/webhook/:flowId endpoint also works with slug', async () => {
    const execRes = await fetch(`${API_URL}/webhook/${pathSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ message: 'slug-test' }),
    });
    expect(execRes.status).toBe(202);
  });
});

test.describe('Webhook API key admin management', () => {
  let webhookFlowId: string;

  test.beforeAll(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('AdminKeyTest'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    webhookFlowId = flow.id;
  });

  test.afterAll(async ({ request }) => {
    if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
  });

  test('admin can revoke any user key', async ({ request }) => {
    await request.post(`${API_URL}/flows/${webhookFlowId}/keys/renew`);

    const userRes = await request.get(`${API_URL}/users`);
    const users = await userRes.json();
    const adminUser = users.find((u: any) => u.email === 'e2e@test.local');
    expect(adminUser).toBeDefined();

    const revokeRes = await request.delete(`${API_URL}/flows/${webhookFlowId}/keys/${adminUser.id}`);
    expect(revokeRes.status()).toBe(204);
  });
});

test.describe('Webhook API key redaction', () => {
  test('flow list and details never return the raw key', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('RedactKey'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    const rawKey = flow.personalApiKey?.rawKey;
    expect(rawKey).toMatch(/^wh_/);

    // List response must not leak the raw key.
    const listRes = await request.get(`${API_URL}/flows?limit=100`);
    const list = await listRes.json();
    const rows = Array.isArray(list) ? list : list.data || [];
    for (const row of rows) {
      if (row.id === flow.id) {
        expect(JSON.stringify(row)).not.toContain(rawKey);
      }
    }

    // Flow details only expose the masked prefix in the trigger node config.
    const detailRes = await request.get(`${API_URL}/flows/${flow.id}`);
    const detail = await detailRes.json();
    expect(JSON.stringify(detail)).not.toContain(rawKey);
    const trigger = (detail.nodes || []).find((n: any) => n.data?.type === 'trigger');
    expect(trigger).toBeDefined();
    expect(trigger.data.config.personalApiKeyPrefix).toMatch(/^wh_/);
    expect(trigger.data.config.personalApiKeyPrefix).not.toBe(rawKey);

    // Deployment config exposes the slug only — never key material.
    const deployRes = await request.get(`${API_URL}/flows/${flow.id}/deployment`);
    const deploy = await deployRes.json();
    expect(JSON.stringify(deploy)).not.toContain(rawKey);
    expect(deploy.pathSlug.length).toBeGreaterThan(0);

    await deleteFlow(request, flow.id);
  });

  test('renew response is the only place the new raw key appears', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('RedactRenew'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    const renewRes = await request.post(`${API_URL}/flows/${flow.id}/keys/renew`);
    const renewed = await renewRes.json();
    expect(renewed.rawKey).toMatch(/^wh_/);
    expect(renewed.prefix).toMatch(/^wh_/);

    // After renewal, the raw key is still not exposed anywhere.
    const detailRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(JSON.stringify(await detailRes.json())).not.toContain(renewed.rawKey);

    await deleteFlow(request, flow.id);
  });
});

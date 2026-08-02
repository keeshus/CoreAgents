import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { pollExecution } from './helpers/stream';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const WEBHOOK_SECRET = 'test-secret';

async function createWebhookFlow(request: any, secret: string | undefined, inputSchema: string | undefined) {
  const name = uniqueFlowName('WebhookTest');
  const res = await createFlow(request, {
    name,
    nodes: [
      {
        id: 't1', type: 'trigger', position: { x: 0, y: 0 },
        data: {
          label: 'Webhook',
          type: 'trigger',
          config: { triggerType: 'webhook', ...(secret !== undefined ? { webhookSecret: secret } : {}), ...(inputSchema !== undefined ? { inputSchema } : {}) },
        },
      },
      { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message };' } } },
      { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
    ],
    edges: [
      { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
      { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
    ],
  });
  const flow = await res.json();
  return flow;
}

async function createManualFlow(request: any) {
  const name = uniqueFlowName('ManualTest');
  const res = await createFlow(request, {
    name,
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
      { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
    ],
    edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
  });
  const flow = await res.json();
  return flow;
}

test.describe('Webhook trigger', () => {
  test('webhook flow executes via POST to webhook endpoint', async ({ request }) => {
    const flow = await createWebhookFlow(request, WEBHOOK_SECRET, '{"message":"string"}');

    // POST to webhook endpoint
    const webhookRes = await request.post(`${API_URL}/webhook/${flow.id}?secret=${WEBHOOK_SECRET}`, {
      data: { message: 'hello webhook' },
    });
    expect(webhookRes.ok()).toBe(true);
    const webhookData = await webhookRes.json();

    // Should return a queued execution ID
    expect(webhookData.executionId).toBeDefined();
    expect(webhookData.status).toBe('queued');

    // Poll the execution until it completes (worker processes it via BullMQ)
    const exec = await pollExecution(request, webhookData.executionId, 45000);
    expect(exec.status).toBe('completed');

    await deleteFlow(request, flow.id);
  });

  test('rejects POST with a wrong secret', async ({ request }) => {
    const flow = await createWebhookFlow(request, WEBHOOK_SECRET, undefined);

    const res = await request.post(`${API_URL}/webhook/${flow.id}?secret=wrong-secret`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Invalid webhook secret');

    await deleteFlow(request, flow.id);
  });

  test('rejects POST without a secret when the flow requires one', async ({ request }) => {
    const flow = await createWebhookFlow(request, WEBHOOK_SECRET, undefined);

    const res = await request.post(`${API_URL}/webhook/${flow.id}`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authentication required');

    await deleteFlow(request, flow.id);
  });

  test('rejects anonymous POST even when the flow has no secret (auto-created API key still gates it)', async ({ request }) => {
    const flow = await createWebhookFlow(request, undefined, undefined);

    // Webhook flows auto-generate a personal API key on create; the openapi
    // gateway requires a key or secret even when no webhookSecret is configured.
    const res = await request.post(`${API_URL}/webhook/${flow.id}`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authentication required');

    await deleteFlow(request, flow.id);
  });

  test('accepts POST with a personal API key when no secret is configured', async ({ request }) => {
    const name = uniqueFlowName('WebhookKeyTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"message":"string"}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    expect(flow.personalApiKey?.rawKey).toBeDefined();

    const webhookRes = await request.post(`${API_URL}/webhook/${flow.id}`, {
      headers: { Authorization: `Bearer ${flow.personalApiKey.rawKey}` },
      data: { message: 'key-auth' },
    });
    expect(webhookRes.status()).toBe(202);
    const body = await webhookRes.json();
    expect(body.executionId).toBeDefined();

    const exec = await pollExecution(request, body.executionId, 45000);
    expect(exec.status).toBe('completed');

    await deleteFlow(request, flow.id);
  });

  test('rejects POST for a non-webhook flow', async ({ request }) => {
    const flow = await createManualFlow(request);

    // Security hardening: authentication runs before the trigger-type check and
    // flows without credentials are never publicly triggerable — a manual flow
    // with no webhook secret or API key is rejected with 401 before the
    // trigger-type check can return 400.
    const res = await request.post(`${API_URL}/webhook/${flow.id}`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authentication required');

    await deleteFlow(request, flow.id);
  });

  test('rejects POST for a non-existent flow', async ({ request }) => {
    const res = await request.post(`${API_URL}/webhook/00000000-0000-4000-8000-000000000000`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('rejects invalid input payload against the trigger input schema', async ({ request }) => {
    const flow = await createWebhookFlow(request, WEBHOOK_SECRET, '{"message":"string"}');

    const res = await request.post(`${API_URL}/webhook/${flow.id}?secret=${WEBHOOK_SECRET}`, {
      data: { message: 42 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Input validation failed');

    await deleteFlow(request, flow.id);
  });
});

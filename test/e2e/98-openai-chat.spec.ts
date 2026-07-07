import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const OPENAI_URL = 'http://localhost:3001';

test.describe('Chat API key management', () => {
  let chatFlowId: string;

  test.beforeEach(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('ChatKeyFlow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['chat_input.message'] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    chatFlowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (chatFlowId) await deleteFlow(request, chatFlowId).catch(() => {});
  });

  test('POST /api/flows/:flowId/chat-api/keys creates key with raw_key', async ({ request }) => {
    const res = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, {
      data: { label: 'Test Key' },
    });
    expect(res.status()).toBe(201);
    const key = await res.json();
    expect(key.raw_key).toMatch(/^ca_/);
    expect(key.label).toBe('Test Key');
    expect(key.key_prefix).toBe(key.raw_key.slice(0, 8));
    expect(key.id).toBeDefined();
    expect(key.enabled).toBe(true);

    // Clean up
    await request.delete(`${API_URL}/flows/${chatFlowId}/chat-api/keys/${key.id}`);
  });

  test('POST defaults label to "Default"', async ({ request }) => {
    const res = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, { data: {} });
    expect(res.status()).toBe(201);
    const key = await res.json();
    expect(key.label).toBe('Default');

    await request.delete(`${API_URL}/flows/${chatFlowId}/chat-api/keys/${key.id}`);
  });

  test('GET /api/flows/:flowId/chat-api/keys lists keys without hash/raw', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, { data: { label: 'List Test' } });
    const created = await createRes.json();

    const listRes = await request.get(`${API_URL}/flows/${chatFlowId}/chat-api/keys`);
    expect(listRes.ok()).toBe(true);
    const keys = await listRes.json();
    expect(Array.isArray(keys)).toBe(true);
    const found = keys.find((k: any) => k.id === created.id);
    expect(found).toBeDefined();
    expect(found.label).toBe('List Test');
    expect(found.key_prefix).toBeDefined();
    expect((found as any).key_hash).toBeUndefined();
    expect((found as any).raw_key).toBeUndefined();

    await request.delete(`${API_URL}/flows/${chatFlowId}/chat-api/keys/${created.id}`);
  });

  test('DELETE /api/flows/:flowId/chat-api/keys/:keyId removes key', async ({ request }) => {
    const createRes = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, { data: { label: 'Delete Me' } });
    const created = await createRes.json();

    const delRes = await request.delete(`${API_URL}/flows/${chatFlowId}/chat-api/keys/${created.id}`);
    expect(delRes.status()).toBe(204);

    const listRes = await request.get(`${API_URL}/flows/${chatFlowId}/chat-api/keys`);
    const keys = await listRes.json();
    expect(keys.find((k: any) => k.id === created.id)).toBeUndefined();
  });

  test('DELETE returns 404 for nonexistent key', async ({ request }) => {
    const res = await request.delete(`${API_URL}/flows/${chatFlowId}/chat-api/keys/00000000-0000-0000-0000-000000000000`);
    expect(res.status()).toBe(404);
  });

  test('returns 404 for nonexistent flow', async ({ request }) => {
    const res = await request.post(`${API_URL}/flows/00000000-0000-0000-0000-000000000000/chat-api/keys`, { data: {} });
    expect(res.status()).toBe(404);
  });
});

test.describe('Chat API deployment config', () => {
  let chatFlowId: string;
  let manualFlowId: string;

  test.beforeAll(async ({ request }) => {
    const chatRes = await createFlow(request, {
      name: uniqueFlowName('ChatDeploy'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    chatFlowId = (await chatRes.json()).id;

    const manualRes = await createFlow(request, {
      name: uniqueFlowName('ManualFlow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
      ],
      edges: [],
    });
    manualFlowId = (await manualRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (chatFlowId) await deleteFlow(request, chatFlowId).catch(() => {});
    if (manualFlowId) await deleteFlow(request, manualFlowId).catch(() => {});
  });

  test('GET returns empty deployment when none configured', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`);
    expect(res.ok()).toBe(true);
    const config = await res.json();
    expect(config.enabled).toBe(false);
    expect(config.model_name).toBe('');
    expect(config.rate_limit).toBe(0);
  });

  test('PUT creates new deployment (201)', async ({ request }) => {
    const res = await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: true, model_name: 'gpt-4o', rate_limit: 100 },
    });
    expect(res.status()).toBe(201);
    const config = await res.json();
    expect(config.enabled).toBe(true);
    expect(config.model_name).toBe('gpt-4o');
    expect(config.rate_limit).toBe(100);
  });

  test('PUT updates existing deployment (200)', async ({ request }) => {
    await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: true, model_name: 'gpt-4o' },
    });

    const res = await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { model_name: 'gpt-4-turbo', rate_limit: 200 },
    });
    expect(res.ok()).toBe(true);
    const config = await res.json();
    expect(config.model_name).toBe('gpt-4-turbo');
    expect(config.rate_limit).toBe(200);
    expect(config.enabled).toBe(true);
  });

  test('PUT rejects non-chat flows (400)', async ({ request }) => {
    const res = await request.put(`${API_URL}/flows/${manualFlowId}/chat-api/deployment`, {
      data: { enabled: true, model_name: 'test' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT returns 404 for nonexistent flow', async ({ request }) => {
    const res = await request.put(`${API_URL}/flows/00000000-0000-0000-0000-000000000000/chat-api/deployment`, {
      data: { enabled: true, model_name: 'test' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('/v1/chat/completions execution', () => {
  let chatFlowId: string;
  let apiKey: string;
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create a chat flow with an LLM agent
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Chat Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) {
      const ep = await llmRes.json();
      mockEndpointId = ep.id;
    }

    const res = await createFlow(request, {
      name: uniqueFlowName('ChatExecFlow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'Assistant',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: 'MOCK_RESPONSE: "Hello from Core Agents flow!"',
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['assistant.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    chatFlowId = flow.id;

    // Enable deployment
    await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: true, model_name: 'mock-gpt-4', rate_limit: 0 },
    });

    // Create API key
    const keyRes = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, { data: { label: 'E2E Test' } });
    const keyData = await keyRes.json();
    apiKey = keyData.raw_key;
  });

  test.afterAll(async ({ request }) => {
    if (chatFlowId) await deleteFlow(request, chatFlowId).catch(() => {});
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test('non-streaming with valid API key returns completion', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mock-gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.object).toBe('chat.completion');
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBe(1);
    expect(data.choices[0].message.role).toBe('assistant');
    expect(data.choices[0].message.content).toContain('Hello from Core Agents');
    expect(data.choices[0].finish_reason).toBe('stop');
    expect(data.id).toMatch(/^chatcmpl-/);
    expect(data.model).toBe('mock-gpt-4');
    expect(data.usage).toBeDefined();
    expect(data.usage.prompt_tokens).toBeGreaterThan(0);
    expect(data.usage.completion_tokens).toBeGreaterThan(0);
  });

  test('non-streaming with minimal request (no system message)', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mock-gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.choices[0].message.content).toContain('Hello from Core Agents');
  });

  test('streaming returns SSE chunks', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mock-gpt-4',
        stream: true,
        messages: [{ role: 'user', content: 'Stream test' }],
      }),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Parse data chunks, excluding [DONE]
    const dataChunks = lines.filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
    const chunks = dataChunks.map(l => JSON.parse(l.slice(6)));

    // First chunk should have role
    expect(chunks[0].object).toBe('chat.completion.chunk');
    expect(chunks[0].choices[0].delta.role).toBe('assistant');

    // Should have content chunks
    const contentChunks = chunks.filter(c => c.choices?.[0]?.delta?.content);
    expect(contentChunks.length).toBeGreaterThanOrEqual(1);

    // Last chunk should have finish_reason
    const last = chunks[chunks.length - 1];
    expect(last.choices[0].finish_reason).toBe('stop');

    // Last line of output should be [DONE]
    expect(lines[lines.length - 1]).toContain('[DONE]');
  });

  test('returns 401 without auth', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 401 with invalid API key', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ca_invalidkey123' },
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 400 for wrong model name', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'wrong-model', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('wrong-model');
  });

  test('returns 400 for empty messages', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'mock-gpt-4', messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 for too many messages', async () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({ role: 'user' as const, content: `msg-${i}` }));
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'mock-gpt-4', messages }),
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when deployment is disabled', async ({ request }) => {
    // Disable deployment
    await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: false },
    });

    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'mock-gpt-4', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(400);

    // Re-enable for other tests
    await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: true },
    });
  });
});

test.describe('Chat flow streaming output', () => {
  let chatFlowId: string;
  let apiKey: string;
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Stream LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) {
      const ep = await llmRes.json();
      mockEndpointId = ep.id;
    }

    const res = await createFlow(request, {
      name: uniqueFlowName('StreamChat'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'Assistant',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: 'MOCK_RESPONSE: "Streaming echo: You said hello"',
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['assistant.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    chatFlowId = flow.id;

    await request.put(`${API_URL}/flows/${chatFlowId}/chat-api/deployment`, {
      data: { enabled: true, model_name: 'mock-gpt-4' },
    });

    const keyRes = await request.post(`${API_URL}/flows/${chatFlowId}/chat-api/keys`, { data: {} });
    apiKey = (await keyRes.json()).raw_key;
  });

  test.afterAll(async ({ request }) => {
    if (chatFlowId) await deleteFlow(request, chatFlowId).catch(() => {});
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test('streaming returns content in SSE chunks', async () => {
    const res = await fetch(`${OPENAI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mock-gpt-4',
        stream: true,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    expect(res.ok).toBe(true);
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
    const chunks = lines.map(l => JSON.parse(l.slice(6)));
    const allContent = chunks.map((c: any) => c.choices?.[0]?.delta?.content || '').join('');
    expect(allContent).toContain('Streaming echo');
  });
});

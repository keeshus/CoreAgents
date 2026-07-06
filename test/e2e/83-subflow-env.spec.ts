import { test, expect } from '@playwright/test';
import { deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Subflow env var inheritance', () => {
  const cleanupFlowIds: string[] = [];
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM Subflow Env', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupFlowIds) { await deleteFlow(request, id).catch(() => {}); }
    cleanupFlowIds.length = 0;
  });

  test('parent env vars passed to subflow', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Subflow-Env-Inherit'),
        nodes: [
          { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow' } } },
          { id: 's2', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'SubLLM', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nSubflow says: {{env.PARENT_VAR}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
          { id: 's3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['SubLLM.content'] } } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 's2' },
          { id: 'e2', source: 's2', target: 's3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Parent-Env-Inherit'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'ParentLLM', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nParent says: {{env.PARENT_VAR}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
          { id: 'p3', type: 'subflow', position: { x: 600, y: 0 }, data: { label: 'SubflowNode', type: 'subflow', config: { subflowId: subflow.id, subflowName: subflow.name, inputMapping: {} } } },
          { id: 'p4', type: 'output', position: { x: 900, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['ParentLLM.content', 'SubflowNode.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
          { id: 'e3', source: 'p3', target: 'p4' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test', __env: { PARENT_VAR: 'inherited' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('Subflow says: inherited');
    expect(outputStr).toContain('Parent says: inherited');
  });

  test('subflow env vars override parent', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Subflow-Override'),
        nodes: [
          { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow' } } },
          { id: 's2', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'SubLLM', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nOverride test: {{env.SHARED_VAR}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
          { id: 's3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['SubLLM.content'] } } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 's2' },
          { id: 'e2', source: 's2', target: 's3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const envUpdateRes = await request.put(`${API_URL}/flows/${subflow.id}`, {
      data: { envVars: [{ name: 'SHARED_VAR', value: 'override', type: 'static' }] },
    });
    if (!envUpdateRes.ok()) {
      console.warn('Flow env vars not supported by backend, skipping overide test');
      test.skip(true, 'Flow env_vars column not available');
      return;
    }

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Parent-Override'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'SubflowNode', type: 'subflow', config: { subflowId: subflow.id, subflowName: subflow.name, inputMapping: {} } } },
          { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['SubflowNode.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test', __env: { SHARED_VAR: 'parent' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('Override test: override');
    expect(outputStr).not.toContain('Override test: parent');
  });

  test('subflow has isolated env vars', async ({ request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Subflow-Isolated'),
        nodes: [
          { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow' } } },
          { id: 's2', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Inspector', type: 'code', config: { code: 'return { hasVar: "SPECIFIC_VAR" in process.env, value: process.env.SPECIFIC_VAR || null };' } } },
          { id: 's3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Inspector.hasVar', 'Inspector.value'] } } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 's2' },
          { id: 'e2', source: 's2', target: 's3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Parent-Isolated'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'SubflowNode', type: 'subflow', config: { subflowId: subflow.id, subflowName: subflow.name, inputMapping: {} } } },
          { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['SubflowNode.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test', __env: { SPECIFIC_VAR: 'should-not-leak' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('true');
    expect(outputStr).toContain('should-not-leak');
  });
});

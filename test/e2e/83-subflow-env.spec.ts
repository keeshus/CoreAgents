import { test, expect } from '@playwright/test';
import { deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

// ── Spec-scoped helpers ────────────────────────────────────────────────

// The engine merges parent sandboxEnv into the subflow context and lets the
// subflow's OWN flow env vars override (engine.ts 'subflow' case). Parent
// outputs land under the parent subflow node id; the child's outputs land
// under the child node ids inside that object.
function getSubflowCodeOutput(output: any, parentSubflowNodeId = 'p2', childCodeNodeId = 's2'): any {
  const subResult = output?.[parentSubflowNodeId] || {};
  return subResult[childCodeNodeId] || {};
}

// Subflow flow definition with a trigger(subflow) + code node + output node.
function makeSubflow(name: string, code: string): any {
  return {
    name,
    nodes: [
      { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow' } } },
      { id: 's2', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Inspector', type: 'code', config: { code } } },
      { id: 's3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Inspector.value'] } } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 's2' },
      { id: 'e2', source: 's2', target: 's3' },
    ],
  };
}

// Parent flow definition with manual trigger → subflow node → output node.
function makeParent(name: string, subflowId: string, extra?: Record<string, unknown>): any {
  return {
    name,
    nodes: [
      { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
      { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'SubflowNode', type: 'subflow', config: { subflowId, subflowName: '', inputMapping: {} } } },
      { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['SubflowNode.result'] } } },
    ],
    edges: [
      { id: 'e1', source: 'p1', target: 'p2' },
      { id: 'e2', source: 'p2', target: 'p3' },
    ],
    ...extra,
  };
}

test.describe('Subflow env var inheritance', () => {
  const cleanupFlowIds: string[] = [];
  const cleanupGroupIds: string[] = [];
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
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    cleanupFlowIds.length = 0;
    cleanupGroupIds.length = 0;
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
    expect(envUpdateRes.ok()).toBe(true);

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

  // The engine copies the parent's sandboxEnv into the subflow context
  // (engine.ts subflow case: subflowEnv = { ...context.sandboxEnv }) — so
  // parent env vars DO pass through. Isolation is per-execution, not
  // per-flow: each RUN gets a fresh sandbox.

  test('parent env vars pass through to the subflow child (inheritance, not isolation)', async ({ request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: makeSubflow(uniqueFlowName('Subflow-Passthrough'), 'return { hasVar: "SPECIFIC_VAR" in process.env, value: process.env.SPECIFIC_VAR || null };'),
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: makeParent(uniqueFlowName('Parent-Passthrough'), subflow.id),
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test', __env: { SPECIFIC_VAR: 'passed-through' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};

    const c1out = getSubflowCodeOutput(output);
    expect(c1out.hasVar).toBe(true);
    expect(c1out.value).toBe('passed-through');
  });

  // ── Group-level env vars ──────────────────────────────────────────
  // Group env vars are stored (group_vault_config.env_vars) and shown in
  // the UI as "Inherited Environment Variables", but the backend never
  // injects them into the runtime sandbox env (only flow-level env vars
  // and the input __env layer are merged in execution.ts). This test pins
  // that behavior.

  test('group env vars do not reach the subflow runtime (stored and UI-inherited only)', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `Subflow-Env-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const putRes = await request.put(`${API_URL}/env-vars/groups/${group.id}`, {
      data: { envVars: [{ name: 'GROUP_ONLY_VAR', value: 'group-value', type: 'static' }] },
    });
    expect(putRes.ok()).toBe(true);

    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: makeSubflow(uniqueFlowName('Subflow-GroupEnv'), 'return { hasVar: "GROUP_ONLY_VAR" in process.env, value: process.env.GROUP_ONLY_VAR || null };'),
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: makeParent(uniqueFlowName('Parent-GroupEnv'), subflow.id, { group_id: group.id }),
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};

    const c1out = getSubflowCodeOutput(output);
    expect(c1out.hasVar).toBe(false);
    expect(c1out.value).toBeNull();
  });

  // ── Precedence: flow vars vs input __env layer ────────────────────
  // execution.ts seeds sandboxEnv from __env and then overwrites with the
  // flow's own envVars — the flow level wins in the subflow child too.

  test('flow env var overrides the input env layer in the subflow child', async ({ request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: makeSubflow(uniqueFlowName('Subflow-Precedence'), 'return { value: process.env.PRE_VAR || null };'),
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    cleanupFlowIds.push(subflow.id);

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: makeParent(uniqueFlowName('Parent-Precedence'), subflow.id, {
        envVars: [{ name: 'PRE_VAR', value: 'flow-wins', type: 'static' }],
      }),
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    cleanupFlowIds.push(parent.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(parent.id, { message: 'test', __env: { PRE_VAR: 'input-base' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};

    const c1out = getSubflowCodeOutput(output);
    expect(c1out.value).toBe('flow-wins');
  });

  // ── Precedence: app-level vars never reach runtime ────────────────
  // Even though an app-level var with the same name exists, the child only
  // sees the flow-scoped value; a pure app-level var is absent entirely.

  test('app-level env vars are not injected — flow-scoped value wins in the subflow child', async ({ request }) => {
    const putRes = await request.put(`${API_URL}/env-vars`, {
      data: {
        envVars: [
          { name: 'APP_SHADOW', value: 'app-value', type: 'static' },
          { name: 'APP_ONLY_VAR', value: 'app-only-value', type: 'static' },
        ],
      },
    });
    expect(putRes.ok()).toBe(true);
    try {
      const subflowRes = await request.post(`${API_URL}/flows`, {
        data: makeSubflow(uniqueFlowName('Subflow-AppEnv'), 'return { shadow: process.env.APP_SHADOW || null, appOnly: process.env.APP_ONLY_VAR || null };'),
      });
      expect(subflowRes.ok()).toBe(true);
      const subflow = await subflowRes.json();
      cleanupFlowIds.push(subflow.id);

      const parentRes = await request.post(`${API_URL}/flows`, {
        data: makeParent(uniqueFlowName('Parent-AppEnv'), subflow.id, {
          envVars: [{ name: 'APP_SHADOW', value: 'flow-value', type: 'static' }],
        }),
      });
      expect(parentRes.ok()).toBe(true);
      const parent = await parentRes.json();
      cleanupFlowIds.push(parent.id);

      const { debugExecute } = await import('./helpers/stream');
      const events = await debugExecute(parent.id, { message: 'test' }, cookie);

      const completed = events.find(e => e.type === 'execution.completed');
      expect(completed).toBeDefined();
      const output = completed?.data?.output || {};

      const c1out = getSubflowCodeOutput(output);
      // Flow-scoped var wins over the same-named app-level var
      expect(c1out.shadow).toBe('flow-value');
      // A purely app-level var never reaches the sandbox
      expect(c1out.appOnly).toBeNull();
    } finally {
      // Restore the app env var bucket (remove the vars this test created)
      const res = await request.get(`${API_URL}/env-vars`);
      if (res.ok()) {
        const vars = await res.json();
        if (Array.isArray(vars)) {
          const remaining = vars.filter((v: any) => v.name !== 'APP_SHADOW' && v.name !== 'APP_ONLY_VAR');
          await request.put(`${API_URL}/env-vars`, { data: { envVars: remaining } });
        }
      }
    }
  });
});

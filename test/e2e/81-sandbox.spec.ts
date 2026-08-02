import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

// Local helpers (spec-scoped — do not put in shared helpers)
function makeFlow(name: string, nodes: any[], edges: any[]) {
  return { name, nodes, edges };
}

function codeFlow(name: string, code: string, extraConfig: Record<string, unknown> = {}) {
  return makeFlow(name, [
    { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
    { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Probe', type: 'code', config: { code, ...extraConfig } } },
    { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Probe.result'] } } },
  ], [
    { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
    { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  ]);
}

function llmToolFlow(name: string, systemPrompt: string) {
  return makeFlow(name, [
    { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
    { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: '', model: 'mock-gpt-4', systemPrompt, temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
    { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Assistant.content'] } } },
  ], [
    { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
    { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  ]);
}

async function createAndRunFlow(request: any, flow: any, input: Record<string, unknown> = {}) {
  const flowRes = await request.post(`${API_URL}/flows`, { data: flow });
  expect(flowRes.ok()).toBe(true);
  const created = await flowRes.json();
  const { debugExecute } = await import('./helpers/stream');
  const events = await debugExecute(created.id, input, cookie);
  const completed = events.find(e => e.type === 'execution.completed');
  expect(completed).toBeDefined();
  return { flow: created, events, output: completed?.data?.output || {} };
}

test.describe('Sandboxed tool execution', () => {
  const cleanupFlowIds: string[] = [];
  const cleanupGroupIds: string[] = [];
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM Sandbox', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupFlowIds) { await deleteFlow(request, id).catch(() => {}); }
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    cleanupFlowIds.length = cleanupGroupIds.length = 0;
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── App env vars CRUD via API ───────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('PUT /api/env-vars sets app-level env vars', async ({ request }) => {
    const envVars = [
      { name: 'GREETING', value: 'Hello World', type: 'static' },
      { name: 'DB_HOST', value: 'localhost', type: 'static' },
    ];
    const res = await request.put(`${API_URL}/env-vars`, { data: { envVars } });
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'GREETING', value: 'Hello World' }),
    ]));
  });

  test('GET /api/env-vars returns stored env vars', async ({ request }) => {
    const envVars = [
      { name: 'GREETING', value: 'Hello World', type: 'static' },
      { name: 'DB_HOST', value: 'localhost', type: 'static' },
    ];
    await request.put(`${API_URL}/env-vars`, { data: { envVars } });

    const res = await request.get(`${API_URL}/env-vars`);
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    const greeting = stored.find((v: any) => v.name === 'GREETING');
    expect(greeting).toBeDefined();
    expect(greeting.value).toBe('Hello World');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Group env vars CRUD via API ─────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('PUT /api/env-vars/groups/:groupId sets group env vars', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `Sandbox-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const envVars = [
      { name: 'GROUP_SECRET', value: 'group-val', type: 'static' },
    ];
    const res = await request.put(`${API_URL}/env-vars/groups/${group.id}`, { data: { envVars } });
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0].name).toBe('GROUP_SECRET');
  });

  test('GET /api/env-vars/groups/:groupId returns group env vars', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `Sandbox-Group-Get-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const envVars = [{ name: 'GROUP_VAR', value: 'group-value', type: 'static' }];
    await request.put(`${API_URL}/env-vars/groups/${group.id}`, { data: { envVars } });

    const res = await request.get(`${API_URL}/env-vars/groups/${group.id}`);
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0].name).toBe('GROUP_VAR');
    expect(stored[0].value).toBe('group-value');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Flow env vars saved via flow update ─────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('flow env vars can be set via flow update and are returned', async ({ request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('Sandbox-Flow-Env') });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const envVars = [
      { name: 'FLOW_VAR', value: 'flow-value', type: 'static' },
    ];

    const updateRes = await request.put(`${API_URL}/flows/${flow.id}`, { data: { envVars } });
    expect(updateRes.ok()).toBe(true);

    const updated = await updateRes.json();
    expect(updated.envVars || updated.env_vars).toBeDefined();
    const returned = updated.envVars || updated.env_vars || [];
    expect(returned[0].name).toBe('FLOW_VAR');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Env vars injected during execution ──────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('{{env.VAR}} resolves in LLM system prompt during execution', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Sandbox-Env-Resolve'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe greeting is: {{env.GREETING}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Assistant.content'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
          { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    // Sandbox env comes only from the flow's own env_vars configuration —
    // client-supplied __env is stripped at the API boundary.
    const envUpdateRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: { envVars: [{ name: 'GREETING', value: 'Hello from env!', type: 'static' }] },
    });
    if (!envUpdateRes.ok()) {
      test.skip(true, 'Flow env_vars column not yet available');
      return;
    }

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('Hello from env!');
    expect(outputStr).not.toContain('{{env.GREETING}}');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Bash tool via MOCK_TOOL_CALL ────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('bash tool executes via MOCK_TOOL_CALL and returns output', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Sandbox-Bash'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          {
            id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
            data: {
              label: 'Assistant', type: 'llm-agent',
              config: {
                endpointId: mockEndpointId,
                model: 'mock-gpt-4',
                systemPrompt: 'ECHO_SYSTEM_PROMPT\nUse the bash tool. MOCK_TOOL_CALL: bash {"command":"echo \'bash tool works\'","timeout":10000}',
                temperature: 0.7, maxTokens: 1024, responseFormat: 'text',
              },
            },
          },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Assistant.content'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
          { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'run bash' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.status).not.toBe('failed');

    // The bash tool result should be in the LLM step output
    const llmStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'l1');
    expect(llmStep).toBeDefined();
    const stepOutput = llmStep!.data?.output || {};
    const content = stepOutput.content || stepOutput.result || JSON.stringify(stepOutput);
    expect(String(content)).toContain('bash tool works');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Code node with env var access ───────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('code node reads env vars from sandbox', async ({ request }) => {
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Sandbox-Code-Env'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Reader', type: 'code', config: { code: 'return { value: process.env.MY_VAR || "not-set" };' } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['reader.value'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
          { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    // Sandbox env comes only from the flow's own env_vars configuration
    const envUpdateRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: { envVars: [{ name: 'MY_VAR', value: 'code-node-value', type: 'static' }] },
    });
    if (!envUpdateRes.ok()) {
      test.skip(true, 'Flow env_vars column not yet available');
      return;
    }

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();

    // Code node output is stored under its slugified label or node ID
    const c1out = output?.c1 || output?.reader || {};
    expect(c1out.value).toBe('code-node-value');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Env var sanitization — blocked vars stripped ────────────
  // ═══════════════════════════════════════════════════════════════

  test('blocked env vars like DATABASE_URL are stripped from sandbox', async ({ request }) => {
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Sandbox-Sanitize'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Inspector', type: 'code', config: { code: `const keys = Object.keys(process.env).sort();\nreturn {\n  hasDatabaseUrl: "DATABASE_URL" in process.env,\n  hasMySafeVar: "MY_SAFE_VAR" in process.env,\n  mySafeVar: process.env.MY_SAFE_VAR || null,\n  allKeys: keys.filter(k => k.startsWith("MY_") || k.startsWith("DB_") || k === "DATABASE_URL")\n};` } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['inspector.hasDatabaseUrl', 'inspector.hasMySafeVar', 'inspector.mySafeVar'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
          { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    // Sanitization is applied to the flow's own env_vars (client-supplied
    // __env is stripped at the API boundary).
    const envUpdateRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: {
        envVars: [
          { name: 'DATABASE_URL', value: 'should-not-leak', type: 'static' },
          { name: 'MY_SAFE_VAR', value: 'ok', type: 'static' },
        ],
      },
    });
    if (!envUpdateRes.ok()) {
      test.skip(true, 'Flow env_vars column not yet available');
      return;
    }

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, {
      message: 'test',
    }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();

    const c1out = output?.c1 || output?.inspector || {};
    // DATABASE_URL should be stripped by sanitizeEnvVars
    expect(c1out.hasDatabaseUrl).toBe(false);
    // MY_SAFE_VAR matches the safe pattern and is not blocked
    expect(c1out.hasMySafeVar).toBe(true);
    expect(c1out.mySafeVar).toBe('ok');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Read-only filesystem enforcement ───────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('sandbox filesystem is read-only outside HOME', async ({ request }) => {
    const code = [
      'const results = {};',
      'try { require("fs").writeFileSync("/usr/test-write", "x"); results.usrWritable = true; } catch (e) { results.usrWritable = false; }',
      'try { require("fs").writeFileSync("/etc/test-write", "x"); results.etcWritable = true; } catch (e) { results.etcWritable = false; }',
      'try { require("fs").writeFileSync("/bin/test-write", "x"); results.binWritable = true; } catch (e) { results.binWritable = false; }',
      'try { require("fs").writeFileSync(process.env.HOME + "/test-write", "x"); results.homeWritable = true; } catch (e) { results.homeWritable = false; }',
      'return results;',
    ].join('\n');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Sandbox-Readonly'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Checker', type: 'code', config: { code } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['checker.usrWritable', 'checker.etcWritable', 'checker.binWritable', 'checker.homeWritable'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
          { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();

    const c1out = output?.c1 || output?.checker || {};
    expect(c1out.usrWritable).toBe(false);
    expect(c1out.etcWritable).toBe(false);
    expect(c1out.binWritable).toBe(false);
    expect(c1out.homeWritable).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Network isolation (documented guarantee) ─────────────────
  // ═══════════════════════════════════════════════════════════════
  // The sidecar sandbox uses Landlock, which restricts the FILESYSTEM
  // only (read-only /usr,/bin,/lib,/etc; writable $HOME). There is NO
  // network namespace / seccomp filter: outbound connections are
  // permitted. This test pins the actual guarantee so a future
  // hardening change (e.g. blocking egress) is caught explicitly.

  test('sandbox does not block outbound network egress — internal service reachable (filesystem-only isolation)', async ({ request }) => {
    const code = [
      'const cp = require("child_process");',
      'const out = { reachable: false };',
      'try {',
      '  const r = cp.execSync("curl -s -m 8 -o /dev/null -w \\"%{http_code}\\" http://mock-llm-e2e:3002/health", { encoding: "utf-8", timeout: 10000 });',
      '  out.httpCode = parseInt(r.trim());',
      '  out.reachable = out.httpCode === 200;',
      '} catch (e) { out.error = String(e.message).slice(0, 300); }',
      'return out;',
    ].join('\n');
    const { flow, output } = await createAndRunFlow(request, codeFlow(uniqueFlowName('Sandbox-Network'), code));
    cleanupFlowIds.push(flow.id);

    const c1out = output?.c1 || output?.probe || {};
    expect(c1out.error).toBeUndefined();
    expect(c1out.reachable).toBe(true);
    expect(c1out.httpCode).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Time / resource limits ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════
  // The sidecar kills the process group after `timeout` ms
  // (default 30s, per-exec max 5min). A runaway code node must NOT
  // hang the whole execution — it is SIGKILLed and the node FAILS.

  test('code node infinite loop is terminated by the sandbox timeout — execution fails with the kill error', async ({ request }) => {
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: codeFlow(uniqueFlowName('Sandbox-Infinite-Loop'), 'while (true) {}', { timeout: 3000 }),
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('Code node execution failed with exit code -1');

    const stepFailed = events.find(e => e.type === 'step.failed' && e.data?.nodeId === 'c1');
    expect(stepFailed).toBeDefined();
    expect(stepFailed!.data?.error).toContain('Code node execution failed');
  });

  test('code node memory exhaustion is contained — execution fails without hanging', async ({ request }) => {
    const code = [
      'const a = [];',
      'while (true) { a.push(new Array(1048576).fill(0)); }',
    ].join('\n');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: codeFlow(uniqueFlowName('Sandbox-OOM'), code, { timeout: 8000 }),
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    // Node aborted (heap exhausted) or was killed by the sandbox — either way the
    // non-zero exit code fails the code node instead of silently producing no output
    expect(failed!.data?.error).toContain('Code node execution failed');

    const stepFailed = events.find(e => e.type === 'step.failed' && e.data?.nodeId === 'c1');
    expect(stepFailed).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Code node exceptions ────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════
  // A throwing code node exits non-zero; the sandbox error must fail the
  // execution with the original exception surfaced — never "(no output)".

  test('code node exception fails the execution with the error surfaced', async ({ request }) => {
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: codeFlow(uniqueFlowName('Sandbox-Code-Throw'), 'throw new Error("boom from code node");'),
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeUndefined();

    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('boom from code node');

    const stepFailed = events.find(e => e.type === 'step.failed' && e.data?.nodeId === 'c1');
    expect(stepFailed).toBeDefined();
    expect(stepFailed!.data?.error).toContain('boom from code node');
  });

  test('bash tool command exceeding the sandbox timeout is killed (SIGKILL — no exit code)', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const flow = llmToolFlow(uniqueFlowName('Sandbox-Bash-Timeout'), `ECHO_SYSTEM_PROMPT\nUse bash. MOCK_TOOL_CALL: bash {"command":"sleep 60","timeout":3000}`);
    (flow.nodes[1].data.config as any).endpointId = mockEndpointId;
    const flowRes = await request.post(`${API_URL}/flows`, { data: flow });
    expect(flowRes.ok()).toBe(true);
    const created = await flowRes.json();
    cleanupFlowIds.push(created.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(created.id, { message: 'run' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.status).not.toBe('failed');

    const llmStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'l1');
    expect(llmStep).toBeDefined();
    const toolCalls = llmStep!.data?.output?.toolCalls || [];
    const bashCall = toolCalls.find((t: any) => t.name === 'bash');
    expect(bashCall).toBeDefined();
    const result = String(bashCall.result);
    // Sidecar SIGKILLs the process group after the timeout. Signal-killed
    // processes carry no exit code, so the sidecar reports -1 — the command
    // must NOT have run to completion (which would be "Exit code: 0").
    expect(result).toContain('Exit code: -1');
    expect(result).not.toContain('Exit code: 0');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Env var sanitization for the bash tool ──────────────────
  // ═══════════════════════════════════════════════════════════════
  // executeBash() runs the same sanitizeEnvVars() filter as code
  // nodes: blocked vars (DATABASE_URL, *SECRET*, *TOKEN*, ...) are
  // stripped from the bash environment too.

  test('bash tool env is sanitized — blocked vars stripped, safe vars passed', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const sysPrompt = 'ECHO_SYSTEM_PROMPT\nUse bash. MOCK_TOOL_CALL: bash {"command":"echo \\"DB=[$DATABASE_URL] SAFE=[$MY_SAFE_VAR]\\"","timeout":10000}';
    const flow = llmToolFlow(uniqueFlowName('Sandbox-Bash-Sanitize'), sysPrompt);
    (flow.nodes[1].data.config as any).endpointId = mockEndpointId;
    const flowRes = await request.post(`${API_URL}/flows`, { data: flow });
    expect(flowRes.ok()).toBe(true);
    const created = await flowRes.json();
    cleanupFlowIds.push(created.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(created.id, { message: 'run', __env: { DATABASE_URL: 'leak-me-not', MY_SAFE_VAR: 'safe-value' } }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.status).not.toBe('failed');

    const llmStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'l1');
    expect(llmStep).toBeDefined();
    const toolCalls = llmStep!.data?.output?.toolCalls || [];
    const bashCall = toolCalls.find((t: any) => t.name === 'bash');
    expect(bashCall).toBeDefined();
    const result = String(bashCall.result);
    expect(result).toContain('SAFE=[safe-value]');
    expect(result).toContain('DB=[]');
    expect(result).not.toContain('leak-me-not');
  });
});

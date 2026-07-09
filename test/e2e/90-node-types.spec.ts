import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('All node types', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (res.ok()) { const ep = await res.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  const cookie = getAuthCookie() || undefined;

  test('code node transforms input', async ({ request }) => {
    const name = uniqueFlowName('CodeTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Transform', type: 'code', config: { code: 'return { result: input.message.toUpperCase() };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['transform.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'hello world' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // Code node output is stored under its node ID
    const output = completed!.data?.output;
    expect(output).toBeDefined();
    expect(output.c1?.result).toBe('HELLO WORLD');
    await deleteFlow(request, flow.id);
  });

  test('branch node routes based on condition', async ({ request }) => {
    const name = uniqueFlowName('BranchTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'b1', type: 'condition', position: { x: 300, y: 0 }, data: { label: 'Check', type: 'condition', config: { condition: 'input.message === "yes"' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'TruePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'FalsePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'b1', targetHandle: 'input-0' },
        { id: 'e2', source: 'b1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'b1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'yes' }, cookie);
    const branchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'b1');
    expect(branchStep).toBeDefined();
    expect(branchStep!.data?.output?.verdict).toBe(true);
    expect(branchStep!.data?.output?.label).toBe('true');
    await deleteFlow(request, flow.id);
  });

  test('condition false label routes correctly', async ({ request }) => {
    const name = uniqueFlowName('CondFalseTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'b1', type: 'condition', position: { x: 300, y: 0 }, data: { label: 'Check', type: 'condition', config: { condition: 'input.message === "no"' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'TruePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'FalsePath', type: 'output', config: { inputFields: ['check.verdict'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'b1', targetHandle: 'input-0' },
        { id: 'e2', source: 'b1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'b1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    // Input "no" — condition true, verdict=true, label='true', handle-1 routes to o2
    const events = await debugExecute(flow.id, { message: 'no' }, cookie);
    const branchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'b1');
    expect(branchStep).toBeDefined();
    expect(branchStep!.data?.output?.verdict).toBe(true);
    // Now test false path — "yes" !== "no" → "false" matches label 'false', handle-1 routes to o2
    const events2 = await debugExecute(flow.id, { message: 'yes' }, cookie);
    const branchStep2 = events2.find(e => e.type === 'step.completed' && e.data?.nodeId === 'b1');
    expect(branchStep2).toBeDefined();
    expect(branchStep2!.data?.output?.verdict).toBe(true);
    expect(branchStep2!.data?.output?.label).toBe('false');
    await deleteFlow(request, flow.id);
  });

  test('switch node routes to matching case', async ({ request }) => {
    const name = uniqueFlowName('SwitchMatchTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 's1', type: 'switch', position: { x: 300, y: 0 }, data: { label: 'Router', type: 'switch', config: { fieldPath: 'trigger.status', cases: [{ value: 'active', label: 'active' }, { value: 'inactive', label: 'inactive' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'Active', type: 'output', config: { inputFields: ['router.caseValue'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'Inactive', type: 'output', config: { inputFields: ['router.caseValue'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' },
        { id: 'e2', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 's1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { status: 'active' }, cookie);
    const switchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 's1');
    expect(switchStep).toBeDefined();
    expect(switchStep!.data?.output?.caseIndex).toBe(0);
    expect(switchStep!.data?.output?.caseValue).toBe('active');
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  test('switch node routes to default path when no case matches', async ({ request }) => {
    const name = uniqueFlowName('SwitchDefaultTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 's1', type: 'switch', position: { x: 300, y: 0 }, data: { label: 'Router', type: 'switch', config: { fieldPath: 'trigger.status', cases: [{ value: 'active', label: 'active' }], defaultPath: 'other' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'Active', type: 'output', config: { inputFields: ['router.caseValue'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'Default', type: 'output', config: { inputFields: ['router.caseValue'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' },
        { id: 'e2', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 's1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { status: 'unknown' }, cookie);
    const switchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 's1');
    expect(switchStep).toBeDefined();
    expect(switchStep!.data?.output?.caseIndex).toBe(1);
    expect(switchStep!.data?.output?.caseValue).toBe('other');
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  test('switch node fails when no match and no default path', async ({ request }) => {
    const name = uniqueFlowName('SwitchFailTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 's1', type: 'switch', position: { x: 300, y: 0 }, data: { label: 'Router', type: 'switch', config: { fieldPath: 'trigger.status', cases: [{ value: 'active', label: 'active' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['router.caseValue'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' },
        { id: 'e2', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { status: 'unknown' }, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('does not match any case');
    await deleteFlow(request, flow.id);
  });

  test('switch node works with code node upstream', async ({ request }) => {
    const name = uniqueFlowName('SwitchCodeTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 200, y: 0 }, data: { label: 'Prep', type: 'code', config: { code: 'const level = input.score > 50 ? "high" : "low"; return { level, raw: input.score };' } } },
        { id: 's1', type: 'switch', position: { x: 400, y: 0 }, data: { label: 'Router', type: 'switch', config: { fieldPath: 'prep.level', cases: [{ value: 'high', label: 'high' }, { value: 'low', label: 'low' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: -100 }, data: { label: 'High', type: 'output', config: { inputFields: ['router.caseValue', 'prep.raw'] } } },
        { id: 'o2', type: 'output', position: { x: 600, y: 100 }, data: { label: 'Low', type: 'output', config: { inputFields: ['router.caseValue', 'prep.raw'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' },
        { id: 'e3', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e4', source: 's1', sourceHandle: 'output-1', target: 'o2', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { score: 75 }, cookie);
    const switchStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 's1');
    expect(switchStep).toBeDefined();
    expect(switchStep!.data?.output?.caseValue).toBe('high');
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  test('switch node fails when fieldPath is empty', async ({ request }) => {
    const name = uniqueFlowName('SwitchNoFieldTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 's1', type: 'switch', position: { x: 300, y: 0 }, data: { label: 'Router', type: 'switch', config: { fieldPath: '', cases: [{ value: 'active', label: 'active' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['router.caseValue'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 's1', targetHandle: 'input-0' },
        { id: 'e2', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { status: 'active' }, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('no fieldPath configured');
    await deleteFlow(request, flow.id);
  });

  test('llm agent returns mock text response', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
    const name = uniqueFlowName('LLMTextTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'LLM Agent', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'You are helpful. MOCK_RESPONSE: "Hello from mock LLM!"', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // The LLM agent output is stored under its node ID 'l1'
    expect(completed!.data?.output?.l1?.content).toContain('Hello from mock LLM');
    await deleteFlow(request, flow.id);
  });

  test('llm agent returns structured json output', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
    const name = uniqueFlowName('LLMJsonTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: 'You extract data. MOCK_RESPONSE: {"name":"E2E","score":95}',
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'json_object',
              outputSchema: '{"type":"object","properties":{"name":{"type":"string"},"score":{"type":"number"}},"required":["name","score"]}',
            },
          },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'extract data' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // With json_object, the content should contain the structured JSON
    const output = completed!.data?.output;
    const content = output?.l1?.content || '';
    expect(content).toContain('"name"');
    expect(content).toContain('"E2E"');
    await deleteFlow(request, flow.id);
  });

  test('parallel node runs sub-nodes concurrently', async ({ request }) => {
    const name = uniqueFlowName('ParallelTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'p1', type: 'parallel', position: { x: 300, y: 0 }, data: { label: 'Parallel Agents', type: 'parallel', config: { subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'SubA', type: 'code', config: { code: 'return { result: input.message + \" A\" };' } } }, { id: 's2', type: 'code', position: { x: 0, y: 100 }, data: { label: 'SubB', type: 'code', config: { code: 'return { result: input.message + \" B\" };' } } }], subEdges: [] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['parallel_agents.merged'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'p1', targetHandle: 'input-0' },
        { id: 'e2', source: 'p1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'hello' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed!.data?.output;
    expect(output).toBeDefined();
    // Parallel node output is stored under its slugified node label
    expect(output.p1?.SubA?.result).toBe('hello A');
    expect(output.p1?.SubB?.result).toBe('hello B');
    await deleteFlow(request, flow.id);
  });

  // ── New nodes ────────────────────────────────────────────────

  test('map node transforms fields', async ({ request }) => {
    const name = uniqueFlowName('MapTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'm1', type: 'map', position: { x: 300, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'greeting', type: 'string', value: 't1.message' }], mode: 'replace' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['mapper.greeting'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e2', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'world' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.m1?.greeting).toBe('world');
    await deleteFlow(request, flow.id);
  });

  test('map node merge mode preserves upstream fields', async ({ request }) => {
    const name = uniqueFlowName('MapMergeTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Prep', type: 'code', config: { code: 'return { score: 42 };' } } },
        { id: 'm1', type: 'map', position: { x: 600, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'label', type: 'string', value: 't1.message' }], mode: 'merge' } } },
        { id: 'o1', type: 'output', position: { x: 900, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['mapper.label', 'prep.score'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e3', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'hello' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.m1?.label).toBe('hello');
    await deleteFlow(request, flow.id);
  });

  test('loop node iterates over array items', async ({ request }) => {
    const name = uniqueFlowName('LoopTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'loop', position: { x: 300, y: 0 }, data: { label: 'Looper', type: 'loop', config: { itemsField: 'trigger.numbers', itemVariable: 'num', subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'Double', type: 'code', config: { code: 'return { doubled: input.num * 2, original: input.num };' } } }], subEdges: [], collectResults: true } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['looper.results', 'looper.count'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { numbers: [1, 2, 3] }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.l1?.count).toBe(3);
    expect(completed!.data?.output?.l1?.results).toHaveLength(3);
    expect(completed!.data?.output?.l1?.results[0]?.s1?.doubled).toBe(2);
    expect(completed!.data?.output?.l1?.results[2]?.s1?.doubled).toBe(6);
    await deleteFlow(request, flow.id);
  });

  test('http node fetches from an endpoint', async ({ request }) => {
    const name = uniqueFlowName('HttpTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'http', position: { x: 300, y: 0 }, data: { label: 'Fetcher', type: 'http', config: { method: 'GET', url: 'http://backend-e2e:3001/api/health', timeout: 5000 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['fetcher.status', 'fetcher.ok'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.h1?.status).toBe(200);
    expect(completed!.data?.output?.h1?.ok).toBe(true);
    await deleteFlow(request, flow.id);
  });

  test('delay node with zero seconds passes through', async ({ request }) => {
    const name = uniqueFlowName('DelayTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'Pause', type: 'delay', config: { type: 'fixed', seconds: 0 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
        { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  test('ai-action node calls LLM and returns response', async ({ request }) => {
    // Create a mock LLM endpoint for the ai-action node
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E AI Action Mock', providerType: 'openai', baseUrl: `http://mock-llm-e2e:3002/v1`, apiKey: 'mock-key', defaultModel: 'mock-gpt-4o', models: ['mock-gpt-4o'] },
    });
    if (!llmRes.ok()) return;
    const ep = await llmRes.json();

    const name = uniqueFlowName('AIActionTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'a1', type: 'ai-action', position: { x: 300, y: 0 }, data: { label: 'AI', type: 'ai-action', config: { endpointId: ep.id, model: 'mock-gpt-4o', prompt: 'MOCK_RESPONSE: "Hello from AI Action"' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['ai.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
        { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.a1?.content).toBeDefined();
    await request.delete(`${API_URL}/llm-endpoints/${ep.id}`);
    await deleteFlow(request, flow.id);
  });

  test('note node passes through without error', async ({ request }) => {
    const name = uniqueFlowName('NoteTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'n1', type: 'note', position: { x: 300, y: 0 }, data: { label: 'Note', type: 'note', config: { content: 'important note' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'n1', targetHandle: 'input-0' },
        { id: 'e2', source: 'n1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.n1?.note).toBe(true);
    await deleteFlow(request, flow.id);
  });

  // ── Map: edge cases ─────────────────────────────────────────

  test('map node resolves nested field paths', async ({ request }) => {
    const name = uniqueFlowName('MapNestedTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Nest', type: 'code', config: { code: 'return { level: { inner: 42, label: "deep" } };' } } },
        { id: 'm1', type: 'map', position: { x: 600, y: 0 }, data: { label: 'M', type: 'map', config: { fields: [{ name: 'result', type: 'string', value: 'nest.level.inner' }, { name: 'tag', type: 'string', value: 'nest.level.label' }], mode: 'replace' } } },
        { id: 'o1', type: 'output', position: { x: 900, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e3', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.m1?.result).toBe(42);
    expect(completed!.data?.output?.m1?.tag).toBe('deep');
    await deleteFlow(request, flow.id);
  });

  test('map node stores null for missing upstream path', async ({ request }) => {
    const name = uniqueFlowName('MapNullTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'm1', type: 'map', position: { x: 300, y: 0 }, data: { label: 'M', type: 'map', config: { fields: [{ name: 'x', type: 'string', value: 't1.nonexistent' }], mode: 'replace' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e2', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.m1?.x).toBeNull();
    await deleteFlow(request, flow.id);
  });

  // ── Loop: edge cases ────────────────────────────────────────

  test('loop node with collectResults=false returns only count', async ({ request }) => {
    const name = uniqueFlowName('LoopNoCollect');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'loop', position: { x: 300, y: 0 }, data: { label: 'L', type: 'loop', config: { itemsField: 't1.items', itemVariable: 'x', subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { val: input.x };' } } }], subEdges: [], collectResults: false } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { items: [10, 20, 30] }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.l1?.count).toBe(3);
    expect(completed!.data?.output?.l1?.results).toBeUndefined();
    await deleteFlow(request, flow.id);
  });

  test('loop node fails when itemsField is not an array', async ({ request }) => {
    const name = uniqueFlowName('LoopFailTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'loop', position: { x: 300, y: 0 }, data: { label: 'L', type: 'loop', config: { itemsField: 't1.message', itemVariable: 'x', subNodes: [], subEdges: [] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'not-an-array' }, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('not an array');
    await deleteFlow(request, flow.id);
  });

  test('loop node with custom itemVariable name', async ({ request }) => {
    const name = uniqueFlowName('LoopCustomVar');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'l1', type: 'loop', position: { x: 300, y: 0 }, data: { label: 'L', type: 'loop', config: { itemsField: 't1.nums', itemVariable: 'val', subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'D', type: 'code', config: { code: 'return { squared: input.val * input.val };' } } }], subEdges: [], collectResults: true } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { nums: [3, 4] }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.l1?.count).toBe(2);
    expect(completed!.data?.output?.l1?.results[0]?.s1?.squared).toBe(9);
    expect(completed!.data?.output?.l1?.results[1]?.s1?.squared).toBe(16);
    await deleteFlow(request, flow.id);
  });

  // ── HTTP: edge cases ────────────────────────────────────────

  test('http node POST with JSON body', async ({ request }) => {
    const name = uniqueFlowName('HttpPostTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'http', position: { x: 300, y: 0 }, data: { label: 'H', type: 'http', config: { method: 'POST', url: 'http://backend-e2e:3001/api/health', body: '{"test":true}', headers: '{"Content-Type":"application/json"}', timeout: 5000 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.h1?.status).toBe(200);
    expect(completed!.data?.output?.h1?.ok).toBe(true);
    await deleteFlow(request, flow.id);
  });

  test('http node returns error for unreachable host', async ({ request }) => {
    const name = uniqueFlowName('HttpErrTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'http', position: { x: 300, y: 0 }, data: { label: 'H', type: 'http', config: { method: 'GET', url: 'http://nonexistent.invalid/', timeout: 1000 } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  // ── Delay: edge cases ───────────────────────────────────────

  test('delay node with ISO 8601 duration', async ({ request }) => {
    const name = uniqueFlowName('DelayDurTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'D', type: 'delay', config: { type: 'duration', duration: 'PT0S' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
        { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  test('delay node with past timestamp passes through', async ({ request }) => {
    const name = uniqueFlowName('DelayTsTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'D', type: 'delay', config: { type: 'timestamp', timestamp: '2020-01-01T00:00:00Z' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
        { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    await deleteFlow(request, flow.id);
  });

  // ── AI Action: error cases ──────────────────────────────────

  test('ai-action node fails when endpointId is missing', async ({ request }) => {
    const name = uniqueFlowName('AIActionNoEp');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'a1', type: 'ai-action', position: { x: 300, y: 0 }, data: { label: 'AI', type: 'ai-action', config: { endpointId: '', model: 'mock', prompt: 'test' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
        { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('endpointId is required');
    await deleteFlow(request, flow.id);
  });

  test('ai-action node fails when prompt is missing', async ({ request }) => {
    const name = uniqueFlowName('AIActionNoPrompt');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'a1', type: 'ai-action', position: { x: 300, y: 0 }, data: { label: 'AI', type: 'ai-action', config: { endpointId: 'ep-1', model: 'mock', prompt: '' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
        { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const failed = events.find(e => e.type === 'execution.failed');
    expect(failed).toBeDefined();
    expect(failed!.data?.error).toContain('prompt is required');
    await deleteFlow(request, flow.id);
  });

  // ── Multi-node advanced flow ─────────────────────────────────

  test('advanced: trigger → code → map → loop → output', async ({ request }) => {
    const name = uniqueFlowName('AdvMultiNode');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Prep', type: 'code', config: { code: 'const vals = [1, 2, 3]; return { numbers: vals.map(n => ({ original: n })) };' } } },
        { id: 'm1', type: 'map', position: { x: 500, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'transformed', type: 'object', value: 'prep.numbers' }], mode: 'replace' } } },
        { id: 'l1', type: 'loop', position: { x: 750, y: 0 }, data: { label: 'Looper', type: 'loop', config: { itemsField: 'mapper.transformed', itemVariable: 'item', subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'D', type: 'code', config: { code: 'return { result: input.item.original * 10 };' } } }], subEdges: [], collectResults: true } } },
        { id: 'o1', type: 'output', position: { x: 1000, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e3', source: 'm1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e4', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { message: 'start' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // Verify the full pipeline: code → map → loop
    expect(completed!.data?.output?.c1?.numbers).toHaveLength(3);
    expect(completed!.data?.output?.m1?.transformed).toHaveLength(3);
    expect(completed!.data?.output?.l1?.count).toBe(3);
    expect(completed!.data?.output?.l1?.results[0]?.s1?.result).toBe(10);
    expect(completed!.data?.output?.l1?.results[2]?.s1?.result).toBe(30);
    await deleteFlow(request, flow.id);
  });

  test('advanced: trigger → http → map → output', async ({ request }) => {
    const name = uniqueFlowName('AdvHttpMap');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'http', position: { x: 250, y: 0 }, data: { label: 'Fetcher', type: 'http', config: { method: 'GET', url: 'http://backend-e2e:3001/api/health', timeout: 5000 } } },
        { id: 'm1', type: 'map', position: { x: 500, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'httpStatus', type: 'number', value: 'fetcher.status' }, { name: 'healthy', type: 'boolean', value: 'fetcher.ok' }], mode: 'replace' } } },
        { id: 'o1', type: 'output', position: { x: 750, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
        { id: 'e3', source: 'm1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, {}, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.m1?.httpStatus).toBe(200);
    expect(completed!.data?.output?.m1?.healthy).toBe(true);
    await deleteFlow(request, flow.id);
  });
});

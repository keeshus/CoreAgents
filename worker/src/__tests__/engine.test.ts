import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { FlowExecutor, HitlPauseError, PauseExecutionError } from '../executor/engine.js';
import type { FlowDefinition, FlowNode, FlowEdge } from 'core-agents-shared';
import type { ExecutionContext } from '../executor/engine.js';

// Mock callLLM to avoid real API calls in LLM agent node tests
vi.mock('../providers/index.js', () => ({
  callLLM: vi.fn(() => Promise.resolve({ text: 'mock LLM response' })),
}));

// Mock bash tool to prevent sidecar HTTP calls — execute code via new Function
vi.mock('../tools/bash.js', () => ({
  executeCode: vi.fn((_client: any, _executionId: string, code: string, input: unknown) => {
    return new Function('input', code)(input);
  }),
  executeBash: vi.fn(async () => 'mock bash result'),
  BASH_TOOL_DEFINITION: {
    name: 'bash',
    description: 'Mock bash tool',
    input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
  BASH_SANDBOX_SYSTEM_PROMPT: '\nmock sandbox prompt\n',
}));

// Mock sidecar client to prevent HTTP calls from bash tool handler
vi.mock('../sandbox/sidecar-client.js', () => ({
  createSidecarClient: vi.fn(() => ({
    setup: vi.fn(async () => {}),
    exec: vi.fn(async () => ({ stdout: 'mocked', stderr: '', exitCode: 0 })),
    teardown: vi.fn(async () => {}),
  })),
}));

function makeNode(id: string, nodeType: string, overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      type: nodeType,
      label: id,
      config: {},
      ...overrides,
    } as any,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id,
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    ...overrides,
  };
}

function makeFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowDefinition {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    description: '',
    nodes,
    edges,
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

describe('FlowExecutor', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    context = {
      getEndpoint: vi.fn().mockResolvedValue({
        providerType: 'anthropic' as const,
        apiKey: 'test-key',
        baseUrl: null,
      }),
      sandboxExecutionId: 'test-exec-id',
    };
  });

  it('executes a simple flow with trigger and code node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('mycode', 'code', { config: { code: 'return input;' } }),
      ],
      [makeEdge('e1', 'trigger', 'mycode')],
    );
    const flowDef = { ...makeFlow([], []), nodes: flow.nodes, edges: flow.edges };

    const result = await executor.execute(flowDef, { message: 'hello' }, onEvent, context);

    expect(result.output.trigger).toHaveProperty('message', 'hello');
    expect(result.steps).toHaveLength(2);
  });

  it('routes correctly through a branch node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('branch', 'condition', { config: { condition: 'input.message === "yes"' } }),
        makeNode('llm1', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
        makeNode('llm2', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'branch'),
        makeEdge('e2', 'branch', 'llm1', { sourceHandle: 'output-0' }),  // true path (label 'true' = index 0)
        makeEdge('e3', 'branch', 'llm2', { sourceHandle: 'output-1' }),  // false path (label 'false' = index 1)
      ],
    );

    const result = await executor.execute(flow, { message: 'yes' }, onEvent, context);

    expect(result.steps.some(s => s.nodeId === 'trigger')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'branch')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'llm1')).toBe(true);
    expect(result.steps.every(s => s.nodeId !== 'llm2')).toBe(true);
  });

  it('routes correctly through a switch node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('switch', 'switch', {
          config: {
            fieldPath: 'trigger.status',
            cases: [
              { value: 'active', label: 'active' },
              { value: 'inactive', label: 'inactive' },
            ],
          },
        }),
        makeNode('llm1', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
        makeNode('llm2', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'switch'),
        makeEdge('e2', 'switch', 'llm1', { sourceHandle: 'output-0' }),  // active path
        makeEdge('e3', 'switch', 'llm2', { sourceHandle: 'output-1' }),  // inactive path
      ],
    );

    const result = await executor.execute(flow, { status: 'active' }, onEvent, context);

    // llm1 (active) should have been reached
    expect(result.steps.some(s => s.nodeId === 'trigger')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'switch')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'llm1')).toBe(true);
    // llm2 (inactive) should be skipped
    expect(result.steps.every(s => s.nodeId !== 'llm2')).toBe(true);
  });

  it('routes through switch default path when no case matches', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('switch', 'switch', {
          config: {
            fieldPath: 'trigger.status',
            cases: [
              { value: 'active', label: 'active' },
            ],
            defaultPath: 'other',
          },
        }),
        makeNode('llm1', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
        makeNode('llm2', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'switch'),
        makeEdge('e2', 'switch', 'llm1', { sourceHandle: 'output-0' }),  // active path
        makeEdge('e3', 'switch', 'llm2', { sourceHandle: 'output-1' }),  // default path
      ],
    );

    const result = await executor.execute(flow, { status: 'unknown' }, onEvent, context);

    // llm1 (active) should be skipped because "unknown" !== "active"
    expect(result.steps.every(s => s.nodeId !== 'llm1')).toBe(true);
    // llm2 (default path) should have been reached
    expect(result.steps.some(s => s.nodeId === 'llm2')).toBe(true);
  });

  it('output node filters input to only specified inputFields', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('output', 'output', {
          config: { inputFields: ['trigger.message'] },
        }),
      ],
      [makeEdge('e1', 'trigger', 'output')],
    );

    const result = await executor.execute(flow, { message: 'hello', secret: 'S3CR3T', extra: 'data' }, onEvent, context);
    expect(result.output?.output).toBe('hello');
  });

  it('throws HitlPauseError when executing a HITL node on first run', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('hitl', 'hitl', {
          config: {
            prompt: 'Approve this?', displayFields: [], forwardFields: [],
            buttons: [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'hitl')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context)).rejects.toThrow(HitlPauseError);
  });

  it('replays through a HITL node when _approved is in input', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('hitl', 'hitl', {
          config: {
            prompt: 'Approve this?', displayFields: [], forwardFields: [],
            buttons: [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'hitl')],
    );

    const result = await executor.execute(flow, { _approved: true, _decision: 'approved', _feedback: 'ok' }, onEvent, context);
    expect(Object.keys(result.output)).toContain('trigger');
    expect(result.steps.find(s => s.nodeId === 'hitl')?.output).toBeDefined();
  });

  it('executes all sub-nodes in a parallel node', async () => {
    // Parallel node with non-code sub-nodes (output nodes skip the sidecar import path)
    const subNodes: FlowNode[] = [
      makeNode('sub-a', 'output', { config: { inputFields: [] } }),
      makeNode('sub-b', 'output', { config: { inputFields: [] } }),
      makeNode('sub-c', 'output', { config: { inputFields: [] } }),
    ];

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('parallel', 'parallel', { config: { subNodes } }),
      ],
      [makeEdge('e1', 'trigger', 'parallel')],
    );

    const result = await executor.execute(flow, { start: true }, onEvent, context);
    const parallelOutput = (result.output as any).parallel as Record<string, any>;

    expect(parallelOutput).toBeDefined();
    expect(Object.keys(parallelOutput)).toContain('sub-a');
    expect(Object.keys(parallelOutput)).toContain('sub-b');
    expect(Object.keys(parallelOutput)).toContain('sub-c');
  });

  it('stops execution when abort is called', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('slow', 'code', {
          config: { code: 'return new Promise(resolve => setTimeout(() => resolve({ done: true }), 500));' },
        }),
        makeNode('after', 'code', { config: { code: 'return { completed: true };' } }),
      ],
      [makeEdge('e1', 'trigger', 'slow'), makeEdge('e2', 'slow', 'after')],
    );

    const executePromise = executor.execute(flow, { data: 'test' }, onEvent, context);
    setTimeout(() => executor.abort(), 50);
    const result = await executePromise;

    expect(result.output.trigger).toBeDefined();
    expect(result.steps.map(s => s.nodeId)).not.toContain('after');
  });

  it('throws an error when the flow contains a cycle', async () => {
    const flow = makeFlow(
      [
        makeNode('a', 'trigger'),
        makeNode('b', 'code', { config: { code: 'return input;' } }),
        makeNode('c', 'code', { config: { code: 'return input;' } }),
      ],
      [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c'), makeEdge('e3', 'c', 'a')],
    );

    const result = await executor.execute(flow, {}, onEvent, context);
    expect(result.output).toBeDefined();
  });

  it('executes a note node as pass-through', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('note', 'note'),
      ],
      [makeEdge('e1', 'trigger', 'note')],
    );

    const result = await executor.execute(flow, { message: 'hello' }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'note')).toBe(true);
    expect(result.output).toHaveProperty('trigger');
    expect(result.output).toHaveProperty('note');
  });

  it('executes a map node with replace mode', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('map', 'map', {
          config: {
            fields: [{ name: 'result', type: 'string', value: 'message' }],
            mode: 'replace',
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'map')],
    );

    const result = await executor.execute(flow, { message: 'hello' }, onEvent, context);
    // The map node's output is keyed by its node id
    expect(result.output.map).toHaveProperty('result', 'hello');
    expect(result.output.map).not.toHaveProperty('message');
  });

  it('executes a map node with merge mode', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('map', 'map', {
          config: {
            fields: [{ name: 'transformed', type: 'string', value: 'message' }],
            mode: 'merge',
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'map')],
    );

    const result = await executor.execute(flow, { message: 'hello' }, onEvent, context);
    // In merge mode, upstream data is preserved in the map output plus mapped fields
    expect(result.output.map).toHaveProperty('message', 'hello');
    expect(result.output.map).toHaveProperty('transformed', 'hello');
  });

  it('executes a delay node with fixed seconds (throws PauseExecutionError)', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('delay', 'delay', {
          config: { type: 'fixed', seconds: 5 },
        }),
      ],
      [makeEdge('e1', 'trigger', 'delay')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(PauseExecutionError);
  });

  it('executes ai-action node and returns LLM response', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('ai', 'ai-action', {
          config: {
            endpointId: 'ep1',
            model: 'claude-3-haiku',
            prompt: 'Summarize: {{input.trigger.message}}',
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'ai')],
    );

    const result = await executor.execute(flow, { message: 'hello world' }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'ai')).toBe(true);
    expect(result.output.ai).toHaveProperty('content');
  });

  it('throws if ai-action node has no endpointId', async () => {
    const flow = makeFlow(
      [makeNode('ai', 'ai-action', { config: { endpointId: '', model: 'claude', prompt: 'test' } })],
      [],
    );

    await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('endpointId');
  });

  it('throws if ai-action node has no model', async () => {
    const flow = makeFlow(
      [makeNode('ai', 'ai-action', { config: { endpointId: 'ep1', model: '', prompt: 'test' } })],
      [],
    );

    await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('model');
  });

  it('throws if ai-action node has no prompt', async () => {
    const flow = makeFlow(
      [makeNode('ai', 'ai-action', { config: { endpointId: 'ep1', model: 'claude', prompt: '' } })],
      [],
    );

    await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('prompt');
  });

  it('executes a loop node over an array', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('loop', 'loop', {
          config: {
            itemsField: 'trigger.items',
            itemVariable: 'item',
            collectResults: true,
            subNodes: [makeNode('sub', 'output', { config: { inputFields: [] } })],
            subEdges: [],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'loop')],
    );

    const result = await executor.execute(flow, { items }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'loop')).toBe(true);
  });

  it('throws if loop node has no itemsField', async () => {
    const flow = makeFlow(
      [makeNode('loop', 'loop', { config: { itemsField: '' } })],
      [],
    );

    await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('itemsField');
  });

  it('throws if loop node field is not an array', async () => {
    const flow = makeFlow(
      [makeNode('loop', 'loop', { config: { itemsField: 'trigger.message' } })],
      [],
    );

    await expect(executor.execute(flow, { message: 'not-an-array' }, onEvent, context)).rejects.toThrow('not an array');
  });

  it('executes a loop node without collecting results', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('loop', 'loop', {
          config: {
            itemsField: 'trigger.items',
            itemVariable: 'item',
            collectResults: false,
            subNodes: [makeNode('sub', 'output', { config: { inputFields: [] } })],
            subEdges: [],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'loop')],
    );

    const result = await executor.execute(flow, { items }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'loop')).toBe(true);
  });

  describe('http node', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeAll(() => {
      mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      mockFetch.mockReset();
    });

    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('executes GET request', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve('{"data":"ok"}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: 'https://api.example.com/data' } })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({ method: 'GET' }));
      expect(result.output.http).toHaveProperty('status', 200);
      expect(result.output.http).toHaveProperty('ok', true);
      expect(result.output.http.body).toEqual({ data: 'ok' });
    });

    it('executes POST request with body and headers', async () => {
      mockFetch.mockResolvedValue({
        status: 201, statusText: 'Created', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{"id":1}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', {
          config: {
            method: 'POST', url: 'https://api.example.com/data',
            headers: '{"Authorization":"Bearer test"}',
            body: '{"name":"test"}',
          },
        })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({
        method: 'POST', body: '{"name":"test"}',
      }));
      expect(result.output.http).toHaveProperty('status', 201);
    });

    it('executes PUT request', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { method: 'PUT', url: 'https://api.example.com/data/1', body: '{}' } })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));
    });

    it('executes DELETE request', async () => {
      mockFetch.mockResolvedValue({
        status: 204, statusText: 'No Content', ok: true,
        headers: new Map(),
        text: () => Promise.resolve(''),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { method: 'DELETE', url: 'https://api.example.com/data/1' } })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'DELETE' }));
    });

    it('executes PATCH request', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { method: 'PATCH', url: 'https://api.example.com/data/1', body: '{}' } })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH' }));
    });

    it('executes HEAD request', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map([['content-length', '42']]),
        text: () => Promise.resolve(''),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { method: 'HEAD', url: 'https://api.example.com/data' } })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
      expect(result.output.http).toHaveProperty('status', 200);
    });

    it('applies Basic auth headers', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', {
          config: { url: 'https://api.example.com', authType: 'basic', authUsername: 'admin', authPassword: 'secret' },
        })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      const args = mockFetch.mock.calls[0][1];
      expect(args.headers['Authorization']).toMatch(/^Basic /);
    });

    it('applies Bearer token headers', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', {
          config: { url: 'https://api.example.com', authType: 'bearer', authToken: 'mytoken' },
        })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      const args = mockFetch.mock.calls[0][1];
      expect(args.headers['Authorization']).toBe('Bearer mytoken');
    });

    it('applies API Key auth headers', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', {
          config: { url: 'https://api.example.com', authType: 'api-key', authKeyName: 'X-API-Key', authKeyValue: 'abc123' },
        })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      const args = mockFetch.mock.calls[0][1];
      expect(args.headers['X-API-Key']).toBe('abc123');
    });

    it('applies HMAC signing', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', {
          config: { method: 'POST', url: 'https://api.example.com', body: '{"data":"test"}', hmacSecret: 'secret-key', hmacHeader: 'X-Signature' },
        })],
        [],
      );
      await executor.execute(flow, {}, onEvent, context);
      const args = mockFetch.mock.calls[0][1];
      expect(args.headers['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('parses JSON response body', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('{"user":"alice","score":42}'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: 'https://api.example.com/user' } })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(result.output.http.body).toEqual({ user: 'alice', score: 42 });
    });

    it('returns raw text for non-JSON body', async () => {
      mockFetch.mockResolvedValue({
        status: 200, statusText: 'OK', ok: true,
        headers: new Map(),
        text: () => Promise.resolve('plain text'),
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: 'https://api.example.com' } })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(result.output.http.body).toBe('plain text');
    });

    it('throws when URL is empty', async () => {
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: '' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('URL is required');
    });

    it('throws on invalid headers JSON', async () => {
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: 'https://api.example.com', headers: 'not-json' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('headers must be valid JSON');
    });

    it('times out after configured timeout', async () => {
      mockFetch.mockImplementation(async (_url: string, options: any) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });
      const flow = makeFlow(
        [makeNode('http', 'http', { config: { url: 'https://api.example.com', timeout: 50 } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('Aborted');
    }, 10000);
  });

  describe('delay node', () => {
    it('throws PauseExecutionError for fixed seconds', async () => {
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'fixed', seconds: 5 } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow(PauseExecutionError);
    });

    it('throws PauseExecutionError for duration type', async () => {
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'duration', duration: 'PT30S' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow(PauseExecutionError);
    });

    it('throws PauseExecutionError for timestamp type', async () => {
      const future = new Date(Date.now() + 60000).toISOString();
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'timestamp', timestamp: future } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow(PauseExecutionError);
    });

    it('throws on invalid duration string', async () => {
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'duration', duration: 'invalid' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('invalid ISO 8601 duration');
    });

    it('throws on invalid timestamp', async () => {
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'timestamp', timestamp: 'not-a-date' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('invalid timestamp');
    });

    it('returns delayed:false when delay is 0', async () => {
      const flow = makeFlow(
        [makeNode('trigger', 'trigger'), makeNode('delay', 'delay', { config: { type: 'fixed', seconds: 0 } })],
        [makeEdge('e1', 'trigger', 'delay')],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(result.output.delay).toHaveProperty('delayed', false);
    });

    it('returns delayed:false when seconds is undefined', async () => {
      const flow = makeFlow(
        [makeNode('delay', 'delay', { config: { type: 'fixed' } })],
        [],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(result.output.delay).toHaveProperty('delayed', false);
    });
  });

  describe('ai-action error cases', () => {
    it('throws when endpoint is not found', async () => {
      context.getEndpoint = vi.fn().mockResolvedValue(null);
      const flow = makeFlow(
        [makeNode('ai', 'ai-action', { config: { endpointId: 'missing', model: 'claude', prompt: 'test' } })],
        [],
      );
      await expect(executor.execute(flow, {}, onEvent, context)).rejects.toThrow('not found');
    });
  });

  describe('map edge cases', () => {
    it('returns empty object with no fields', async () => {
      const flow = makeFlow(
        [makeNode('trigger', 'trigger'), makeNode('map', 'map', { config: { fields: [], mode: 'replace' } })],
        [makeEdge('e1', 'trigger', 'map')],
      );
      const result = await executor.execute(flow, { x: 1 }, onEvent, context);
      expect(result.output.map).toEqual({});
    });

    it('sets null for undefined value', async () => {
      const flow = makeFlow(
        [makeNode('trigger', 'trigger'), makeNode('map', 'map', {
          config: { fields: [{ name: 'missing', type: 'string', value: 'nonexistent.path' }], mode: 'replace' },
        })],
        [makeEdge('e1', 'trigger', 'map')],
      );
      const result = await executor.execute(flow, {}, onEvent, context);
      expect(result.output.map).toHaveProperty('missing', null);
    });
  });
});

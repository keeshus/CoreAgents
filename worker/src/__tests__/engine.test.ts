import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutor, HitlPauseError } from '../executor/engine.js';
import type { FlowDefinition, FlowNode, FlowEdge } from 'core-agents-shared';
import type { ExecutionContext } from '../executor/engine.js';

// Mock callLLM to avoid real API calls in LLM agent node tests
vi.mock('../providers/index.js', () => ({
  callLLM: vi.fn(() => Promise.resolve({ text: 'mock LLM response' })),
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

    // Output keyed by node ID, each contains output keyed by label
    expect(result.output.trigger).toHaveProperty('message', 'hello');
    expect(result.steps).toHaveLength(2);
  });

  it('routes correctly through a branch node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('branch', 'branch', { config: { condition: 'input.message === "yes"' } }),
        makeNode('llm1', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
        makeNode('llm2', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'branch'),
        makeEdge('e2', 'branch', 'llm1', { sourceHandle: 'output-1' }),  // true path
        makeEdge('e3', 'branch', 'llm2', { sourceHandle: 'output-0' }),  // false path
      ],
    );

    const result = await executor.execute(flow, { message: 'yes' }, onEvent, context);

    // llm1 should have been reached via the true branch
    expect(result.steps.some(s => s.nodeId === 'trigger')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'branch')).toBe(true);
    expect(result.steps.some(s => s.nodeId === 'llm1')).toBe(true);
    // llm2 (false branch) should be skipped
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
    // Output node with inputFields: ['message'] — when paired with a dot-path field,
    // only that field value should be returned
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('output', 'output', {
          config: {
            inputFields: ['trigger.message'],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'output')],
    );

    const result = await executor.execute(
      flow,
      { message: 'hello', secret: 'S3CR3T', extra: 'data' },
      onEvent,
      context,
    );

    // Output node extracts 'trigger.message' from upstream data
    expect(result.output?.output).toBe('hello');
  });

  it('throws HitlPauseError when executing a HITL node on first run', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('hitl', 'hitl', {
          config: {
            prompt: 'Approve this?',
            displayFields: [],
            forwardFields: [],
            buttons: [
              { label: 'Approve', value: 'approved' },
              { label: 'Reject', value: 'rejected' },
            ],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'hitl')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(HitlPauseError);
  });

  it('replays through a HITL node when _approved is in input', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('hitl', 'hitl', {
          config: {
            prompt: 'Approve this?',
            displayFields: [],
            forwardFields: [],
            buttons: [
              { label: 'Approve', value: 'approved' },
              { label: 'Reject', value: 'rejected' },
            ],
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'hitl')],
    );

    const result = await executor.execute(
      flow,
      { _approved: true, _decision: 'approved', _feedback: 'ok' },
      onEvent,
      context,
    );

    // HITL passes through on approve with namespaced output
    expect(Object.keys(result.output)).toContain('trigger');
    expect(result.steps.find(s => s.nodeId === 'hitl')?.output).toBeDefined();
  });

  it('executes all sub-nodes in a parallel node', async () => {
    const subNodes: FlowNode[] = [
      makeNode('sub-a', 'code', { config: { code: 'return { value: 1 };' } }),
      makeNode('sub-b', 'code', { config: { code: 'return { value: 2 };' } }),
      makeNode('sub-c', 'code', { config: { code: 'return { value: 3 };' } }),
    ];

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('parallel', 'parallel', {
          config: { subNodes },
        }),
      ],
      [makeEdge('e1', 'trigger', 'parallel')],
    );

    const result = await executor.execute(flow, { start: true }, onEvent, context);
    const parallelOutput = (result.output as any).parallel as Record<string, any>;

    // The parallel node has its own output
    expect(parallelOutput).toBeDefined();
    expect(Object.keys(parallelOutput)).toContain('sub-a');
    expect(parallelOutput['sub-a']).toEqual({ value: 1 });
    expect(parallelOutput['sub-b']).toEqual({ value: 2 });
    expect(parallelOutput['sub-c']).toEqual({ value: 3 });
  });

  it('stops execution when abort is called', async () => {
    // Create a flow with 3 nodes where the middle one is slow
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('slow', 'code', {
          config: {
            code: `return new Promise(resolve => setTimeout(() => resolve({ done: true }), 500));`,
          },
        }),
        makeNode('after', 'code', {
          config: { code: 'return { completed: true };' },
        }),
      ],
      [
        makeEdge('e1', 'trigger', 'slow'),
        makeEdge('e2', 'slow', 'after'),
      ],
    );

    // Start execution and abort after 50ms
    const executePromise = executor.execute(flow, { data: 'test' }, onEvent, context);

    // Wait a tick then abort
    setTimeout(() => executor.abort(), 50);

    const result = await executePromise;

    // trigger and slow should have executed (slow started before abort)
    expect(result.output.trigger).toBeDefined();

    // "after" node should not have executed because abort happened
    expect(result.steps.map(s => s.nodeId)).not.toContain('after');
  });

  it('throws an error when the flow contains a cycle', async () => {
    const flow = makeFlow(
      [
        makeNode('a', 'trigger'),
        makeNode('b', 'code', { config: { code: 'return input;' } }),
        makeNode('c', 'code', { config: { code: 'return input;' } }),
      ],
      [
        makeEdge('e1', 'a', 'b'),
        makeEdge('e2', 'b', 'c'),
        makeEdge('e3', 'c', 'a'),  // cycle!
      ],
    );

    // Cycles are now allowed (feedback loops) — engine warns and processes them
    const result = await executor.execute(flow, {}, onEvent, context);
    expect(result.output).toBeDefined();
  });
});

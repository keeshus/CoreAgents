import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutor, HitlPauseError } from '../executor/engine.js';
import type { FlowDefinition, FlowNode, FlowEdge, ExecutionContext } from 'core-agents-shared';

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
  let onEvent: ReturnType<typeof vi.fn>;
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
        makeNode('code', 'code', { config: { code: 'return { result: payload.message };' } }),
      ],
      [makeEdge('e1', 'trigger', 'code')],
    );

    const result = await executor.execute(flow, { message: 'hello' }, onEvent, context);

    expect(result.output.code).toEqual({ result: 'hello' });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].nodeId).toBe('trigger');
    expect(result.steps[1].nodeId).toBe('code');
    expect(onEvent).toHaveBeenCalledTimes(4); // 2 starts + 2 completions
  });

  it('routes correctly through a branch node', async () => {
    // trigger -> branch (condition: true) -> llm1
    //                                  \ -> llm2 (skipped)
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('branch', 'branch', { config: { condition: 'true', outputLabels: ['true', 'false'] } }),
        makeNode('llm1', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
        makeNode('llm2', 'llm-agent', { config: { endpointId: 'ep1', model: 'claude-3', systemPrompt: '', temperature: 0.7, maxTokens: 1000, responseFormat: 'text' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'branch'),
        makeEdge('e2', 'branch', 'llm1', { condition: { label: 'true', expression: 'true' } }),
        makeEdge('e3', 'branch', 'llm2', { condition: { label: 'false', expression: 'false' } }),
      ],
    );

    const result = await executor.execute(flow, {}, onEvent, context);

    // Branch should have evaluated to true
    expect(result.output.branch).toHaveProperty('verdict', true);

    // llm1 should have executed (the one on the 'true' branch)
    expect(result.output.llm1).toBeDefined();
    expect(result.output.llm1).not.toHaveProperty('skipped');

    // llm2 should have been skipped (the 'false' branch)
    expect(result.output.llm2).toEqual({ skipped: true, reason: 'No matching route' });

    // One step for each node that actually ran: trigger, branch, llm1
    expect(result.steps).toHaveLength(3);
  });

  it('filters input to only specified inputFields', async () => {
    // Code node with inputFields: ['message'] — only 'message' should be passed
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('code', 'code', {
          config: {
            inputFields: ['message'],
            code: 'return Object.keys(payload);',
          },
        }),
      ],
      [makeEdge('e1', 'trigger', 'code')],
    );

    const result = await executor.execute(
      flow,
      { message: 'hello', secret: 'S3CR3T', extra: 'data' },
      onEvent,
      context,
    );

    // The code node should only have received 'message' in its payload
    const keysReceived = result.output.code;
    expect(keysReceived).toEqual(['message']);
    expect(keysReceived).not.toContain('secret');
    expect(keysReceived).not.toContain('extra');
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

    expect(result.steps.find(s => s.nodeId === 'hitl')?.output?.decision).toBe('approved');
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

    // The parallel node should merge outputs from all sub-nodes
    expect(result.output.parallel).toBeDefined();
    expect(result.output.parallel).toHaveProperty('sub-a');
    expect(result.output.parallel).toHaveProperty('sub-b');
    expect(result.output.parallel).toHaveProperty('sub-c');
    expect(result.output.parallel['sub-a']).toEqual({ value: 1 });
    expect(result.output.parallel['sub-b']).toEqual({ value: 2 });
    expect(result.output.parallel['sub-c']).toEqual({ value: 3 });
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
    expect(result.output.after).toBeUndefined();
  });

  it('throws an error when the flow contains a cycle', async () => {
    const flow = makeFlow(
      [
        makeNode('a', 'trigger'),
        makeNode('b', 'code', { config: { code: 'return payload;' } }),
        makeNode('c', 'code', { config: { code: 'return payload;' } }),
      ],
      [
        makeEdge('e1', 'a', 'b'),
        makeEdge('e2', 'b', 'c'),
        makeEdge('e3', 'c', 'a'),  // cycle!
      ],
    );

    await expect(
      executor.execute(flow, {}, onEvent, context),
    ).rejects.toThrow(/cycle/i);
  });
});

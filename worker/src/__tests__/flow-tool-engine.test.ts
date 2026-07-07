import { describe, it, expect, vi } from 'vitest';
import { FlowExecutor } from '../executor/engine.js';
import type { FlowDefinition, FlowNode, FlowEdge } from 'core-agents-shared';

vi.mock('../providers/index.js', () => ({
  callLLM: vi.fn(() => Promise.resolve({ text: 'mock LLM response' })),
}));

vi.mock('../tools/bash.js', () => ({
  executeCode: vi.fn(),
  executeBash: vi.fn(async () => 'mock bash result'),
  BASH_TOOL_DEFINITION: {
    name: 'bash',
    description: 'Mock bash tool',
    input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
  BASH_SANDBOX_SYSTEM_PROMPT: '\nmock sandbox prompt\n',
}));

vi.mock('../sandbox/sidecar-client.js', () => ({
  createSidecarClient: vi.fn(() => ({
    setup: vi.fn(async () => {}),
    exec: vi.fn(async () => ({ stdout: 'mocked', stderr: '', exitCode: 0 })),
    teardown: vi.fn(async () => {}),
  })),
}));

const slugify = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '_');

function makeNode(id: string, nodeType: string, overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: { type: nodeType, label: id, config: {}, ...overrides } as any,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<FlowEdge> = {}): FlowEdge {
  return { id, source, target, sourceHandle: null, targetHandle: null, ...overrides };
}

describe('flow-tool tool definition injection', () => {
  it('slugify converts flow names correctly', () => {
    expect(slugify('Weather API')).toBe('weather_api');
    expect(slugify('Send Email')).toBe('send_email');
    expect(slugify('My Flow 123')).toBe('my_flow_123');
    expect(slugify('hello.world')).toBe('hello_world');
  });

  it('generates flow_ prefixed tool name from webhook flow', () => {
    const flowName = 'Get Weather';
    const toolName = 'flow_' + slugify(flowName);
    expect(toolName).toBe('flow_get_weather');
  });

  it('parses inputSchema JSON Schema to extract field count', () => {
    const schema = '{"type":"object","properties":{"city":{"type":"string"},"units":{"type":"string"}}}';
    const parsed = JSON.parse(schema);
    const fieldCount = parsed.properties ? Object.keys(parsed.properties).length : 0;
    expect(fieldCount).toBe(2);
  });

  it('handles empty inputSchema', () => {
    const schema = '{}';
    const parsed = JSON.parse(schema);
    const fieldCount = parsed.properties ? Object.keys(parsed.properties).length : 0;
    expect(fieldCount).toBe(0);
  });
});

describe('flow-tool tool call dispatch', () => {
  it('detects flow_ prefix in tool name', () => {
    const toolName = 'flow_get_weather';
    expect(toolName.startsWith('flow_')).toBe(true);
    expect(toolName.slice(5)).toBe('get_weather');
  });

  it('does not match non-flow tool names', () => {
    expect('bash'.startsWith('flow_')).toBe(false);
    expect('store_get'.startsWith('flow_')).toBe(false);
    expect('flow'.startsWith('flow_')).toBe(false);
    expect('flow_'.startsWith('flow_')).toBe(true);
  });

  it('resolves selectedFlows by slugified name', () => {
    const selectedFlows = [
      { id: 'f1', name: 'Weather API' },
      { id: 'f2', name: 'Send Email' },
    ];
    const calledName = 'weather_api';
    const match = selectedFlows.find(f => slugify(f.name) === calledName);
    expect(match).toBeDefined();
    expect(match!.id).toBe('f1');
  });

  it('returns undefined for unknown flow name', () => {
    const selectedFlows = [{ id: 'f1', name: 'Weather API' }];
    const match = selectedFlows.find(f => slugify(f.name) === 'unknown_flow');
    expect(match).toBeUndefined();
  });
});
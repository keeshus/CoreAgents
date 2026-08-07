import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toolGroups, normalizeOutputSchema } from '@/components/assistant/tools/registry';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const toolByName = (name: string) => {
  const all = Object.values(toolGroups).flat();
  const tool = all.find(t => t.name === name);
  expect(tool, `tool ${name} should exist`).toBeDefined();
  return tool!;
};

describe('assistant tools cover the group-context feature', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('group-context-crud exposes get_group_context and update_group_context', () => {
    const names = toolGroups['group-context-crud'].map(t => t.name);
    expect(names).toContain('get_group_context');
    expect(names).toContain('update_group_context');
  });

  it('update_group_context writes via PUT /api/groups/:id/context', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({ status: 'ok' }));

    const tool = toolByName('update_group_context');
    const result = await tool.execute({ groupId: 'grp-1', context: 'new group context' });

    expect(result).toContain('updated');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/groups/grp-1/context');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ context: 'new group context' });
  });

  it('update_group_context surfaces a 403 for non-group-admins', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Only group admins can update the group context' }), { status: 403 }));

    const tool = toolByName('update_group_context');
    const result = await tool.execute({ groupId: 'grp-1', context: 'x' });
    expect(result).toContain('Only group admins can update the group context');
  });

  it('get_group_context reads via GET /api/groups/:id/context', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({ context: 'group hello' }));

    const tool = toolByName('get_group_context');
    const result = await tool.execute({ groupId: 'grp-1' });

    expect(result).toContain('group hello');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/groups/grp-1/context');
  });

  it('list_groups scopes non-admins to their own groups', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({
      user: {
        role: 'editor',
        permissions: ['flow:create', 'group:read'],
        groups: [{ id: 'mine-1', name: 'My Group', role: 'admin' }],
      },
    }));

    const tool = toolByName('list_groups');
    const result = await tool.execute({});

    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ id: 'mine-1', name: 'My Group', role: 'admin' }]);
    // Must not hit the all-groups endpoint for non-admins
    const urls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(urls).not.toContain('/api/groups');
  });

  it('list_groups returns all groups for admins', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({
      user: { role: 'admin', permissions: ['admin'], groups: [{ id: 'g1', name: 'G1', role: 'admin' }] },
    }));
    fetchMock.mockResolvedValueOnce(json([{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }]));

    const tool = toolByName('list_groups');
    const result = await tool.execute({});

    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);
    const urls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(urls).toContain('/api/groups');
  });

  it('list_agent_contexts forwards sort and group_id params', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json([]));

    const tool = toolByName('list_agent_contexts');
    await tool.execute({ sort: 'created_at', groupId: 'grp-9' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/agent-contexts?');
    expect(url).toContain('sort=created_at');
    expect(url).toContain('group_id=grp-9');
  });

  it('add_node cannot add trigger nodes (catalog removal)', () => {
    const tool = toolByName('add_node');
    const schema = tool.inputSchema as any;
    expect(schema.properties.type.enum).not.toContain('trigger');
  });

  it('get_available_nodes documents that the trigger is pre-added', async () => {
    const tool = toolByName('get_available_nodes');
    const result = await tool.execute({});
    expect(result).toContain('pre-added');
  });
});

describe('co-pilot understands structured node outputs', () => {
  const canvas = () => ({
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
      { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Transform', type: 'code', config: { code: 'return { result: 42 };', outputSchema: '{"type":"object","properties":{"result":{"type":"number"},"label":{"type":"string"}}}' } } },
      { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
    ],
    edges: [
      { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
      { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
    ],
  });

  beforeEach(() => {
    const { nodes, edges } = canvas();
    (window as any).__flowCanvasNodes = nodes;
    (window as any).__flowCanvasEdges = edges;
  });

  it('flow-editor exposes get_node_output_shape', () => {
    const names = toolGroups['flow-editor'].map(t => t.name);
    expect(names).toContain('get_node_output_shape');
  });

  it('reports a code node output schema as named fields', async () => {
    const tool = toolByName('get_node_output_shape');
    const result = await tool.execute({ label: 'Transform' });
    const report = JSON.parse(result);
    expect(report).toHaveLength(1);
    expect(report[0].node).toBe('Transform');
    expect(report[0].output.kind).toBe('fields');
    const names = report[0].output.fields.map((f: any) => f.name);
    expect(names).toEqual(['result', 'label']);
    expect(report[0].referenceExample).toBe('Transform.fieldName');
  });

  it('reports code nodes without outputSchema as raw "any"', async () => {
    (window as any).__flowCanvasNodes[1].data.config = { code: 'return 42;' };
    const tool = toolByName('get_node_output_shape');
    const result = await tool.execute({ label: 'Transform' });
    const report = JSON.parse(result);
    expect(report[0].output.kind).toBe('raw');
    expect(report[0].output.note).toContain('return value');
  });

  it('reports upstream inputs with the fields available to a node', async () => {
    const tool = toolByName('get_node_output_shape');
    const result = await tool.execute({ label: 'Output' });
    const report = JSON.parse(result);
    const upstream = report[0].upstreamInputs;
    expect(upstream.length).toBe(2);
    // DFS upstream order: Transform first (direct source), then Start (its source)
    expect(upstream[0].source).toBe('Transform');
    const fieldNames = upstream[0].fields.map((f: any) => f.name);
    expect(fieldNames).toEqual(['result', 'label']);
    expect(upstream[1].source).toBe('Start');
  });

  it('returns all node shapes when no label is given, with a referencing guide', async () => {
    const tool = toolByName('get_node_output_shape');
    const result = await tool.execute({});
    expect(result).toContain('Referencing: use "<NodeLabel>.<field>"');
    const report = JSON.parse(result.slice(0, result.lastIndexOf('\nReferencing')));
    expect(report).toHaveLength(3);
  });

  it('get_node_type_info documents structured outputs for the code node', async () => {
    const tool = toolByName('get_node_type_info');
    const result = await tool.execute({ nodeType: 'code' });
    expect(result).toContain('Output Structure (documentation)');
    expect(result).toContain('Label.field');
  });
});

describe('co-pilot can set structured output schemas', () => {
  it('flow-editor exposes set_node_output_schema', () => {
    const names = toolGroups['flow-editor'].map(t => t.name);
    expect(names).toContain('set_node_output_schema');
  });

  it('set_node_output_schema requires a schema argument', () => {
    const tool = toolByName('set_node_output_schema');
    const schema = tool.inputSchema as any;
    expect(schema.required).toContain('schema');
  });

  it('normalizeOutputSchema converts a shorthand field map to a full JSON Schema', () => {
    const result = normalizeOutputSchema('{"result":"string","count":"number"}');
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.value!);
    expect(parsed.type).toBe('object');
    expect(parsed.properties).toEqual({ result: { type: 'string' }, count: { type: 'number' } });
    expect(parsed.required).toEqual(['result', 'count']);
  });

  it('normalizeOutputSchema passes full JSON Schemas through untouched', () => {
    const full = '{"type":"object","properties":{"result":{"type":"string","description":"the value"}},"required":["result"]}';
    const result = normalizeOutputSchema(full);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.value!)).toEqual(JSON.parse(full));
  });

  it('normalizeOutputSchema rejects invalid JSON and non-objects', () => {
    const bad = normalizeOutputSchema('not json {');
    expect(bad.ok).toBe(false);
    const arr = normalizeOutputSchema('["a","b"]');
    expect(arr.ok).toBe(false);
  });

  it('normalizeOutputSchema allows clearing the schema with an empty string', () => {
    const result = normalizeOutputSchema('');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('');
  });
});

import { describe, it, expect } from 'vitest';

// Replicate the getSchemaFieldCount logic from FlowToolConfig.tsx
function getSchemaFieldCount(flow: any): number {
  try {
    const triggerNode = flow.nodes?.find((n: any) => n.data?.type === 'trigger');
    const schema = triggerNode?.data?.config?.inputSchema;
    if (!schema) return -1;
    const parsed = typeof schema === 'string' ? JSON.parse(schema) : schema;
    if (parsed?.properties) return Object.keys(parsed.properties).length;
    return Object.keys(parsed).length;
  } catch { return -1; }
}

describe('FlowToolConfig - getSchemaFieldCount', () => {
  it('returns -1 for flow with no input schema', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }] };
    expect(getSchemaFieldCount(flow)).toBe(-1);
  });

  it('returns 0 for empty schema', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{}' } } }] };
    expect(getSchemaFieldCount(flow)).toBe(0);
  });

  it('returns field count for JSON Schema format', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"type":"object","properties":{"city":{"type":"string"},"units":{"type":"string"}}}' } } }] };
    expect(getSchemaFieldCount(flow)).toBe(2);
  });

  it('returns field count for simple format', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"city":"string","units":"string","api_key":"string"}' } } }] };
    expect(getSchemaFieldCount(flow)).toBe(3);
  });

  it('returns -1 for invalid JSON schema', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook', inputSchema: 'invalid json' } } }] };
    expect(getSchemaFieldCount(flow)).toBe(-1);
  });

  it('returns -1 for flow with no trigger node', () => {
    const flow = { nodes: [] };
    expect(getSchemaFieldCount(flow)).toBe(-1);
  });

  it('returns -1 for flow with no nodes', () => {
    const flow = {};
    expect(getSchemaFieldCount(flow)).toBe(-1);
  });

  it('handles parsed object (not string) inputSchema', () => {
    const flow = { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } } } }] };
    expect(getSchemaFieldCount(flow)).toBe(1);
  });
});

describe('FlowToolConfig - selection logic', () => {
  it('toggleFlow adds flowId when not selected', () => {
    const config = { flowIds: [], selectedFlows: [] };
    const flow = { id: 'f1', name: 'Weather', group_id: null };
    const newIds = [...config.flowIds, flow.id];
    const newMeta = [...config.selectedFlows, { id: flow.id, name: flow.name, groupId: flow.group_id }];
    expect(newIds).toEqual(['f1']);
    expect(newMeta).toEqual([{ id: 'f1', name: 'Weather', groupId: null }]);
  });

  it('toggleFlow removes flowId when already selected', () => {
    const config = { flowIds: ['f1', 'f2'], selectedFlows: [{ id: 'f1', name: 'Weather', groupId: null }, { id: 'f2', name: 'Email', groupId: 'g1' }] };
    const newIds = config.flowIds.filter(id => id !== 'f1');
    const newMeta = config.selectedFlows.filter(s => s.id !== 'f1');
    expect(newIds).toEqual(['f2']);
    expect(newMeta).toEqual([{ id: 'f2', name: 'Email', groupId: 'g1' }]);
  });
});
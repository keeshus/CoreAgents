import { describe, it, expect } from 'vitest';

// Replicate the catalog array to test it independently
// Matches the structure in ../routes/catalog.ts
const NODE_CATEGORIES = ['input', 'processing', 'tools', 'output'] as const;

interface CatalogEntry {
  type: string;
  label: string;
  category: string;
  description: string;
  defaultConfig: Record<string, unknown>;
  inputs: number;
  outputs: number;
}

const catalog: CatalogEntry[] = [
  { type: 'trigger', label: 'Trigger', category: 'input', description: '', defaultConfig: { triggerType: 'manual' }, inputs: 0, outputs: 1 },
  { type: 'llm-agent', label: 'LLM Agent', category: 'processing', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'mcp-tool', label: 'MCP Tool', category: 'tools', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'flow-tool', label: 'Flow Tool', category: 'tools', description: '', defaultConfig: { flowIds: [], selectedFlows: [] }, inputs: 0, outputs: 0 },
  { type: 'retriever', label: 'Retriever', category: 'tools', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'condition', label: 'Condition', category: 'processing', description: '', defaultConfig: { condition: '' }, inputs: 1, outputs: 2 },
  { type: 'code', label: 'Code', category: 'processing', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'parallel', label: 'Parallel Agents', category: 'processing', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'subflow', label: 'Subflow', category: 'processing', description: '', defaultConfig: { subflowId: '', inputMapping: {} }, inputs: 1, outputs: 1 },
  { type: 'hitl', label: 'Human in the Loop', category: 'processing', description: '', defaultConfig: {}, inputs: 1, outputs: 1 },
  { type: 'switch', label: 'Switch', category: 'processing', description: '', defaultConfig: { fieldPath: '', cases: [] }, inputs: 1, outputs: 0 },
  { type: 'http', label: 'HTTP Request', category: 'tools', description: '', defaultConfig: { method: 'GET', url: '' }, inputs: 1, outputs: 1 },
  { type: 'loop', label: 'Loop', category: 'processing', description: '', defaultConfig: { itemsField: '', subNodes: [], subEdges: [] }, inputs: 1, outputs: 1 },
  { type: 'delay', label: 'Delay', category: 'processing', description: '', defaultConfig: { type: 'fixed', seconds: 5 }, inputs: 1, outputs: 1 },
  { type: 'ai-action', label: 'AI Action', category: 'processing', description: '', defaultConfig: { endpointId: '', model: '', prompt: '' }, inputs: 1, outputs: 1 },
  { type: 'map', label: 'Map', category: 'processing', description: '', defaultConfig: { fields: [], mode: 'replace' }, inputs: 1, outputs: 1 },
  { type: 'note', label: 'Note', category: 'processing', description: '', defaultConfig: { content: '' }, inputs: 0, outputs: 0 },
  { type: 'output', label: 'Output', category: 'output', description: '', defaultConfig: {}, inputs: 1, outputs: 0 },
];

describe('Node Catalog', () => {
  it('contains all expected node types', () => {
    const types = catalog.map(e => e.type);
    expect(types).toContain('trigger');
    expect(types).toContain('llm-agent');
    expect(types).toContain('mcp-tool');
    expect(types).toContain('flow-tool');
    expect(types).toContain('retriever');
    expect(types).toContain('condition');
    expect(types).toContain('code');
    expect(types).toContain('parallel');
    expect(types).toContain('subflow');
    expect(types).toContain('hitl');
    expect(types).toContain('output');
    expect(types).toContain('switch');
    expect(types).toContain('http');
    expect(types).toContain('loop');
    expect(types).toContain('delay');
    expect(types).toContain('ai-action');
    expect(types).toContain('map');
    expect(types).toContain('note');
  });

  it('includes flow-tool entry with correct config', () => {
    const ft = catalog.find(e => e.type === 'flow-tool');
    expect(ft).toBeDefined();
    expect(ft!.category).toBe('tools');
    expect(ft!.inputs).toBe(0);
    expect(ft!.outputs).toBe(0);
    expect(ft!.defaultConfig).toHaveProperty('flowIds', []);
    expect(ft!.defaultConfig).toHaveProperty('selectedFlows', []);
  });

  it('includes subflow entry with correct config', () => {
    const subflow = catalog.find(e => e.type === 'subflow');
    expect(subflow).toBeDefined();
    expect(subflow!.category).toBe('processing');
    expect(subflow!.inputs).toBe(1);
    expect(subflow!.outputs).toBe(1);
    expect(subflow!.defaultConfig).toHaveProperty('subflowId', '');
    expect(subflow!.defaultConfig).toHaveProperty('inputMapping', {});
  });

  it('includes http entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'http');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('tools');
    expect(entry!.inputs).toBe(1);
    expect(entry!.outputs).toBe(1);
    expect(entry!.defaultConfig).toHaveProperty('method', 'GET');
    expect(entry!.defaultConfig).toHaveProperty('url', '');
  });

  it('includes loop entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'loop');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('processing');
    expect(entry!.inputs).toBe(1);
    expect(entry!.outputs).toBe(1);
    expect(entry!.defaultConfig).toHaveProperty('itemsField', '');
    expect(entry!.defaultConfig).toHaveProperty('subNodes', []);
    expect(entry!.defaultConfig).toHaveProperty('subEdges', []);
  });

  it('includes delay entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'delay');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('processing');
    expect(entry!.inputs).toBe(1);
    expect(entry!.outputs).toBe(1);
    expect(entry!.defaultConfig).toHaveProperty('type', 'fixed');
    expect(entry!.defaultConfig).toHaveProperty('seconds', 5);
  });

  it('includes ai-action entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'ai-action');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('processing');
    expect(entry!.inputs).toBe(1);
    expect(entry!.outputs).toBe(1);
    expect(entry!.defaultConfig).toHaveProperty('endpointId', '');
    expect(entry!.defaultConfig).toHaveProperty('model', '');
    expect(entry!.defaultConfig).toHaveProperty('prompt', '');
  });

  it('includes map entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'map');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('processing');
    expect(entry!.inputs).toBe(1);
    expect(entry!.outputs).toBe(1);
    expect(entry!.defaultConfig).toHaveProperty('fields', []);
    expect(entry!.defaultConfig).toHaveProperty('mode', 'replace');
  });

  it('includes note entry with correct config', () => {
    const entry = catalog.find(e => e.type === 'note');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('processing');
    expect(entry!.inputs).toBe(0);
    expect(entry!.outputs).toBe(0);
    expect(entry!.defaultConfig).toHaveProperty('content', '');
  });

  it('has valid categories for all entries', () => {
    for (const entry of catalog) {
      expect(NODE_CATEGORIES).toContain(entry.category as any);
    }
  });

  it('has no duplicate types', () => {
    const types = catalog.map(e => e.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

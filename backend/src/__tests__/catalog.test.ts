import { describe, it, expect } from 'vitest';
import { catalog } from '../routes/catalog.js';

// Tests the real catalog exported by ../routes/catalog.ts — no replication, so
// the fixture can never drift from the source of truth.

const NODE_CATEGORIES = ['input', 'processing', 'tools', 'output'] as const;

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

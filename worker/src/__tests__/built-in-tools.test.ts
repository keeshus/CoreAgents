import { describe, it, expect } from 'vitest';
import { BUILT_IN_TOOLS } from '../tools/built-in.js';

describe('BUILT_IN_TOOLS', () => {
  it('exports exactly 7 tools', () => {
    expect(BUILT_IN_TOOLS).toHaveLength(7);
  });

  it('each tool has name and description properties', () => {
    for (const tool of BUILT_IN_TOOLS) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('contains all expected store tools', () => {
    const storeTools = BUILT_IN_TOOLS.filter(t => t.name.startsWith('store_'));
    expect(storeTools).toHaveLength(4);

    const names = storeTools.map(t => t.name).sort();
    expect(names).toEqual(['store_delete', 'store_get', 'store_list', 'store_set']);
  });

  it('contains all expected utility tools (now, uuid, log)', () => {
    const utilityTools = BUILT_IN_TOOLS.filter(t => !t.name.startsWith('store_'));
    expect(utilityTools).toHaveLength(3);

    const names = utilityTools.map(t => t.name).sort();
    expect(names).toEqual(['log', 'now', 'uuid']);
  });

  it('does not contain file tools (replaced by bash)', () => {
    const fileTools = BUILT_IN_TOOLS.filter(t => t.name.startsWith('file_'));
    expect(fileTools).toHaveLength(0);
  });

  it('does not contain fetch tool (replaced by curl via bash)', () => {
    const fetchTool = BUILT_IN_TOOLS.find(t => t.name === 'fetch');
    expect(fetchTool).toBeUndefined();
  });

  it('does not contain secret_get tool (replaced by env vars)', () => {
    const secretTool = BUILT_IN_TOOLS.find(t => t.name === 'secret_get');
    expect(secretTool).toBeUndefined();
  });

  describe('utility tool descriptions', () => {
    it('`now` tool has expected description', () => {
      const tool = BUILT_IN_TOOLS.find(t => t.name === 'now')!;
      expect(tool.description).toMatch(/current date and time/i);
    });

    it('`uuid` tool has expected description', () => {
      const tool = BUILT_IN_TOOLS.find(t => t.name === 'uuid')!;
      expect(tool.description).toMatch(/uuid/i);
    });

    it('`log` tool has expected description', () => {
      const tool = BUILT_IN_TOOLS.find(t => t.name === 'log')!;
      expect(tool.description).toMatch(/log entry/i);
    });
  });

  it('all tool names are unique', () => {
    const names = BUILT_IN_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

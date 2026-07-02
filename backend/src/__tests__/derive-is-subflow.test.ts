import { describe, it, expect } from 'vitest';

function deriveIsSubflow(nodes: any[]): boolean {
  return nodes.some((n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'subflow');
}

function makeNode(id: string, nodeType: string, overrides: Record<string, any> = {}) {
  return { id, type: nodeType, data: { type: nodeType, label: id, config: {}, ...overrides } };
}

describe('deriveIsSubflow', () => {
  it('returns true when a trigger has triggerType subflow', () => {
    const nodes = [makeNode('t1', 'trigger', { config: { triggerType: 'subflow' } })];
    expect(deriveIsSubflow(nodes)).toBe(true);
  });

  it('returns false when trigger has manual type', () => {
    const nodes = [makeNode('t1', 'trigger', { config: { triggerType: 'manual' } })];
    expect(deriveIsSubflow(nodes)).toBe(false);
  });

  it('returns false when there is no trigger node', () => {
    const nodes = [makeNode('c1', 'code')];
    expect(deriveIsSubflow(nodes)).toBe(false);
  });

  it('returns false for empty nodes array', () => {
    expect(deriveIsSubflow([])).toBe(false);
  });

  it('returns true when multiple nodes and one has subflow trigger', () => {
    const nodes = [
      makeNode('t1', 'trigger', { config: { triggerType: 'manual' } }),
      makeNode('t2', 'trigger', { config: { triggerType: 'subflow' } }),
    ];
    expect(deriveIsSubflow(nodes)).toBe(true);
  });
});

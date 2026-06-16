import { describe, it, expect } from 'vitest';
import { topologicalSort } from '../executor/dag.js';
import type { FlowNode, FlowEdge } from 'core-agents-shared';

function makeNode(id: string, type: string = 'code'): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, type: type as any, config: {} } as any,
  };
}

function makeEdge(id: string, source: string, target: string): FlowEdge {
  return { id, source, target, sourceHandle: null, targetHandle: null };
}

describe('topologicalSort (additional DAG tests)', () => {
  it('handles a graph with disconnected subgraphs', () => {
    // Subgraph 1: a -> b -> c
    // Subgraph 2: d -> e -> f
    const nodes = [
      makeNode('a'), makeNode('b'), makeNode('c'),
      makeNode('d'), makeNode('e'), makeNode('f'),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'b', 'c'),
      makeEdge('e3', 'd', 'e'),
      makeEdge('e4', 'e', 'f'),
    ];
    const result = topologicalSort(nodes, edges);

    expect(result.cycles).toHaveLength(0);
    expect(result.sorted).toHaveLength(6);

    // Verify subgraph 1 order
    const idxA = result.sorted.findIndex(n => n.id === 'a');
    const idxB = result.sorted.findIndex(n => n.id === 'b');
    const idxC = result.sorted.findIndex(n => n.id === 'c');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);

    // Verify subgraph 2 order
    const idxD = result.sorted.findIndex(n => n.id === 'd');
    const idxE = result.sorted.findIndex(n => n.id === 'e');
    const idxF = result.sorted.findIndex(n => n.id === 'f');
    expect(idxD).toBeLessThan(idxE);
    expect(idxE).toBeLessThan(idxF);
  });

  it('handles a single node graph', () => {
    const nodes = [makeNode('only')];
    const edges: FlowEdge[] = [];
    const result = topologicalSort(nodes, edges);

    expect(result.cycles).toHaveLength(0);
    expect(result.sorted).toHaveLength(1);
    expect(result.sorted[0].id).toBe('only');
  });

  it('handles diamond pattern where two paths converge', () => {
    // a -> b -> d
    // a -> c -> d
    const nodes = [
      makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'b', 'd'),
      makeEdge('e4', 'c', 'd'),
    ];
    const result = topologicalSort(nodes, edges);

    expect(result.cycles).toHaveLength(0);
    expect(result.sorted).toHaveLength(4);

    // a must come first, d must come last
    expect(result.sorted[0].id).toBe('a');
    expect(result.sorted[3].id).toBe('d');
    // b and c are between a and d (order among themselves doesn't matter)
  });

  it('handles a graph where all nodes have no edges (fully disconnected)', () => {
    const nodes = [makeNode('x'), makeNode('y'), makeNode('z')];
    const edges: FlowEdge[] = [];
    const result = topologicalSort(nodes, edges);

    expect(result.cycles).toHaveLength(0);
    expect(result.sorted).toHaveLength(3);

    // All nodes should be present
    const sortedIds = result.sorted.map(n => n.id).sort();
    expect(sortedIds).toEqual(['x', 'y', 'z']);
  });
});

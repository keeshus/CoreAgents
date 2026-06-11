import { describe, it, expect } from 'vitest';
import { topologicalSort } from '../executor/dag.js';
function makeNode(id, type = 'code') {
    return {
        id,
        type,
        position: { x: 0, y: 0 },
        data: { label: id, type: type, config: {} },
    };
}
function makeEdge(id, source, target) {
    return { id, source, target, sourceHandle: null, targetHandle: null };
}
describe('topologicalSort', () => {
    it('sorts a simple linear graph', () => {
        const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
        const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
        const result = topologicalSort(nodes, edges);
        expect(result.cycles).toHaveLength(0);
        expect(result.sorted.map(n => n.id)).toEqual(['a', 'b', 'c']);
    });
    it('sorts a diamond graph', () => {
        // a -> b, a -> c, b -> d, c -> d
        const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
        const edges = [
            makeEdge('e1', 'a', 'b'),
            makeEdge('e2', 'a', 'c'),
            makeEdge('e3', 'b', 'd'),
            makeEdge('e4', 'c', 'd'),
        ];
        const result = topologicalSort(nodes, edges);
        expect(result.cycles).toHaveLength(0);
        expect(result.sorted[0].id).toBe('a');
        expect(result.sorted[3].id).toBe('d');
        // b and c can be in either order
    });
    it('detects cycles', () => {
        const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
        const edges = [
            makeEdge('e1', 'a', 'b'),
            makeEdge('e2', 'b', 'c'),
            makeEdge('e3', 'c', 'a'), // cycle!
        ];
        const result = topologicalSort(nodes, edges);
        expect(result.cycles.length).toBeGreaterThan(0);
    });
    it('handles empty graph', () => {
        const result = topologicalSort([], []);
        expect(result.sorted).toHaveLength(0);
        expect(result.cycles).toHaveLength(0);
    });
    it('handles disconnected nodes', () => {
        const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
        const edges = [];
        const result = topologicalSort(nodes, edges);
        expect(result.cycles).toHaveLength(0);
        expect(result.sorted).toHaveLength(3);
    });
    it('sorts branch graph', () => {
        // trigger -> branch -> (true) llm1 -> output
        //                   -> (false) llm2 -> output
        const nodes = [
            makeNode('trigger', 'trigger'),
            makeNode('branch', 'branch'),
            makeNode('llm1', 'llm-agent'),
            makeNode('llm2', 'llm-agent'),
            makeNode('output', 'output'),
        ];
        const edges = [
            makeEdge('e1', 'trigger', 'branch'),
            makeEdge('e2', 'branch', 'llm1'),
            makeEdge('e3', 'branch', 'llm2'),
            makeEdge('e4', 'llm1', 'output'),
            makeEdge('e5', 'llm2', 'output'),
        ];
        const result = topologicalSort(nodes, edges);
        expect(result.cycles).toHaveLength(0);
        expect(result.sorted[0].id).toBe('trigger');
        expect(result.sorted[4].id).toBe('output');
    });
});
//# sourceMappingURL=dag.test.js.map
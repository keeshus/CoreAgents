import type { FlowNode, FlowEdge } from 'core-agents-shared';
export interface TopologicalSortResult {
    sorted: FlowNode[];
    cycles: string[][];
}
export declare function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): TopologicalSortResult;
//# sourceMappingURL=dag.d.ts.map
import { z } from 'zod';
export declare const NODE_TYPES: readonly ["trigger", "llm-agent", "mcp-tool", "retriever", "branch", "code", "output"];
export type NodeType = (typeof NODE_TYPES)[number];
export type NodeCategory = 'input' | 'processing' | 'tools' | 'output';
export declare const nodeTypeSchema: z.ZodEnum<["trigger", "llm-agent", "mcp-tool", "retriever", "branch", "code", "output"]>;
export interface BaseNodeData {
    label: string;
    type: NodeType;
    config: Record<string, unknown>;
}
export interface TriggerNodeData extends BaseNodeData {
    type: 'trigger';
    config: {
        triggerType: 'manual' | 'chat' | 'webhook' | 'schedule';
    };
}
export interface LLMAgentNodeData extends BaseNodeData {
    type: 'llm-agent';
    config: {
        endpointId: string;
        model: string;
        systemPrompt: string;
        temperature: number;
        maxTokens: number;
    };
}
export interface MCPToolNodeData extends BaseNodeData {
    type: 'mcp-tool';
    config: {
        serverId: string;
        toolName: string;
        parameters: Record<string, unknown>;
    };
}
export interface RetrieverNodeData extends BaseNodeData {
    type: 'retriever';
    config: {
        collectionName: string;
        topK: number;
        minScore: number;
    };
}
export interface BranchNodeData extends BaseNodeData {
    type: 'branch';
    config: {
        condition: string;
        outputLabels: string[];
    };
}
export interface CodeNodeData extends BaseNodeData {
    type: 'code';
    config: {
        language: 'javascript' | 'python';
        code: string;
    };
}
export interface OutputNodeData extends BaseNodeData {
    type: 'output';
    config: {
        format: 'text' | 'json' | 'markdown';
    };
}
export type NodeData = TriggerNodeData | LLMAgentNodeData | MCPToolNodeData | RetrieverNodeData | BranchNodeData | CodeNodeData | OutputNodeData;
export interface EdgeCondition {
    label: string;
    expression: string;
}
export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
    condition?: EdgeCondition;
}
export interface FlowNode {
    id: string;
    type: string;
    position: {
        x: number;
        y: number;
    };
    data: NodeData;
}
export interface FlowDefinition {
    id: string;
    name: string;
    description: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface Execution {
    id: string;
    flowId: string;
    status: ExecutionStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
}
export interface ExecutionStep {
    id: string;
    executionId: string;
    nodeId: string;
    nodeType: NodeType;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input: Record<string, unknown> | null;
    output: Record<string, unknown> | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
}
export type SSEEventType = 'execution.started' | 'step.started' | 'step.completed' | 'step.failed' | 'stream.token' | 'execution.completed' | 'execution.failed' | 'log';
export interface SSEEvent {
    type: SSEEventType;
    executionId: string;
    nodeId?: string;
    data: Record<string, unknown>;
    timestamp: string;
}
export interface NodeCatalogEntry {
    type: NodeType;
    label: string;
    category: NodeCategory;
    description: string;
    defaultConfig: Record<string, unknown>;
    inputs: number;
    outputs: number;
}
//# sourceMappingURL=flow.d.ts.map
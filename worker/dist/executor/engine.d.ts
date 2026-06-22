import type { FlowDefinition, SSEEvent, ExecutionStep } from 'core-agents-shared';
import { type ResolvedEndpoint } from '../providers/index.js';
export declare class HitlPauseError extends Error {
    nodeId: string;
    savedOutputs: Record<string, unknown>;
    buttons: Array<{
        label: string;
        value: string;
    }>;
    prompt: string;
    constructor(nodeId: string, savedOutputs: Record<string, unknown>, buttons?: Array<{
        label: string;
        value: string;
    }>, prompt?: string);
}
export declare class FlowStopError extends Error {
    nodeId: string;
    status: string;
    constructor(nodeId: string, message?: string, status?: string);
}
export type EventCallback = (nodeId: string, event: SSEEvent) => void | Promise<void>;
export interface ExecutionContext {
    getEndpoint?: (endpointId: string) => Promise<ResolvedEndpoint | null>;
    getMCPServer?: (serverId: string) => Promise<any>;
    getEmbeddingProvider?: (providerId: string) => Promise<{
        providerType: string;
        apiKey: string;
        baseUrl: string | null;
        model: string;
    } | null>;
    getVectorStore?: (storeId: string) => Promise<{
        name: string;
        url: string;
        apiKey: string | null;
    } | null>;
    searchSimilar?: (collectionName: string, queryEmbedding: number[], topK: number, minScore: number) => Promise<Array<{
        documentId: string;
        chunkText: string;
        chunkIndex: number;
        similarity: number;
    }>>;
    flowNodes?: Array<{
        id: string;
        type: string;
        data: any;
    }>;
    flowEdges?: Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle?: string | null;
        targetHandle?: string | null;
    }>;
}
export declare class FlowExecutor {
    private abortController;
    constructor();
    abort(): void;
    execute(flow: FlowDefinition, input: Record<string, unknown>, onEvent: EventCallback, context: ExecutionContext, options?: {
        replayFrom?: string;
        replayOutputs?: Record<string, unknown>;
        inputOverride?: Record<string, unknown>;
    }): Promise<{
        output: Record<string, unknown>;
        steps: ExecutionStep[];
    }>;
    private prepareInput;
    private executeNode;
}
//# sourceMappingURL=engine.d.ts.map
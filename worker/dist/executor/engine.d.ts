import type { FlowDefinition, SSEEvent, ExecutionStep } from 'core-agents-shared';
import { type ResolvedEndpoint } from '../providers/index.js';
export type EventCallback = (nodeId: string, event: SSEEvent) => void | Promise<void>;
export interface ExecutionContext {
    getEndpoint: (endpointId: string) => Promise<ResolvedEndpoint | null>;
    getMCPServer?: (serverId: string) => Promise<any>;
}
export declare class FlowExecutor {
    private abortController;
    constructor();
    abort(): void;
    execute(flow: FlowDefinition, input: Record<string, unknown>, onEvent: EventCallback, context: ExecutionContext): Promise<{
        output: Record<string, unknown>;
        steps: ExecutionStep[];
    }>;
    private prepareInput;
    private executeNode;
}
//# sourceMappingURL=engine.d.ts.map
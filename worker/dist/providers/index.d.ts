import { type LLMResponse, type ToolDefinition } from './anthropic.js';
export interface LLMCallParams {
    endpointId: string;
    model: string;
    systemPrompt: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    temperature: number;
    maxTokens: number;
    onToken?: (token: string) => void;
    responseFormat?: 'text' | 'json_object';
    outputSchema?: string;
    tools?: ToolDefinition[];
    signal?: AbortSignal;
}
export interface ResolvedEndpoint {
    providerType: 'anthropic' | 'openai' | 'litellm';
    apiKey: string;
    baseUrl: string | null;
}
export type { LLMResponse, ToolDefinition };
export declare function callLLM(params: LLMCallParams, endpoint: ResolvedEndpoint): Promise<LLMResponse>;
//# sourceMappingURL=index.d.ts.map
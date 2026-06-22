import type { ToolDefinition, LLMResponse } from './anthropic.js';
export interface OpenAICallParams {
    apiKey: string;
    baseUrl?: string;
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
export { type ToolDefinition, type LLMResponse };
export declare function callOpenAICompatible(params: OpenAICallParams): Promise<LLMResponse>;
//# sourceMappingURL=openai-compatible.d.ts.map
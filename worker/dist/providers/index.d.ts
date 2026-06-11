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
}
export interface ResolvedEndpoint {
    providerType: 'anthropic' | 'openai' | 'litellm';
    apiKey: string;
    baseUrl: string | null;
}
export declare function callLLM(params: LLMCallParams, endpoint: ResolvedEndpoint): Promise<string>;
//# sourceMappingURL=index.d.ts.map
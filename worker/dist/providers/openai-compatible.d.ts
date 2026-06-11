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
}
export declare function callOpenAICompatible(params: OpenAICallParams): Promise<string>;
//# sourceMappingURL=openai-compatible.d.ts.map
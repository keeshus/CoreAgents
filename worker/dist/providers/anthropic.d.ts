export interface AnthropicCallParams {
    apiKey: string;
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
export declare function callAnthropic(params: AnthropicCallParams): Promise<string>;
//# sourceMappingURL=anthropic.d.ts.map
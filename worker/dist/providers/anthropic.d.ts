export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
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
    responseFormat?: 'text' | 'json_object';
    outputSchema?: string;
    tools?: ToolDefinition[];
    signal?: AbortSignal;
}
export interface LLMResponse {
    text: string;
    toolCalls?: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
    }>;
}
export declare function callAnthropic(params: AnthropicCallParams): Promise<LLMResponse>;
//# sourceMappingURL=anthropic.d.ts.map
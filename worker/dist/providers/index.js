import { callAnthropic } from './anthropic.js';
import { callOpenAICompatible } from './openai-compatible.js';
export async function callLLM(params, endpoint) {
    switch (endpoint.providerType) {
        case 'anthropic':
            return callAnthropic({
                apiKey: endpoint.apiKey,
                model: params.model,
                systemPrompt: params.systemPrompt,
                messages: params.messages,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                onToken: params.onToken,
                responseFormat: params.responseFormat,
                outputSchema: params.outputSchema,
                tools: params.tools,
                signal: params.signal,
            });
        case 'openai':
        case 'litellm':
            return callOpenAICompatible({
                apiKey: endpoint.apiKey,
                baseUrl: endpoint.baseUrl || undefined,
                model: params.model,
                systemPrompt: params.systemPrompt,
                messages: params.messages,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                onToken: params.onToken,
                responseFormat: params.responseFormat,
                outputSchema: params.outputSchema,
                tools: params.tools,
                signal: params.signal,
            });
        default:
            throw new Error(`Unknown provider type: ${endpoint.providerType}`);
    }
}
//# sourceMappingURL=index.js.map
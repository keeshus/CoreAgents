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
            });
        case 'openai':
            return callOpenAICompatible({
                apiKey: endpoint.apiKey,
                model: params.model,
                systemPrompt: params.systemPrompt,
                messages: params.messages,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                onToken: params.onToken,
            });
        case 'litellm':
            // LiteLLM uses OpenAI-compatible API at a custom base URL
            return callOpenAICompatible({
                apiKey: endpoint.apiKey,
                baseUrl: endpoint.baseUrl || undefined,
                model: params.model,
                systemPrompt: params.systemPrompt,
                messages: params.messages,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                onToken: params.onToken,
            });
        default:
            throw new Error(`Unknown provider type: ${endpoint.providerType}`);
    }
}
//# sourceMappingURL=index.js.map
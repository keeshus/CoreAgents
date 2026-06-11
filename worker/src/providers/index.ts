import { callAnthropic, type AnthropicCallParams } from './anthropic.js';
import { callOpenAICompatible, type OpenAICallParams } from './openai-compatible.js';

export interface LLMCallParams {
  endpointId: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  responseFormat?: 'text' | 'json_object';
  outputSchema?: string;
}

// The caller is responsible for looking up endpoint details from the DB
// and passing them via the provider/params fields.
export interface ResolvedEndpoint {
  providerType: 'anthropic' | 'openai' | 'litellm';
  apiKey: string;
  baseUrl: string | null;
}

export async function callLLM(params: LLMCallParams, endpoint: ResolvedEndpoint): Promise<string> {
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
      });
    default:
      throw new Error(`Unknown provider type: ${endpoint.providerType}`);
  }
}

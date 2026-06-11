import { callAnthropic, type AnthropicCallParams, type LLMResponse, type ToolDefinition } from './anthropic.js';
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
  tools?: ToolDefinition[];
}

export interface ResolvedEndpoint {
  providerType: 'anthropic' | 'openai' | 'litellm';
  apiKey: string;
  baseUrl: string | null;
}

export type { LLMResponse, ToolDefinition };

export async function callLLM(params: LLMCallParams, endpoint: ResolvedEndpoint): Promise<LLMResponse> {
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
      });
    default:
      throw new Error(`Unknown provider type: ${endpoint.providerType}`);
  }
}

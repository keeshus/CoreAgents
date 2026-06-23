import { callLLMGeneric, type ToolDefinition, type LLMResponse } from './provider.js';

export interface LLMCallParams {
  endpointId: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface ResolvedEndpoint {
  providerType: 'anthropic' | 'openai' | 'litellm';
  apiKey: string;
  baseUrl: string | null;
}

export type { LLMResponse, ToolDefinition };

export async function callLLM(params: LLMCallParams, endpoint: ResolvedEndpoint): Promise<LLMResponse> {
  return callLLMGeneric(
    {
      apiKey: endpoint.apiKey,
      baseUrl: endpoint.baseUrl || undefined,
      model: params.model,
      systemPrompt: params.systemPrompt,
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      onToken: params.onToken,
      tools: params.tools,
      signal: params.signal,
    },
    endpoint.providerType,
  );
}

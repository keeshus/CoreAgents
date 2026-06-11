export const PROVIDER_TYPES = ['anthropic', 'openai', 'litellm'] as const;
export type LLMProviderType = (typeof PROVIDER_TYPES)[number];

export interface LLMEndpoint {
  id: string;
  name: string;
  providerType: LLMProviderType;
  baseUrl: string | null;
  apiKey: string;
  defaultModel: string;
  models: string[];
  createdAt: string;
  updatedAt: string;
}

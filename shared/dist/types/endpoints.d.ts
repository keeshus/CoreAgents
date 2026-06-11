export declare const PROVIDER_TYPES: readonly ["anthropic", "openai", "litellm"];
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
//# sourceMappingURL=endpoints.d.ts.map
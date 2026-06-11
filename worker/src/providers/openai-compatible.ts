import OpenAI from 'openai';

export interface OpenAICallParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  responseFormat?: 'text' | 'json_object';
  outputSchema?: string;
}

export async function callOpenAICompatible(params: OpenAICallParams): Promise<string> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseUrl || undefined,
  });

  const systemMessage = params.systemPrompt
    ? [{ role: 'system' as const, content: params.systemPrompt }]
    : [];

  // Build request params with optional structured output
  const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: params.model,
    messages: [...systemMessage, ...params.messages.map(m => ({ role: m.role, content: m.content }))],
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  };

  // OpenAI native structured output
  if (params.responseFormat === 'json_object') {
    createParams.response_format = params.outputSchema
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'output',
            strict: true,
            schema: (() => { try { return JSON.parse(params.outputSchema!); } catch { return {}; } })(),
          },
        }
      : { type: 'json_object' };
  }

  if (params.onToken) {
    const stream = await client.chat.completions.create({
      ...createParams,
      stream: true,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullResponse += token;
        params.onToken(token);
      }
    }
    return fullResponse;
  }

  const response = await client.chat.completions.create(createParams);
  return response.choices[0]?.message?.content || '';
}

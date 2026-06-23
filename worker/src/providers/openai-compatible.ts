import OpenAI from 'openai';
import type { ToolDefinition, LLMResponse } from './anthropic.js';

export interface OpenAICallParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export { type ToolDefinition, type LLMResponse };

export async function callOpenAICompatible(params: OpenAICallParams): Promise<LLMResponse> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseUrl || undefined,
  });

  const systemMessage = params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : [];

  // Convert tools to OpenAI function format
  const openaiTools = params.tools?.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: params.model,
    messages: [...systemMessage, ...params.messages.map(m => ({ role: m.role, content: m.content }))],
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    tools: openaiTools,
    tool_choice: openaiTools?.length ? 'auto' : undefined,
  };

  if (params.onToken) {
    const stream = await client.chat.completions.create({
      ...createParams,
      stream: true,
    });

    let fullResponse = '';
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullResponse += delta.content;
        params.onToken(delta.content);
      }
      // Accumulate tool calls from streaming
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
          }
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    const toolCalls = Array.from(toolCallMap.values()).map(tc => ({
      id: tc.id,
      name: tc.name,
      input: (() => { try { return JSON.parse(tc.args); } catch { return {}; } })(),
    }));

    return { text: fullResponse, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  const response = await client.chat.completions.create(createParams);
  const msg = response.choices[0]?.message;

  const toolCalls = msg?.tool_calls?.filter(tc => tc.type === 'function').map(tc => ({
    id: tc.id,
    name: (tc as any).function?.name || '',
    input: (() => { try { return JSON.parse((tc as any).function?.arguments); } catch { return {}; } })(),
  }));

  return {
    text: msg?.content || '',
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
  };
}

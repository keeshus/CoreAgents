import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export interface LLMCallParams {
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

// ── Adapter interface ─────────────────────────────────────────────

interface ProviderAdapter {
  createClient(params: LLMCallParams): any;
  buildRequest(params: LLMCallParams): any;
  streamResponse(client: any, request: any): AsyncIterable<{ text?: string; toolCalls?: Array<{ index: number; id?: string; name?: string; args?: string }> }>;
  nonStreamResponse(client: any, request: any): Promise<LLMResponse>;
}

// ── OpenAI ─────────────────────────────────────────────────────────

const openaiAdapter: ProviderAdapter = {
  createClient(params) {
    return new OpenAI({ apiKey: params.apiKey, baseURL: params.baseUrl || undefined });
  },
  buildRequest(params) {
    return {
      model: params.model,
      messages: [
        ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
        ...params.messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      tools: params.tools?.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      tool_choice: params.tools?.length ? 'auto' : undefined,
    };
  },
  async *streamResponse(client, request) {
    const stream = await client.chat.completions.create({ ...request, stream: true });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      yield {
        text: delta?.content,
        toolCalls: delta?.tool_calls?.map((tc: any) => ({
          index: tc.index, id: tc.id, name: tc.function?.name, args: tc.function?.arguments,
        })),
      };
    }
  },
  async nonStreamResponse(client, request) {
    const response = await client.chat.completions.create(request);
    const msg = response.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls?.filter((tc: any) => tc.type === 'function').map((tc: any) => ({
      id: tc.id, name: tc.function?.name || '',
      input: (() => { try { return JSON.parse(tc.function?.arguments); } catch { return {}; } })(),
    }));
    return { text: msg?.content || '', toolCalls: toolCalls?.length ? toolCalls : undefined };
  },
};

// ── Anthropic ──────────────────────────────────────────────────────

const anthropicAdapter: ProviderAdapter = {
  createClient(params) {
    return new Anthropic({ apiKey: params.apiKey });
  },
  buildRequest(params) {
    return {
      model: params.model,
      system: params.systemPrompt ? [{ type: 'text' as const, text: params.systemPrompt }] : undefined,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      tools: params.tools?.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    };
  },
  async *streamResponse(client, request) {
    const stream = await client.messages.create({ ...request, stream: true });
    let currentTool: { id: string; name: string; args: string } | null = null;
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        currentTool = { id: event.content_block.id, name: event.content_block.name, args: '' };
        yield { toolCalls: [{ index: 0, id: event.content_block.id, name: event.content_block.name }] };
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta' && currentTool) {
        currentTool.args += event.delta.partial_json;
        yield { toolCalls: [{ index: 0, args: event.delta.partial_json }] };
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { text: event.delta.text };
      }
    }
  },
  async nonStreamResponse(client, request) {
    const response = await client.messages.create(request);
    const text = response.content
      .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const toolCalls = response.content
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));
    return { text, toolCalls: toolCalls.length ? toolCalls : undefined };
  },
};

// ── Registry ───────────────────────────────────────────────────────

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  litellm: openaiAdapter,
  anthropic: anthropicAdapter,
};

// ── Generic caller ─────────────────────────────────────────────────

export async function callLLMGeneric(params: LLMCallParams, providerType: string): Promise<LLMResponse> {
  const adapter = adapters[providerType];
  if (!adapter) throw new Error(`Unknown provider type: ${providerType}`);

  const client = adapter.createClient(params);
  const request = adapter.buildRequest(params);

  if (params.onToken) {
    const stream = adapter.streamResponse(client, request);
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    let fullText = '';

    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        params.onToken(chunk.text);
      }
      if (chunk.toolCalls) {
        for (const tc of chunk.toolCalls) {
          if (!toolCallMap.has(tc.index)) toolCallMap.set(tc.index, { id: tc.id || '', name: tc.name || '', args: '' });
          const entry = toolCallMap.get(tc.index)!;
          if (tc.id) entry.id = tc.id;
          if (tc.name) entry.name = tc.name;
          if (tc.args) entry.args += tc.args;
        }
      }
    }

    const toolCalls = Array.from(toolCallMap.values()).map(tc => ({
      id: tc.id, name: tc.name,
      input: (() => { try { return JSON.parse(tc.args); } catch { return {}; } })(),
    }));
    return { text: fullText, toolCalls: toolCalls.length ? toolCalls : undefined };
  }

  return adapter.nonStreamResponse(client, request);
}

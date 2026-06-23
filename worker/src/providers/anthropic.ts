import Anthropic from '@anthropic-ai/sdk';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export async function callAnthropic(params: AnthropicCallParams): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey: params.apiKey });

  const systemMessages = params.systemPrompt
    ? [{ type: 'text' as const, text: params.systemPrompt }]
    : undefined;

  // Convert tools to Anthropic format
  const anthropicTools = params.tools?.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as any,
  }));

  if (params.onToken) {
    const stream = await client.messages.create({
      model: params.model,
      system: systemMessages,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      tools: anthropicTools,
      stream: true,
    });

    let fullResponse = '';
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let currentToolUse: { id: string; name: string; input: string } | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        currentToolUse = {
          id: event.content_block.id,
          name: event.content_block.name,
          input: '',
        };
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta' && currentToolUse) {
        currentToolUse.input += event.delta.partial_json;
      }
      if (event.type === 'content_block_stop' && currentToolUse) {
        try {
          toolCalls.push({
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: JSON.parse(currentToolUse.input),
          });
        } catch {
          toolCalls.push({
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: {},
          });
        }
        currentToolUse = null;
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullResponse += event.delta.text;
        params.onToken(event.delta.text);
      }
    }

    return { text: fullResponse, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  // Non-streaming
  const response = await client.messages.create({
    model: params.model,
    system: systemMessages,
    messages: params.messages.map(m => ({ role: m.role, content: m.content })),
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    tools: anthropicTools,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(b => b.text)
    .join('\n');

  const toolCalls = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

  return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

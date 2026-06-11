import Anthropic from '@anthropic-ai/sdk';

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature: number;
  maxTokens: number;
  onToken?: (token: string) => void;
  responseFormat?: 'text' | 'json_object';
  outputSchema?: string;
}

export async function callAnthropic(params: AnthropicCallParams): Promise<string> {
  const client = new Anthropic({ apiKey: params.apiKey });

  // Build system prompt with optional JSON schema
  let fullSystemPrompt = params.systemPrompt || '';
  if (params.responseFormat === 'json_object') {
    fullSystemPrompt += '\n\nYou MUST respond with valid JSON only. No other text.';
    if (params.outputSchema) {
      fullSystemPrompt += `\n\nUse this JSON schema:\n${params.outputSchema}`;
    }
  }

  const systemMessages = fullSystemPrompt
    ? [{ type: 'text' as const, text: fullSystemPrompt }]
    : undefined;

  if (params.onToken) {
    const stream = await client.messages.create({
      model: params.model,
      system: systemMessages,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: true,
    });

    let fullResponse = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullResponse += event.delta.text;
        params.onToken(event.delta.text);
      }
    }
    return fullResponse;
  }

  const response = await client.messages.create({
    model: params.model,
    system: systemMessages,
    messages: params.messages.map(m => ({ role: m.role, content: m.content })),
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(b => b.text)
    .join('\n');
}

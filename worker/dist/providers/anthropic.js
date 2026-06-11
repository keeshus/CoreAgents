import Anthropic from '@anthropic-ai/sdk';
export async function callAnthropic(params) {
    const client = new Anthropic({ apiKey: params.apiKey });
    // Convert system prompt to system message
    const systemMessages = params.systemPrompt
        ? [{ type: 'text', text: params.systemPrompt }]
        : undefined;
    if (params.onToken) {
        // Streaming
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
    // Non-streaming
    const response = await client.messages.create({
        model: params.model,
        system: systemMessages,
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
        temperature: params.temperature,
        max_tokens: params.maxTokens,
    });
    return response.content
        .filter((block) => block.type === 'text')
        .map(b => b.text)
        .join('\n');
}
//# sourceMappingURL=anthropic.js.map
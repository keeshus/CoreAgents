import OpenAI from 'openai';
export async function callOpenAICompatible(params) {
    const client = new OpenAI({
        apiKey: params.apiKey,
        baseURL: params.baseUrl || undefined,
    });
    const systemMessage = params.systemPrompt
        ? [{ role: 'system', content: params.systemPrompt }]
        : [];
    if (params.onToken) {
        const stream = await client.chat.completions.create({
            model: params.model,
            messages: [...systemMessage, ...params.messages.map(m => ({ role: m.role, content: m.content }))],
            temperature: params.temperature,
            max_tokens: params.maxTokens,
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
    const response = await client.chat.completions.create({
        model: params.model,
        messages: [...systemMessage, ...params.messages.map(m => ({ role: m.role, content: m.content }))],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
    });
    return response.choices[0]?.message?.content || '';
}
//# sourceMappingURL=openai-compatible.js.map
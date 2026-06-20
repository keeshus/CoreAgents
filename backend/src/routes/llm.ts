import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { llmEndpoints } from '../db/schema.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(authenticate);

// POST /api/llm/chat — SSE-streamed chat with an LLM (for Co-Pilot assistant)
router.post('/chat', requirePermission('flow:create'), asyncHandler(async (req, res) => {
  const { endpointId, messages, tools, systemPrompt } = req.body || {};

  if (!endpointId) { res.status(400).json({ error: 'endpointId is required' }); return; }
  if (!messages || !Array.isArray(messages)) { res.status(400).json({ error: 'messages array is required' }); return; }
  if (messages.length > 50) { res.status(400).json({ error: 'Too many messages' }); return; }

  const [endpoint] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
  if (!endpoint) { res.status(404).json({ error: 'Endpoint not found' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitSSE = (data: any) => {
    try { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const resolvedEndpoint = {
    providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
    apiKey: endpoint.api_key,
    baseUrl: endpoint.base_url,
  };

  const chatMessages = messages.map((m: any) => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.role === 'tool' ? `Tool result (${m.name}): ${m.content}` : m.content,
  }));

  try {
    const { callLLM } = await import('../../../worker/src/providers/index.js');
    const response = await callLLM(
      {
        endpointId,
        model: endpoint.default_model,
        systemPrompt: systemPrompt || 'You are a helpful AI assistant.',
        messages: chatMessages,
        temperature: 0.7,
        maxTokens: 4096,
        onToken: (token: string) => emitSSE({ type: 'token', content: token }),
        tools: tools || undefined,
      },
      resolvedEndpoint,
    );

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        emitSSE({ type: 'tool_call', id: tc.id, name: tc.name, input: tc.input });
      }
    }

    emitSSE({ type: 'done' });
  } catch (err: any) {
    emitSSE({ type: 'error', message: err.message });
  }

  res.end();
}));

export default router;

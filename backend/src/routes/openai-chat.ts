import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, chatSessions, chatMessages, chatApiKeys, chatApiDeployments, llmEndpoints, mcpServers, embeddingProviders, vectorStores, groups, agentContexts, agentStore } from '../db/schema.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse, OpenAIChatCompletionChunk } from 'core-agents-shared';

// Augment Express Request for custom properties set by our middleware
declare module 'express' {
  interface Request {
    chatFlowId?: string;
    chatApiDeployment?: typeof chatApiDeployments.$inferSelect;
    chatApiKey?: typeof chatApiKeys.$inferSelect;
  }
}

const router = Router();

function generateId(): string {
  return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  return `ca_${crypto.randomBytes(32).toString('hex')}`;
}

// ── Auth middleware: extract API key from Bearer token ─────
async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <api-key>' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'API key is required' });
    return;
  }

  const keyHash = hashApiKey(token);
  const [keyRecord] = await db.select().from(chatApiKeys).where(eq(chatApiKeys.key_hash, keyHash)).limit(1);
  if (!keyRecord || !keyRecord.enabled) {
    res.status(401).json({ error: 'Invalid or disabled API key' });
    return;
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    res.status(401).json({ error: 'API key has expired' });
    return;
  }

  // Update last_used_at
  await db.update(chatApiKeys).set({ last_used_at: new Date() }).where(eq(chatApiKeys.id, keyRecord.id));

  // Check deployment
  const [deployment] = await db.select().from(chatApiDeployments).where(
    and(eq(chatApiDeployments.flow_id, keyRecord.flow_id), eq(chatApiDeployments.enabled, true))
  );
  if (!deployment) {
    res.status(400).json({ error: 'Chat API is not enabled for this flow' });
    return;
  }

  req.chatApiKey = keyRecord;
  req.chatApiDeployment = deployment;
  req.chatFlowId = keyRecord.flow_id;
  next();
}

// POST /v1/chat/completions — OpenAI-compatible chat endpoint
router.post('/v1/chat/completions', authenticateApiKey, asyncHandler(async (req, res) => {
  const body = req.body as OpenAIChatCompletionRequest;
  const flowId = req.chatFlowId!;
  const deployment = req.chatApiDeployment!;

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  if (body.messages.length > 100) {
    res.status(400).json({ error: 'Too many messages (max 100)' });
    return;
  }

  // Validate model if provided in request
  if (body.model && body.model !== deployment.model_name) {
    res.status(400).json({ error: `Model "${body.model}" is not supported. Available model: "${deployment.model_name}"` });
    return;
  }

  // Load flow
  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
  if (!flow) {
    res.status(404).json({ error: 'Flow not found' });
    return;
  }

  // Verify it's a chat-triggered flow
  const nodes = (flow.nodes || []) as Array<{ type: string; data: { type: string; config: Record<string, unknown> } }>;
  const triggerNode = nodes.find(n => n.data?.type === 'trigger');
  if (!triggerNode || (triggerNode.data as any).config?.triggerType !== 'chat') {
    res.status(400).json({ error: 'Flow must have a chat trigger type' });
    return;
  }

  // Extract system message and conversation history from OpenAI format
  const systemMessages = body.messages.filter(m => m.role === 'system');
  const conversationMessages = body.messages.filter(m => m.role !== 'system');
  const systemPrompt = systemMessages.map(m => m.content).join('\n');

  // Build history for the executor
  const historyMessages = conversationMessages.map(m => ({
    role: m.role === 'tool' ? 'user' : m.role as 'user' | 'assistant',
    content: m.role === 'tool'
      ? `Tool result${m.name ? ` (${m.name})` : ''}: ${m.content}`
      : m.content,
  }));

  // Create a transient chat session
  const [session] = await db.insert(chatSessions).values({
    flow_id: flowId,
    title: 'OpenAI API Call',
  }).returning();

  // Save user messages to the session (but not system messages)
  for (const msg of conversationMessages) {
    await db.insert(chatMessages).values({
      session_id: session.id,
      role: msg.role === 'tool' ? 'user' : msg.role as 'user' | 'assistant',
      content: msg.role === 'tool'
        ? `Tool result${msg.name ? ` (${msg.name})` : ''}: ${msg.content}`
        : msg.content,
    }).returning();
  }

  // Get the last user message for the input
  const lastUserMessage = [...conversationMessages].reverse().find(m => m.role === 'user');
  const message = lastUserMessage?.content || '';

  // Build execution context
  const executionContext = {
    getEndpoint: async (endpointId: string) => {
      const [endpoint] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
      if (!endpoint) return null;
      if (endpoint.group_id && endpoint.group_id !== flow.group_id) return null;
      return {
        providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
        apiKey: endpoint.api_key,
        baseUrl: endpoint.base_url,
      };
    },
    getMCPServer: async (serverId: string) => {
      const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
      if (!server) return null;
      if (server.group_id && server.group_id !== flow.group_id) return null;
      return {
        id: server.id,
        name: server.name,
        url: server.url,
        tools: server.tools as any[],
        enabled: server.enabled,
      };
    },
    getEmbeddingProvider: async (providerId: string) => {
      const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
      if (!ep) return null;
      if (ep.group_id && ep.group_id !== flow.group_id) return null;
      return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
    },
    getVectorStore: async (storeId: string) => {
      const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
      if (!vs) return null;
      if (vs.group_id && vs.group_id !== flow.group_id) return null;
      return { name: vs.name, url: vs.url, apiKey: vs.api_key };
    },
    flowNodes: flow.nodes as any[],
    flowEdges: flow.edges as any[],
    searchSimilar: async (_collectionName: string, _queryEmbedding: number[], _topK: number, _minScore: number) => [],
    getGlobalContext: async () => {
      const [row] = await db.select().from(agentStore).where(eq(agentStore.key, 'global_context')).limit(1);
      return (row?.value as string) || '';
    },
    getGroupContext: async (groupId: string) => {
      if (!groupId) return '';
      const [row] = await db.select({ context: groups.context }).from(groups).where(eq(groups.id, groupId)).limit(1);
      return row?.context || '';
    },
    getAgentContexts: async (contextIds: string[]) => {
      if (!contextIds?.length) return [];
      const rows = await db.select().from(agentContexts).where(inArray(agentContexts.id, contextIds));
      return rows.map(r => ({ title: r.title, content: r.content }));
    },
  };

  const { FlowExecutor } = await import('../../../worker/src/executor/engine.js');
  const executor = new FlowExecutor();

  const isStream = body.stream === true;

  if (isStream) {
    // SSE streaming response (OpenAI-compatible chunks)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const chatId = generateId();
    const created = Math.floor(Date.now() / 1000);

    // Initial chunk with role
    const initialChunk: OpenAIChatCompletionChunk = {
      id: chatId,
      object: 'chat.completion.chunk',
      created,
      model: deployment.model_name,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    };
    res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

    req.on('close', () => executor.abort());

    try {
      const result = await executor.execute(
        {
          id: flow.id,
          name: flow.name,
          description: flow.description || '',
          nodes: flow.nodes as any[],
          edges: flow.edges as any[],
          version: flow.version,
          createdAt: flow.created_at?.toISOString() || '',
          updatedAt: flow.updated_at?.toISOString() || '',
          flowContext: flow.flow_context || '',
          groupId: flow.group_id || undefined,
        },
        { chat_input: { message, history: historyMessages }, message, history: historyMessages },
        async () => {},
        executionContext,
      );

      // Extract output
      const outputNodes = (flow.nodes as any[]).filter((n: any) => n.data?.type === 'output');
      let outputNodeResult: any = null;
      for (const node of outputNodes) {
        const label = node.data?.label || '';
        const slugLabel = label.toLowerCase().replace(/[\s.]+/g, '_');
        const val = (result.output as any)?.[node.id] ?? (result.output as any)?.[slugLabel] ?? null;
        if (val !== null && val !== undefined) {
          const isSkipped = typeof val === 'object' && val !== null && val.skipped === true;
          if (!isSkipped) { outputNodeResult = val; break; }
        }
      }
      if (!outputNodeResult && outputNodes.length > 0) {
        for (const node of outputNodes) {
          const label = node.data?.label || '';
          const slugLabel = label.toLowerCase().replace(/[\s.]+/g, '_');
          const val = (result.output as any)?.[node.id] || (result.output as any)?.[slugLabel] || null;
          if (val) { outputNodeResult = val; break; }
        }
      }

      const assistantContent = typeof outputNodeResult === 'string'
        ? outputNodeResult
        : outputNodeResult && typeof outputNodeResult === 'object'
          ? JSON.stringify(outputNodeResult)
          : String(outputNodeResult || result.output || '');

      // Stream content tokens (simulated as complete for now)
      if (assistantContent) {
        const contentChunk: OpenAIChatCompletionChunk = {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: deployment.model_name,
          choices: [{ index: 0, delta: { content: assistantContent }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
      }

      // Final chunk with finish reason
      const finalChunk: OpenAIChatCompletionChunk = {
        id: chatId,
        object: 'chat.completion.chunk',
        created,
        model: deployment.model_name,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');

      // Save assistant message
      await db.insert(chatMessages).values({
        session_id: session.id,
        role: 'assistant',
        content: assistantContent,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const errorChunk: OpenAIChatCompletionChunk = {
        id: chatId,
        object: 'chat.completion.chunk',
        created,
        model: deployment.model_name,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
    }

    res.end();
  } else {
    // Non-streaming JSON response
    try {
      const result = await executor.execute(
        {
          id: flow.id,
          name: flow.name,
          description: flow.description || '',
          nodes: flow.nodes as any[],
          edges: flow.edges as any[],
          version: flow.version,
          createdAt: flow.created_at?.toISOString() || '',
          updatedAt: flow.updated_at?.toISOString() || '',
          flowContext: flow.flow_context || '',
          groupId: flow.group_id || undefined,
        },
        { chat_input: { message, history: historyMessages }, message, history: historyMessages },
        async () => {},
        executionContext,
      );

      // Extract output
      const outputNodes = (flow.nodes as any[]).filter((n: any) => n.data?.type === 'output');
      let outputNodeResult: any = null;
      for (const node of outputNodes) {
        const label = node.data?.label || '';
        const slugLabel = label.toLowerCase().replace(/[\s.]+/g, '_');
        const val = (result.output as any)?.[node.id] ?? (result.output as any)?.[slugLabel] ?? null;
        if (val !== null && val !== undefined) {
          const isSkipped = typeof val === 'object' && val !== null && val.skipped === true;
          if (!isSkipped) { outputNodeResult = val; break; }
        }
      }
      if (!outputNodeResult && outputNodes.length > 0) {
        for (const node of outputNodes) {
          const label = node.data?.label || '';
          const slugLabel = label.toLowerCase().replace(/[\s.]+/g, '_');
          const val = (result.output as any)?.[node.id] || (result.output as any)?.[slugLabel] || null;
          if (val) { outputNodeResult = val; break; }
        }
      }

      const assistantContent = typeof outputNodeResult === 'string'
        ? outputNodeResult
        : outputNodeResult && typeof outputNodeResult === 'object'
          ? JSON.stringify(outputNodeResult)
          : String(outputNodeResult || result.output || '');

      // Save assistant message
      await db.insert(chatMessages).values({
        session_id: session.id,
        role: 'assistant',
        content: assistantContent,
      });

      const chatId = generateId();
      const created = Math.floor(Date.now() / 1000);

      const response: OpenAIChatCompletionResponse = {
        id: chatId,
        object: 'chat.completion',
        created,
        model: deployment.model_name,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: assistantContent },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: body.messages.reduce((acc, m) => acc + m.content.length, 0),
          completion_tokens: assistantContent.length,
          total_tokens: body.messages.reduce((acc, m) => acc + m.content.length, 0) + assistantContent.length,
        },
      };

      res.json(response);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error });
    }
  }
}));

export { router as default, generateApiKey, hashApiKey };

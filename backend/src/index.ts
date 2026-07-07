// Suppress noisy dependency deprecation warnings (e.g. openid-client url.parse)
process.noDeprecation = true;

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import flowsRouter from './routes/flows.js';
import catalogRouter from './routes/catalog.js';
import llmEndpointsRouter from './routes/llm-endpoints.js';
import mcpServersRouter from './routes/mcp-servers.js';
import executionRouter from './routes/execution.js';
import documentsRouter from './routes/documents.js';
import chatRouter from './routes/chat.js';
import webhookRouter from './routes/webhook.js';
import knowledgeRouter from './routes/knowledge.js';
import vectorStoresRouter from './routes/vector-stores.js';
import embeddingProvidersRouter from './routes/embedding-providers.js';
import authRouter from './routes/auth.js';
import llmChatRouter from './routes/llm.js';
import assignmentsRouter from './routes/assignments.js';
import adminRouter from './routes/admin.js';
import agentContextsRouter from './routes/agent-contexts.js';
import groupsRouter from './routes/groups.js';
import ssoConfigRouter from './routes/sso-config.js';
import settingsRouter from './routes/settings.js';
import secretsRouter from './routes/secrets.js';
import secretVaultsRouter from './routes/secret-vaults.js';
import envVarsRouter from './routes/env-vars.js';
import groupVaultConfigRouter from './routes/group-vault-config.js';
import webhookOpenapiRouter from './routes/webhook-openapi.js';
import webhookApiKeysRouter from './routes/webhook-api-keys.js';
import openaiChatRouter from './routes/openai-chat.js';
import chatApiKeysRouter from './routes/chat-api-keys.js';
import { authenticate } from './middleware/auth.js';
import { asyncHandler } from './utils/async-handler.js';
import { logger } from './utils/logger.js';

// ── Process-level crash handlers ──────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ reason: err }, 'Uncaught exception');
  process.exit(1);
});

const app = express();
const port = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Body type guard: reject non-object JSON bodies
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-type']?.includes('application/json')) {
    if (req.body === undefined || req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'Request body must be a JSON object' });
      return;
    }
  }
  next();
});

// Health check
app.get(
  '/api/health',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'ok', project: 'Core Agents' });
  }),
);

// Webhook OpenAPI endpoints (public — authenticated by API key or webhook secret)
// Must be mounted before webhookRouter to take precedence for slug-based routes
app.use('/api', webhookOpenapiRouter);

// Webhook (public — authenticated by secret, not JWT)
app.use('/api', webhookRouter);

// OpenAI-compatible chat endpoint (public — authenticated by API key)
app.use('/', openaiChatRouter);

// Public auth routes (no authentication required)
app.use('/api/auth', authRouter);

// Protected routes (authentication required)
app.use('/api/flows', authenticate, flowsRouter);
app.use('/api/catalog', authenticate, catalogRouter);
app.use('/api/llm', authenticate, llmChatRouter); // Handles /api/llm/chat
app.use('/api/llm-endpoints', authenticate, llmEndpointsRouter);
app.use('/api/mcp-servers', authenticate, mcpServersRouter);
app.use('/api', authenticate, executionRouter);  // Handles /api/flows/:flowId/execute and /api/flows/:flowId/executions
app.use('/api', authenticate, documentsRouter);  // Handles /api/documents/*
app.use('/api', authenticate, chatRouter);       // Handles /api/chat/*
app.use('/api', authenticate, knowledgeRouter); // Handles /api/knowledge/*
app.use('/api', authenticate, embeddingProvidersRouter); // Handles /api/embedding-providers/*
app.use('/api', authenticate, vectorStoresRouter); // Handles /api/vector-stores/*
app.use('/api', authenticate, assignmentsRouter); // Handles /api/assignments/*
app.use('/api', authenticate, adminRouter); // Handles /api/users/* and /api/roles/*
app.use('/api/agent-contexts', authenticate, agentContextsRouter);
app.use('/api/groups', authenticate, groupsRouter);
app.use('/api/admin/sso-config', authenticate, ssoConfigRouter);
app.use('/api/settings', authenticate, settingsRouter);
app.use('/api/secrets', authenticate, secretsRouter);
app.use('/api/secret-vaults', authenticate, secretVaultsRouter);
app.use('/api/group-vault-config', authenticate, groupVaultConfigRouter);
app.use('/api/env-vars', authenticate, envVarsRouter);
app.use('/api', authenticate, webhookApiKeysRouter); // Handles /api/flows/:flowId/keys/* and /api/flows/:flowId/deployment
app.use('/api', authenticate, chatApiKeysRouter); // Handles /api/flows/:flowId/chat-api/*

// Global error handler (Express 5)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { message: err.message } : {}),
  });
});

app.listen(port, () => {
  logger.info({ port }, 'Backend started');
});

export default app;

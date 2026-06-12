import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
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
import { asyncHandler } from './utils/async-handler.js';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get(
  '/api/health',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'ok', project: 'Core Agents' });
  }),
);

// Mount routes
app.use('/api/flows', flowsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/llm-endpoints', llmEndpointsRouter);
app.use('/api/mcp-servers', mcpServersRouter);
app.use('/api', executionRouter);  // Handles /api/flows/:flowId/execute and /api/flows/:flowId/executions
app.use('/api', documentsRouter);  // Handles /api/documents/*
app.use('/api', chatRouter);       // Handles /api/chat/*
app.use('/api', webhookRouter);   // Handles /api/webhook/*
app.use('/api', knowledgeRouter); // Handles /api/knowledge/*
app.use('/api', embeddingProvidersRouter); // Handles /api/embedding-providers/*
app.use('/api', vectorStoresRouter); // Handles /api/vector-stores/*

// Global error handler (Express 5)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});

export default app;

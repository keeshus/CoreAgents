import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { executions, executionSteps, flows, llmEndpoints, mcpServers, embeddingProviders, vectorStores } from '../db/schema.js';
import { FlowExecutor, HitlPauseError } from '../../../worker/src/executor/engine.js';
import { getStore } from '../vector-stores/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { SSEEvent, FlowDefinition, ExecutionStep } from 'core-agents-shared';

const router = Router();

// In-memory registry of active executors for cancellation
const activeExecutors = new Map<string, FlowExecutor>();

// GET /api/executions — global list of all executions across all flows
router.get('/executions', asyncHandler(async (_req, res) => {
  const result = await db
    .select()
    .from(executions)
    .orderBy(desc(executions.created_at))
    .limit(100);
  res.json(result);
}));

// POST /api/executions/:executionId/cancel — cancel a running execution
router.post('/executions/:executionId/cancel', asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  // Abort in-process if available
  const executor = activeExecutors.get(executionId);
  if (executor) {
    executor.abort();
    activeExecutors.delete(executionId);
  }

  // Mark as cancelled in DB
  await db
    .update(executions)
    .set({ status: 'cancelled', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'cancelled' });
}));

// ── POST /api/flows/:flowId/execute — SSE-streamed execution ───────────────────

router.post(
  '/flows/:flowId/execute',
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const { input = {} } = req.body;

    // SSE headers ------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Helper to emit SSE data frames ------------------------------
    const emitSSE = (data: SSEEvent) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Load flow from DB ------------------------------------------
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) {
      emitSSE({
        type: 'execution.failed',
        executionId: '',
        data: { error: 'Flow not found' },
        timestamp: new Date().toISOString(),
      });
      res.end();
      return;
    }

    // Create execution record ------------------------------------
    const [exec] = await db
      .insert(executions)
      .values({
        flow_id: flowId,
        status: 'running',
        input,
        started_at: new Date(),
      })
      .returning();

    // Emit started event
    emitSSE({
      type: 'execution.started',
      executionId: exec.id,
      data: { flowId, flowName: flow.name },
      timestamp: new Date().toISOString(),
    });

    // Build execution context: resolve LLM endpoints from DB ------
    const executionContext = {
      getEndpoint: async (endpointId: string) => {
        const [endpoint] = await db
          .select()
          .from(llmEndpoints)
          .where(eq(llmEndpoints.id, endpointId));
        if (!endpoint) return null;
        return {
          providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
          apiKey: endpoint.api_key,
          baseUrl: endpoint.base_url ?? null,
        };
      },
      getMCPServer: async (serverId: string) => {
        const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
        if (!server) return null;
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
        return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
      },
      getVectorStore: async (storeId: string) => {
        const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
        if (!vs) return null;
        return { name: vs.name, url: vs.url, apiKey: vs.api_key };
      },
    };

    // Map Drizzle row (snake_case) to FlowDefinition (camelCase) BEFORE building context
    const flowDef: FlowDefinition = {
      id: flow.id,
      name: flow.name,
      description: flow.description || '',
      nodes: flow.nodes as any,
      edges: flow.edges as any,
      version: flow.version,
      createdAt: flow.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: flow.updated_at?.toISOString() || new Date().toISOString(),
    };

    // Add flowNodes/flowEdges to context now that flowDef exists
    executionContext.flowNodes = flowDef.nodes as any;
    executionContext.flowEdges = flowDef.edges as any;
    executionContext.searchSimilar = async (collectionName, queryEmbedding, topK, minScore) => {
      const store = getStore('qdrant') || getStore('pgvector');
      if (!store) return [];
      return store.search(collectionName, queryEmbedding, topK, minScore);
    };

    const executor = new FlowExecutor();
    activeExecutors.set(exec.id, executor);

    req.on('close', () => {
      executor.abort();
      activeExecutors.delete(exec.id);
    });

    try {
      const result = await executor.execute(
        flowDef,
        input as Record<string, unknown>,
        // onEvent: persist steps + stream to client ---------------
        async (nodeId, event) => {
          // Attach the execution ID (the engine sets it to '' initially)
          const richEvent: SSEEvent = {
            ...event,
            executionId: exec.id,
          };

          // Persist step lifecycle to the database
          const data = event.data;
          const resolvedNodeId = (data.nodeId as string) || nodeId;
          const resolvedNodeType = (data.nodeType as string) || '';

          if (event.type === 'step.started') {
            await db.insert(executionSteps).values({
              execution_id: exec.id,
              node_id: resolvedNodeId,
              node_type: resolvedNodeType,
              status: 'running',
              input: data.input as any,
              started_at: new Date(),
            });
          } else if (event.type === 'step.completed') {
            await db
              .update(executionSteps)
              .set({
                status: 'completed',
                output: data.output as any,
                completed_at: new Date(),
              })
              .where(
                and(
                  eq(executionSteps.execution_id, exec.id),
                  eq(executionSteps.node_id, resolvedNodeId),
                ),
              );
          } else if (event.type === 'step.failed') {
            await db
              .update(executionSteps)
              .set({
                status: 'failed',
                error: data.error as string,
                completed_at: new Date(),
              })
              .where(
                and(
                  eq(executionSteps.execution_id, exec.id),
                  eq(executionSteps.node_id, resolvedNodeId),
                ),
              );
          }

          // Stream event to the SSE client
          emitSSE(richEvent);
        },
        executionContext,
      );

      // Mark execution as completed in DB
      await db
        .update(executions)
        .set({
          status: 'completed',
          output: result.output as any,
          completed_at: new Date(),
        })
        .where(eq(executions.id, exec.id));

      activeExecutors.delete(exec.id);
      emitSSE({
        type: 'execution.completed',
        executionId: exec.id,
        data: { output: result.output },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      // Handle HITL pause — save partial outputs and await approval
      if (err instanceof HitlPauseError) {
        activeExecutors.delete(exec.id);
        // Extract what the user should see (displayFields)
        const hitlCfg = (flow.nodes as any[])?.find((n: any) => n.id === err.nodeId)?.data?.config || {};
        const displayFields: string[] = hitlCfg.displayFields || [];
        const lastOutput = Object.values(err.savedOutputs).pop() as Record<string, unknown> | undefined || {};
        const displayedContent: Record<string, unknown> = {};
        if (displayFields.length > 0) {
          for (const f of displayFields) { if (lastOutput[f] !== undefined) displayedContent[f] = lastOutput[f]; }
        } else { Object.assign(displayedContent, lastOutput); }

        await db
          .update(executions)
          .set({ status: 'awaiting_approval', output: { ...err.savedOutputs, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _hitlDisplayed: displayedContent } as any })
          .where(eq(executions.id, exec.id));

        emitSSE({
          type: 'execution.paused',
          executionId: exec.id,
          data: { nodeId: err.nodeId, savedOutputs: err.savedOutputs, buttons: err.buttons, prompt: err.prompt, message: 'Waiting for human approval' },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }

      const error = err instanceof Error ? err.message : String(err);
      console.error('Flow execution failed:', error);
      activeExecutors.delete(exec.id);

      await db
        .update(executions)
        .set({
          status: 'failed',
          error,
          completed_at: new Date(),
        })
        .where(eq(executions.id, exec.id));

      emitSSE({
        type: 'execution.failed',
        executionId: exec.id,
        data: { error },
        timestamp: new Date().toISOString(),
      });
    }

    res.end();
  }),
);

// ── POST /api/executions/:executionId/approve — approve HITL and resume flow ──

router.post('/executions/:executionId/approve', asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;
  const { feedback = '', decision = 'approved', data: userData = {} } = req.body || {};

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  // Load the flow
  const [flow] = await db.select().from(flows).where(eq(flows.id, exec.flow_id));
  if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

  // Find the HITL node
  const nodes = (flow.nodes || []) as any[];
  const hitlNode = nodes.find((n: any) => n.data?.type === 'hitl');
  if (!hitlNode) { res.status(400).json({ error: 'No HITL node in flow' }); return; }

  // Replay from the HITL node with user input merged
  const flowDef: FlowDefinition = {
    id: flow.id, name: flow.name, description: flow.description || '',
    nodes: flow.nodes as any, edges: flow.edges as any, version: flow.version,
    createdAt: flow.created_at?.toISOString() || '', updatedAt: flow.updated_at?.toISOString() || '',
  };

  const executionContext = {
    getEndpoint: async (endpointId: string) => {
      const [ep] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
      if (!ep) return null;
      return { providerType: ep.provider_type as 'anthropic' | 'openai' | 'litellm', apiKey: ep.api_key, baseUrl: ep.base_url };
    },
    getEmbeddingProvider: async (providerId: string) => {
      const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
      if (!ep) return null;
      return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
    },
    getVectorStore: async (storeId: string) => {
      const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
      if (!vs) return null;
      return { name: vs.name, url: vs.url, apiKey: vs.api_key };
    },
    flowNodes: flowDef.nodes as any,
    flowEdges: flowDef.edges as any,
  };

  const executor = new FlowExecutor();
  const savedOutputs = (exec.output || {}) as Record<string, unknown>;
  const mergedInput = { ...(exec.input || {}), _approved: true, _feedback: feedback, _decision: decision, ...userData };

  try {
    const result = await executor.execute(
      flowDef,
      mergedInput,
      async () => {}, // no SSE needed for replay
      executionContext,
      { replayFrom: hitlNode.id, replayOutputs: savedOutputs, inputOverride: mergedInput },
    );

    // Save as a new execution for history
    const [newExec] = await db.insert(executions).values({
      flow_id: exec.flow_id,
      status: 'completed',
      input: mergedInput,
      output: result.output as any,
      started_at: new Date(),
      completed_at: new Date(),
    }).returning();

    res.json({ status: 'completed', executionId: newExec.id, output: result.output });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    res.status(500).json({ status: 'failed', error });
  }
}));

// ── POST /api/executions/:executionId/reject — reject HITL ──────────────────────

router.post('/executions/:executionId/reject', asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  await db.update(executions)
    .set({ status: 'cancelled', error: 'Rejected by user', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'rejected' });
}));

// ── GET /api/flows/:flowId/executions — list past executions ───────────────────

router.get(
  '/flows/:flowId/executions',
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const result = await db
      .select()
      .from(executions)
      .where(eq(executions.flow_id, flowId))
      .orderBy(desc(executions.created_at));
    res.json(result);
  }),
);

// ── GET /api/flows/:flowId/executions/:executionId — execution with steps ──────

router.get(
  '/flows/:flowId/executions/:executionId',
  asyncHandler(async (req, res) => {
    const executionId = req.params.executionId as string;

    const [exec] = await db
      .select()
      .from(executions)
      .where(eq(executions.id, executionId));
    if (!exec) {
      res.status(404).json({ message: 'Execution not found' });
      return;
    }

    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.execution_id, executionId))
      .orderBy(executionSteps.started_at);

    res.json({ ...exec, steps });
  }),
);

export default router;

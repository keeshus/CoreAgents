import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { executions, executionSteps, flows, llmEndpoints, mcpServers } from '../db/schema.js';
import { FlowExecutor } from '../../../worker/src/executor/engine.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { SSEEvent, FlowDefinition, ExecutionStep } from 'core-agents-shared';

const router = Router();

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
    };

    const executor = new FlowExecutor();

    // Handle client disconnect: abort the executor ----------------
    req.on('close', () => {
      executor.abort();
    });

    // Map Drizzle row (snake_case) to FlowDefinition (camelCase) --
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

      emitSSE({
        type: 'execution.completed',
        executionId: exec.id,
        data: { output: result.output },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('Flow execution failed:', error);

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

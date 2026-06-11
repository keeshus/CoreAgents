import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, executions, executionSteps, llmEndpoints } from '../db/schema.js';
import { FlowExecutor } from '../../../worker/src/executor/engine.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { NodeData } from 'core-agents-shared';

const router = Router();

// POST /api/webhook/:flowId — trigger a flow via webhook
// Optionally pass ?secret=... for verification
router.post(
  '/webhook/:flowId',
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const providedSecret = (req.query.secret as string) || '';

    // Load flow
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    // Find trigger node and verify it's a webhook trigger
    const nodes = (flow.nodes || []) as Array<{ type: string; data: NodeData }>;
    const triggerNode = nodes.find(n => n.data?.type === 'trigger');
    if (!triggerNode || (triggerNode.data as any).config?.triggerType !== 'webhook') {
      res.status(400).json({ error: 'This flow does not have a webhook trigger' });
      return;
    }

    // Verify webhook secret if configured
    const secret = (triggerNode.data as any).config?.webhookSecret;
    if (secret && secret !== providedSecret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    const input = { ...req.body };
    if (req.headers['content-type']?.includes('text/plain')) {
      input.message = (req as any).body || '';
    }

    // Execute the flow (non-streaming — return result directly)
    const executionContext = {
      getEndpoint: async (endpointId: string) => {
        const [endpoint] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
        if (!endpoint) return null;
        return {
          providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
          apiKey: endpoint.api_key,
          baseUrl: endpoint.base_url,
        };
      },
    };

    const executor = new FlowExecutor();

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
        },
        input,
        async (nodeId, event) => {
          // Persist step to DB (non-streaming context)
          const d = event.data;
          const nid = (d.nodeId as string) || nodeId;
          const ntype = (d.nodeType as string) || '';
          if (event.type === 'step.started') {
            await db.insert(executionSteps).values({
              execution_id: '',
              node_id: nid,
              node_type: ntype,
              status: 'running',
              input: d.input as any,
              started_at: new Date(),
            });
          } else if (event.type === 'step.completed') {
            await db.insert(executionSteps).values({
              execution_id: '',
              node_id: nid,
              node_type: ntype,
              status: 'completed',
              output: d.output as any,
              completed_at: new Date(),
            });
          } else if (event.type === 'step.failed') {
            await db.insert(executionSteps).values({
              execution_id: '',
              node_id: nid,
              node_type: ntype,
              status: 'failed',
              error: d.error as string,
              completed_at: new Date(),
            });
          }
        },
        executionContext,
      );

      res.json({ status: 'completed', output: result.output });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ status: 'failed', error });
    }
  }),
);

export default router;

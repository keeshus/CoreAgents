import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, executions } from '../db/schema.js';
import { enqueueExecution } from '../../../worker/src/queue.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { NodeData, FlowDefinition } from 'core-agents-shared';

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

    // Validate input schema if defined
    const inputSchema = (triggerNode.data as any).config?.inputSchema;
    if (inputSchema) {
      try {
        const schema = typeof inputSchema === 'string' ? JSON.parse(inputSchema) : inputSchema;
        const errors = validateInput(req.body, schema);
        if (errors.length > 0) {
          res.status(400).json({
            error: 'Input validation failed',
            details: errors,
            expectedSchema: schema,
          });
          return;
        }
      } catch {
        // Schema parse error — skip validation, log warning
        console.warn('Webhook: could not parse inputSchema, skipping validation');
      }
    }

    const input = { ...req.body };
    if (req.headers['content-type']?.includes('text/plain')) {
      input.message = (req as any).body || '';
    }

    // Create execution record and enqueue via BullMQ
    const [exec] = await db.insert(executions).values({
      flow_id: flowId, status: 'pending', input, started_at: new Date(),
    }).returning();

    const flowDef: FlowDefinition = {
      id: flow.id, name: flow.name, description: flow.description || '',
      nodes: flow.nodes as any[], edges: flow.edges as any[],
      version: flow.version,
      createdAt: flow.created_at?.toISOString() || '', updatedAt: flow.updated_at?.toISOString() || '',
      flowContext: flow.flow_context || '',
      groupId: flow.group_id || undefined,
    };

    await enqueueExecution(flowDef, { ...input, __executionId: exec.id });

    res.json({ status: 'queued', executionId: exec.id });
  }),
);

// Simple schema validator for webhook input
// Schema format: { "fieldName": "expectedType" }
// Supported types: string, number, boolean, array, object
function validateInput(body: any, schema: Record<string, string>): string[] {
  const errors: string[] = [];

  for (const [field, expectedType] of Object.entries(schema)) {
    const value = body[field];

    // Check presence
    if (value === undefined || value === null) {
      errors.push(`Missing required field: "${field}" (expected ${expectedType})`);
      continue;
    }

    // Check type
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      errors.push(`Field "${field}": expected ${expectedType}, got ${actualType}`);
    }
  }

  return errors;
}

export default router;

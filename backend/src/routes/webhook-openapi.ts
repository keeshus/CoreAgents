import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db/connection.js';
import { flows, apiDeployments, apiKeys, executions } from '../db/schema.js';
import { asyncHandler } from '../utils/async-handler.js';
import { enqueueExecution } from '../../../worker/src/queue.js';
import type { FlowDefinition } from 'core-agents-shared';

const router = Router();

// ── Auth middleware ─────────────────────────────────────────────

async function authenticateWebhookRequest(req: any, flowId: string): Promise<{ status: number; message: string } | null> {
  let apiKeyValid = false;
  let secretValid = false;

  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice(7).trim();
    if (rawKey.startsWith('wh_')) {
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const [keyRecord] = await db.select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key_hash, keyHash), eq(apiKeys.flow_id, flowId))).limit(1);
      if (keyRecord?.enabled) {
        apiKeyValid = true;
        db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyRecord.id)).catch(() => {});
      }
    }
  }

  const providedSecret = (req.query.secret as string) || '';
  if (providedSecret) {
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId)).limit(1);
    if (flow) {
      const nodes = (flow.nodes || []) as any[];
      const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
      const configuredSecret = triggerNode?.data?.config?.webhookSecret;
      if (configuredSecret && configuredSecret === providedSecret) {
        secretValid = true;
      }
    }
  }

  const noCredsProvided = !authHeader && !providedSecret;
  if (noCredsProvided) {
    return { status: 401, message: 'Authentication required. Provide an API key (Authorization: Bearer wh_...) or a webhook secret (?secret=...).' };
  }

  if (authHeader && !apiKeyValid) {
    return { status: 401, message: 'Invalid API key' };
  }

  if (providedSecret && !secretValid) {
    return { status: 403, message: 'Invalid webhook secret' };
  }

  return null;
}

// ── POST /api/webhook/:slug — Named Webhook Execution ──────────

router.post(
  '/webhook/:slug',
  asyncHandler(async (req: any, res: any) => {
    const slug = req.params.slug;

    const [deployment] = await db.select()
      .from(apiDeployments)
      .where(eq(apiDeployments.path_slug, slug)).limit(1);

    if (!deployment) {
      res.status(404).json({ error: 'Webhook endpoint not found' });
      return;
    }

    const authError = await authenticateWebhookRequest(req, deployment.flow_id);
    if (authError) {
      res.status(authError.status).json({ error: authError.message });
      return;
    }

    // Load flow
    const [flow] = await db.select().from(flows).where(eq(flows.id, deployment.flow_id)).limit(1);
    if (!flow) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    // Verify trigger node
    const nodes = (flow.nodes || []) as any[];
    const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
    if (!triggerNode || triggerNode.data?.config?.triggerType !== 'webhook') {
      res.status(400).json({ error: 'This flow does not have a webhook trigger' });
      return;
    }

    // Validate input schema if defined
    const inputSchema = triggerNode.data?.config?.inputSchema;
    if (inputSchema) {
      try {
        const schema = typeof inputSchema === 'string' ? JSON.parse(inputSchema) : inputSchema;
        const errors = validateInput(req.body, schema);
        if (errors.length > 0) {
          res.status(400).json({ error: 'Input validation failed', details: errors, expectedSchema: schema });
          return;
        }
      } catch {
        // skip validation if schema is invalid
      }
    }

    const input = { ...req.body };

    // Create execution record and enqueue
    const [exec] = await db.insert(executions).values({
      flow_id: deployment.flow_id,
      status: 'pending',
      input,
      started_at: new Date(),
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

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(202).json({
      status: 'queued',
      executionId: exec.id,
      pollingUrl: `${baseUrl}/api/webhook/${slug}/executions/${exec.id}`,
    });
  }),
);

// ── GET /api/webhook/:slug/executions/:executionId — Execution Status ──

router.get(
  '/webhook/:slug/executions/:executionId',
  asyncHandler(async (req: any, res: any) => {
    const slug = req.params.slug;
    const executionId = req.params.executionId;

    const [deployment] = await db.select()
      .from(apiDeployments)
      .where(eq(apiDeployments.path_slug, slug)).limit(1);
    if (!deployment) {
      res.status(404).json({ error: 'Webhook endpoint not found' });
      return;
    }

    const authError = await authenticateWebhookRequest(req, deployment.flow_id);
    if (authError) {
      res.status(authError.status).json({ error: authError.message });
      return;
    }

    const [exec] = await db.select({
      id: executions.id,
      flowId: executions.flow_id,
      status: executions.status,
      input: executions.input,
      output: executions.output,
      error: executions.error,
      startedAt: executions.started_at,
      completedAt: executions.completed_at,
      createdAt: executions.created_at,
    })
      .from(executions)
      .where(and(eq(executions.id, executionId), eq(executions.flow_id, deployment.flow_id))).limit(1);

    if (!exec) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    const response: any = {
      id: exec.id,
      status: exec.status,
      createdAt: exec.createdAt,
      startedAt: exec.startedAt,
    };

    if (exec.status === 'completed') {
      response.output = exec.output;
      response.completedAt = exec.completedAt;
    } else if (exec.status === 'failed') {
      response.error = exec.error;
      response.completedAt = exec.completedAt;
    } else if (exec.status === 'awaiting_approval') {
      response.message = 'Execution is paused awaiting human approval';
    }

    res.json(response);
  }),
);

// ── GET /api/webhook/:slug/executions — List Recent Executions ──

router.get(
  '/webhook/:slug/executions',
  asyncHandler(async (req: any, res: any) => {
    const slug = req.params.slug;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const [deployment] = await db.select()
      .from(apiDeployments)
      .where(eq(apiDeployments.path_slug, slug)).limit(1);
    if (!deployment) {
      res.status(404).json({ error: 'Webhook endpoint not found' });
      return;
    }

    const authError = await authenticateWebhookRequest(req, deployment.flow_id);
    if (authError) {
      res.status(authError.status).json({ error: authError.message });
      return;
    }

    const rows = await db.select({
      id: executions.id,
      status: executions.status,
      createdAt: executions.created_at,
      startedAt: executions.started_at,
      completedAt: executions.completed_at,
    })
      .from(executions)
      .where(eq(executions.flow_id, deployment.flow_id))
      .orderBy(desc(executions.created_at))
      .limit(limit);

    res.json({ executions: rows });
  }),
);

// ── GET /api/openapi.json — OpenAPI Spec Generation ────────────

router.get(
  '/openapi.json',
  asyncHandler(async (req: any, res: any) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const rows = await db.select({
      deployment: apiDeployments,
      flow: flows,
    })
      .from(apiDeployments)
      .innerJoin(flows, eq(apiDeployments.flow_id, flows.id));

    const paths: Record<string, any> = {};
    const schemas: Record<string, object> = {};

    for (const { deployment, flow } of rows) {
      const flowNodes = (flow as any).nodes || [];
      const triggerNode = flowNodes.find(
        (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'webhook'
      );
      if (!triggerNode) continue;

      const slug = deployment.path_slug;
      const inputSchema = triggerNode.data?.config?.inputSchema;
      const operationId = `execute-${slug}`;

      const requestSchema = inputSchema
        ? convertToOpenApiSchema(inputSchema)
        : { type: 'object', properties: {}, additionalProperties: true };

      // POST /api/webhook/{slug}
      paths[`/api/webhook/${slug}`] = {
        post: {
          summary: deployment.summary || `Execute "${flow.name}" webhook flow`,
          operationId,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: requestSchema } },
          },
          responses: {
            '202': {
              description: 'Execution queued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'queued' },
                      executionId: { type: 'string', format: 'uuid' },
                      pollingUrl: { type: 'string', example: `/api/webhook/${slug}/executions/{id}` },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid input or schema validation failed' },
            '401': { description: 'Authentication failed' },
          },
          security: [{ apiKey: [] }],
        },
      };

      // GET /api/webhook/{slug}/executions/{executionId}
      paths[`/api/webhook/${slug}/executions/{executionId}`] = {
        get: {
          summary: `Get execution status and result for "${flow.name}"`,
          operationId: `get-execution-${slug}`,
          parameters: [{
            name: 'executionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Execution ID returned by the POST endpoint',
          }],
          responses: {
            '200': {
              description: 'Execution status',
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${slug}_execution_status` },
                },
              },
            },
            '401': { description: 'Authentication failed' },
            '404': { description: 'Execution not found' },
          },
          security: [{ apiKey: [] }],
        },
      };

      // GET /api/webhook/{slug}/executions
      paths[`/api/webhook/${slug}/executions`] = {
        get: {
          summary: `List recent executions for "${flow.name}"`,
          operationId: `list-executions-${slug}`,
          parameters: [{
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10, maximum: 50 },
          }],
          responses: {
            '200': {
              description: 'List of recent executions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      executions: {
                        type: 'array',
                        items: { $ref: `#/components/schemas/${slug}_execution_summary` },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication failed' },
          },
          security: [{ apiKey: [] }],
        },
      };

      schemas[`${slug}_input`] = requestSchema;
      schemas[`${slug}_response`] = {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'queued' },
          executionId: { type: 'string', format: 'uuid' },
          pollingUrl: { type: 'string' },
        },
      };
      schemas[`${slug}_execution_status`] = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'awaiting_approval'] },
          createdAt: { type: 'string', format: 'date-time' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          output: { type: 'object' },
          error: { type: 'string' },
        },
      };
      schemas[`${slug}_execution_summary`] = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
        },
      };
    }

    res.json({
      openapi: '3.0.3',
      info: {
        title: 'Core Agents — Webhook Flows API',
        version: '1.0.0',
        description: 'Dynamically generated API for all webhook-triggered flows. Endpoints appear and update automatically.',
      },
      servers: [{ url: baseUrl }],
      paths,
      components: {
        schemas,
        securitySchemes: {
          apiKey: {
            type: 'http',
            scheme: 'bearer',
            description: 'Personal API key (wh_ prefix). Each editor has one key per flow.',
          },
        },
      },
    });
  }),
);

// ── GET /api/docs — Swagger UI ──────────────────────────────────

router.get('/docs', (_req: any, res: any) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Webhook Flows API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`);
});

// ── Helpers ─────────────────────────────────────────────────────

function convertToOpenApiSchema(schema: Record<string, string> | string): object {
  const raw = typeof schema === 'string' ? JSON.parse(schema) : schema;
  const properties: Record<string, object> = {};
  const required: string[] = [];
  for (const [field, typeName] of Object.entries(raw as Record<string, string>)) {
    const jsonType = typeNameToJsonSchema(typeName);
    properties[field] = { type: jsonType };
    required.push(field);
  }
  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

function typeNameToJsonSchema(typeName: string): string {
  const map: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'array',
    object: 'object',
    integer: 'integer',
  };
  return map[typeName] || 'string';
}

function validateInput(body: any, schema: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [field, expectedType] of Object.entries(schema)) {
    const value = body[field];
    if (value === undefined || value === null) {
      errors.push(`Missing required field: "${field}" (expected ${expectedType})`);
      continue;
    }
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      errors.push(`Field "${field}": expected ${expectedType}, got ${actualType}`);
    }
  }
  return errors;
}

export default router;

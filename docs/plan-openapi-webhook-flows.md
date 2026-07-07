# Plan: Dynamic OpenAPI Specification for Webhook Flows

## Overview

Create a system that dynamically generates an [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3) specification document describing every webhook-triggered flow as a REST endpoint, served with interactive Swagger UI. When webhook flows are created, edited, or deleted, the spec updates immediately — no manual registration or redeployment.

```
│  GET    /api/openapi.json                         →  OpenAPI 3.0 spec (auto-generated from DB)
│  GET    /api/docs                                  →  Swagger UI (interactive docs)
│  POST   /api/webhook/{slug}                       →  Execute a webhook flow by name
│  GET    /api/webhook/{slug}/executions/{id}        →  Poll execution status & result
│  GET    /api/webhook/{slug}/executions             →  List recent executions
```

---

## 1. Two-Layer Authentication Model

Every webhook flow supports **two independent auth methods**. The caller can use either (or both, since they check different things):

| Method | Who manages it | How it's sent | Scope |
|--------|---------------|---------------|-------|
| **Webhook secret** | Admin (sets it on the trigger node) | `?secret=xxx` query param | Shared — same secret for all callers |
| **Personal API key** | Editor (auto-created per user per flow) | `Authorization: Bearer wh_xxx` | Personal — one key per editor per flow |

The server checks whichever mechanism the caller provides:
- If `?secret=` is present → validate against the trigger node's `webhookSecret`
- If `Authorization: Bearer wh_*` is present → validate against `api_keys` table
- If both are present → both must pass
- If neither is present → 401

---

## 2. Key Lifecycle

### Webhook secret (admin-managed)

- Set on the trigger node's `webhookSecret` field (existing behaviour)
- **Only visible to users with `admin` permission** — editors never see the field
- The OpenAPI spec only documents the personal API key auth method

### Personal API key (editor-scoped)

| Event | Behaviour |
|-------|-----------|
| **Auto-creation** | When the trigger type is set to `webhook` and the flow is saved, a personal `wh_` API key is generated for the current user (if they do not already have one). |
| **One key per user per flow** | `UNIQUE(flow_id, user_id)` constraint. Renewing replaces the existing key. |
| **On creation** | The raw key is returned in the save response and shown to the user in a toast/modal ("Your personal API key: `wh_...` — shown once"). |
| **Renew** | The user can click "Renew key" in the trigger node config panel. The old key is replaced, the new key is shown once. |
| **Revocation** | The user can click "Revoke key" to disable their key without deleting the flow. An admin can also revoke any user's key. |
| **Storage** | SHA-256 hash only. The prefix (first 8 chars) is stored for UI display. |

The prefix is shown in the trigger node config so the user can identify which key is theirs (useful if they copy it into multiple tools).

---

## 3. Database Changes

### New table: `api_deployments`

One row per webhook flow. Created automatically on first save when the flow has a webhook trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PK` | |
| `flow_id` | `uuid FK → flows.id UNIQUE` | One deployment per flow |
| `path_slug` | `text NOT NULL` | URL-safe path identifier (e.g. `payment-processor`) |
| `rate_limit` | `integer` | Max requests/min (0 = unlimited) |
| `summary` | `text` | Short description for OpenAPI path summary |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

**Constraints:** `UNIQUE(flow_id)`, `UNIQUE(path_slug)`

### New table: `api_keys`

Zero or one key per user per flow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PK` | |
| `flow_id` | `uuid FK → flows.id` | The flow this key unlocks |
| `user_id` | `uuid FK → users.id` | The editor who owns this key |
| `key_hash` | `text` | SHA-256 hash of the raw key |
| `key_prefix` | `text` | First 8 chars (`wh_a1b2c3d4`) for UI display |
| `enabled` | `boolean` | Toggle to revoke without deleting |
| `last_used_at` | `timestamp` | |
| `created_at` | `timestamp` | |

**Constraints:** `UNIQUE(flow_id, user_id)` — one key per user per flow.

### Migration SQL

```sql
CREATE TABLE IF NOT EXISTS api_deployments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  path_slug text NOT NULL,
  rate_limit integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(flow_id),
  UNIQUE(path_slug)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(flow_id, user_id)
);
```

**Row creation triggers:**

- `api_deployments` row is created on flow save when `triggerType === 'webhook'` (via a `PUT /api/flows/:flowId` hook in the flow save handler). The `path_slug` is auto-generated from the flow name.
- `api_keys` row is created at the same time if the current user does not yet have a key for this flow. The raw key is returned in the flow save response.

---

## 4. Shared Types

**New file:** `shared/src/types/webhook-api.ts`

```typescript
export interface ApiDeployment {
  id: string;
  flowId: string;
  pathSlug: string;
  rateLimit: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  flowId: string;
  userId: string;
  keyPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  rawKey: string;
}

// OpenAPI spec generation types
export interface OpenApiSpec {
  openapi: '3.0.3';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: {
    schemas: Record<string, object>;
    securitySchemes: Record<string, object>;
  };
}

export interface OpenApiPathItem {
  post: {
    summary: string;
    operationId: string;
    parameters?: Array<{
      name: string;
      in: 'query';
      description: string;
      schema: { type: string };
    }>;
    requestBody: {
      required: boolean;
      content: Record<string, { schema: object }>;
    };
    responses: Record<string, { description: string; content?: Record<string, { schema: object }> }>;
    security: Array<Record<string, string[]>>;
  };
}
```

**Modified:** `shared/src/types/flow.ts`

Extend the `TriggerNodeData.config` type to track whether the current user has a personal API key (the key itself is never stored on the flow, just a flag or the prefix for display):

```typescript
export interface TriggerNodeData extends BaseNodeData {
  type: 'trigger';
  config: {
    triggerType: 'manual' | 'chat' | 'webhook' | 'schedule' | 'subflow';
    webhookSecret?: string;
    cronExpression?: string;
    inputSchema?: string;
    inputMessage?: string;
    // New: personal API key prefix for display (server fills this on load)
    personalApiKeyPrefix?: string;
    personalApiKeyCreatedAt?: string;
  };
}
```

---

## 5. Backend Changes

### 5a. Flow save hook — auto-create deployment + personal API key

**File:** `backend/src/routes/flows.ts`

When a flow is saved and its trigger type is `webhook`:

1. Upsert an `api_deployments` row (auto-generate `path_slug` from flow name if new)
2. Check if the current user already has an `api_keys` row for this flow
3. If not, generate a `wh_` key, hash it, persist it, return the raw key in the response
4. If the user already has a key, include the prefix in the response for display

```typescript
// Pseudo-code inside the PUT /api/flows/:flowId handler:
if (triggerType === 'webhook') {
  const slug = generateSlug(flowName); // or keep existing slug

  await db.insert(apiDeployments).values({
    flow_id: flowId,
    path_slug: slug,
  }).onConflictDoUpdate({
    target: apiDeployments.flow_id,
    set: { path_slug: slug, updated_at: new Date() },
  });

  // Auto-create personal API key if user doesn't have one
  const [existingKey] = await db.select()
    .from(apiKeys)
    .where(and(
      eq(apiKeys.flow_id, flowId),
      eq(apiKeys.user_id, req.user.userId),
    ));

  if (!existingKey) {
    const { raw, hash, prefix } = generateWebhookApiKey();
    await db.insert(apiKeys).values({
      flow_id: flowId,
      user_id: req.user.userId,
      key_hash: hash,
      key_prefix: prefix,
    });
    // Include rawKey in response so UI can show it once
    response.personalApiKey = { rawKey: raw, prefix };
  } else {
    response.personalApiKey = { prefix: existingKey.key_prefix };
  }
}
```

**Response shape from `PUT /api/flows/:flowId`:**

```json
{
  "flow": { ... },
  "personalApiKey": {
    "rawKey": "wh_a1b2c3d4...",    // only on first creation
    "prefix": "wh_a1b2c3",
    "createdAt": "2026-07-07T..."
  }
}
```

### 5b. Flow load hook — attach personal API key metadata

When a flow is loaded (`GET /api/flows/:flowId`), include the current user's personal API key prefix and creation date so the trigger node config can display it:

```typescript
// Inside the GET /api/flows/:flowId handler:
const apiKey = await db.select()
  .from(apiKeys)
  .where(and(
    eq(apiKeys.flow_id, flowId),
    eq(apiKeys.user_id, req.user.userId),
  ));

if (apiKey) {
  // Add to trigger node data.config for UI display
  const triggerNode = findTriggerNode(flow);
  if (triggerNode) {
    triggerNode.data.config.personalApiKeyPrefix = apiKey.key_prefix;
    triggerNode.data.config.personalApiKeyCreatedAt = apiKey.created_at;
  }
}
```

### 5c. API key renew route

**New file:** `backend/src/routes/webhook-api-keys.ts`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `POST` | `/api/flows/:flowId/keys/renew` | `flow:edit` | Replace current user's key with a new one. Returns raw key once. |
| `DELETE` | `/api/flows/:flowId/keys/revoke` | `flow:edit` | Disable current user's key (sets `enabled = false`). |
| `DELETE` | `/api/flows/:flowId/keys/:userId` | `admin` | Admin: revoke any user's key for this flow. |

```typescript
// POST /api/flows/:flowId/keys/renew
router.post('/flows/:flowId/keys/renew', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = asStr(req.params.flowId);

  // Generate new key
  const { raw, hash, prefix } = generateWebhookApiKey();

  // Upsert: replace existing key or create new one
  await db.insert(apiKeys).values({
    flow_id: flowId,
    user_id: req.user.userId,
    key_hash: hash,
    key_prefix: prefix,
  }).onConflictDoUpdate({
    target: [apiKeys.flow_id, apiKeys.user_id],
    set: { key_hash: hash, key_prefix: prefix, enabled: true, updated_at: new Date() },
  });

  res.json({ rawKey: raw, prefix, createdAt: new Date().toISOString() });
}));
```

### 5d. Authentication middleware

**New file:** `backend/src/routes/webhook-openapi.ts`

The auth check is independent of any `auth_type` config — it simply validates whatever credentials the caller provides:

```typescript
async function authenticateWebhookRequest(req: Request, flowId: string): Promise<{ status: number; message: string } | null> {
  let apiKeyValid = false;
  let secretValid = false;

  // 1. Check API key (Authorization: Bearer wh_*)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice(7).trim();
    if (rawKey.startsWith('wh_')) {
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const [keyRecord] = await db.select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key_hash, keyHash), eq(apiKeys.flow_id, flowId)));
      if (keyRecord?.enabled) {
        apiKeyValid = true;
        db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyRecord.id));
      }
    }
  }

  // 2. Check webhook secret (?secret=...)
  const providedSecret = (req.query.secret as string) || '';
  if (providedSecret) {
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (flow) {
      const nodes = (flow.nodes || []) as any[];
      const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
      const configuredSecret = triggerNode?.data?.config?.webhookSecret;
      if (configuredSecret && configuredSecret === providedSecret) {
        secretValid = true;
      }
    }
  }

  // 3. Decision
  const noCredsProvided = !authHeader && !providedSecret;
  if (noCredsProvided) {
    return { status: 401, message: 'Authentication required. Provide an API key (Authorization: Bearer wh_...) or a webhook secret (?secret=...).' };
  }

  // API key present but invalid
  if (authHeader && !apiKeyValid) {
    return { status: 401, message: 'Invalid API key' };
  }

  // Secret present but invalid
  if (providedSecret && !secretValid) {
    return { status: 403, message: 'Invalid webhook secret' };
  }

  return null;
}
```

### 5e. `POST /api/webhook/:slug` — Named Webhook Execution

**New file:** `backend/src/routes/webhook-openapi.ts`

```typescript
router.post('/webhook/:slug', asyncHandler(async (req, res) => {
  const slug = req.params.slug;

  const [deployment] = await db.select()
    .from(apiDeployments)
    .where(eq(apiDeployments.path_slug, slug));

  if (!deployment) {
    res.status(404).json({ error: 'Webhook endpoint not found' });
    return;
  }

  const authError = await authenticateWebhookRequest(req, deployment.flow_id);
  if (authError) {
    res.status(authError.status).json({ error: authError.message });
    return;
  }

  // Delegate to existing webhook execution logic (webhook.ts already handles
  // loading the flow, verifying trigger type, input validation, queuing)
  req.params.flowId = deployment.flow_id;
  // ... forward to shared webhook execution handler
}));
```

### 5f. `GET /api/webhook/:slug/executions/:executionId` — Execution Status & Result

The webhook caller needs a way to poll for the result. This endpoint returns the execution status (`pending | running | completed | failed`) and, once completed, the output.

Authenticated with the same `wh_` API key or webhook secret as the execution endpoint.

```typescript
router.get('/webhook/:slug/executions/:executionId', asyncHandler(async (req, res) => {
  const slug = req.params.slug;
  const executionId = req.params.executionId;

  // Resolve deployment to flow
  const [deployment] = await db.select()
    .from(apiDeployments)
    .where(eq(apiDeployments.path_slug, slug));
  if (!deployment) {
    res.status(404).json({ error: 'Webhook endpoint not found' });
    return;
  }

  // Authenticate
  const authError = await authenticateWebhookRequest(req, deployment.flow_id);
  if (authError) {
    res.status(authError.status).json({ error: authError.message });
    return;
  }

  // Fetch execution
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
    .where(and(
      eq(executions.id, executionId),
      eq(executions.flow_id, deployment.flow_id),
    ));

  if (!exec) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }

  // Build response — only include output when complete
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
}));
```

**Response shapes:**

```
// Pending / running
{ "id": "...", "status": "running", "createdAt": "...", "startedAt": "..." }

// Completed
{ "id": "...", "status": "completed", "createdAt": "...", "startedAt": "...",
  "completedAt": "...", "output": { ... } }

// Failed
{ "id": "...", "status": "failed", "createdAt": "...", "startedAt": "...",
  "completedAt": "...", "error": "..." }

// Awaiting approval (HITL)
{ "id": "...", "status": "awaiting_approval", "createdAt": "...", "startedAt": "...",
  "message": "Execution is paused awaiting human approval" }

// Not found
404 { "error": "Execution not found" }
```

### 5g. `GET /api/webhook/:slug/executions` — List Recent Executions

Lists the most recent executions (including their status) for the slug-identified flow, so callers can see history without knowing execution IDs upfront.

```typescript
router.get('/webhook/:slug/executions', asyncHandler(async (req, res) => {
  const slug = req.params.slug;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

  const [deployment] = await db.select()
    .from(apiDeployments)
    .where(eq(apiDeployments.path_slug, slug));
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
}));
```

### 5h. `GET /api/openapi.json` — Generate OpenAPI Spec

Queries all `api_deployments`, joins with `flows` to read the trigger node config, and builds the OpenAPI document.

```typescript
router.get('/openapi.json', asyncHandler(async (req, res) => {
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
    const triggerNode = (flow.nodes || []).find(
      (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'webhook'
    );
    if (!triggerNode) continue;

    const slug = deployment.path_slug;
    const inputSchema = triggerNode.data?.config?.inputSchema;
    const hasSecret = !!triggerNode.data?.config?.webhookSecret;

    const requestSchema = inputSchema
      ? convertToOpenApiSchema(inputSchema)
      : { type: 'object', properties: {}, additionalProperties: true };

    paths[`/api/webhook/${slug}`] = {
      post: {
        summary: deployment.summary || `Execute "${flow.name}" webhook flow`,
        operationId: `execute-${slug}`,
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
                    pollingUrl: { type: 'string', example: '/api/webhook/my-flow/executions/{id}' },
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

    // Execution status endpoint
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
                schema: {
                  $ref: `#/components/schemas/${slug}_execution_status`,
                },
              },
            },
          },
          '401': { description: 'Authentication failed' },
          '404': { description: 'Execution not found' },
        },
        security: [{ apiKey: [] }],
      },
    };

    // Recent executions list endpoint
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
        startedAt: { type: 'string', format: 'date-time', nullable: true },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
        output: { type: 'object', nullable: true },
        error: { type: 'string', nullable: true },
      },
    };
    schemas[`${slug}_execution_summary`] = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
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
}));
```

### 5g. `GET /api/docs` — Swagger UI

Inline HTML page loading Swagger UI from CDN (same approach as before). Points to `/api/openapi.json`.

**Note:** The OpenAPI spec is generated unauthenticated (it's public). However, individual flow execution endpoints inside the spec still require auth. This follows the standard pattern — the spec documents *what* auth is needed, but does not enforce it.

---

## 6. Frontend Changes

### 6a. Trigger node config — extended with personal API key section

**File:** `frontend/src/components/flow/config/TriggerConfig.tsx` (existing — updated)

The trigger config panel already has a section for webhook configuration (trigger type dropdown, webhook secret input, input schema). Add a new **"Personal API Key"** section below the webhook secret.

**Layout when `triggerType === 'webhook'` (admin view):**

```
┌─ Webhook Configuration ─────────────────────────┐
│                                                   │
│  Webhook URL: https://host/api/webhook/payment-   │
│               processor                           │
│                                                   │
│  ── Authentication ────────────────────────────  │
│                                                   │
│  Webhook Secret (shared, admin-only)              │
│  ┌──────────────────────────────────────┐ [Save] │
│  │ *********                            │        │
│  └──────────────────────────────────────┘        │
│                                                   │
│  Your Personal API Key                            │
│  ┌──────────────────────────────────────┐        │
│  │ wh_a1b2c3d4e5f6...                  │ [Copy] │
│  └──────────────────────────────────────┘        │
│  [Renew Key]  [Revoke Key]                       │
│  Created: 2026-07-07                             │
│  ⓘ Personal to you. Sharing it allows others    │
│    to act on your behalf.                        │
│                                                   │
│  ── Input Schema ──────────────────────────────  │
│  ... (existing)                                   │
└───────────────────────────────────────────────────┘
```

**Layout when `triggerType === 'webhook'` (editor view):**

```
┌─ Webhook Configuration ─────────────────────────┐
│                                                   │
│  Webhook URL: https://host/api/webhook/payment-   │
│               processor                           │
│                                                   │
│  ── Authentication ────────────────────────────  │
│                                                   │
│  Your Personal API Key                            │
│  ┌──────────────────────────────────────┐        │
│  │ wh_a1b2c3d4e5f6...                  │ [Copy] │
│  └──────────────────────────────────────┘        │
│  [Renew Key]  [Revoke Key]                       │
│  Created: 2026-07-07                             │
│  ⓘ Personal to you. Sharing it allows others    │
│    to act on your behalf.                        │
│                                                   │
│  ── Input Schema ──────────────────────────────  │
│  ... (existing)                                   │
└───────────────────────────────────────────────────┘
```
**Behaviour:**

| Element | Behaviour |
|---------|-----------|
| Webhook Secret input | Read-only for non-admin users. Admin users see it as editable (same as today). |
| Personal API Key display | Shows the prefix. Fetched from the flow load response (`triggerNode.data.config.personalApiKeyPrefix`). |
| Copy button | Copies the **raw key** — but we only have the prefix. Instead, show a "Reveal" button that calls a backend endpoint to... wait, we can't reveal a stored hash.<br><br>**Solution:** Store the raw key in the save response and keep it in React state/context until the user navigates away. The copy button copies from that in-memory value. If the user refreshes the page, only the prefix remains visible and they must use "Renew" to get a new key. |
| Renew Key | Calls `POST /api/flows/:flowId/keys/renew`, shows the new raw key in a modal/toast. |
| Revoke Key | Calls `DELETE /api/flows/:flowId/keys/revoke` (sets `enabled = false`). Disables the key display. |
| Webhook URL | Now shows the slug-based URL: `{baseUrl}/api/webhook/{slug}` instead of `{baseUrl}/api/webhook/:flowId` |

**Implementation detail for the raw key in memory:**

```typescript
// The flow save response already includes personalApiKey.rawKey on first generation.
// Store it in a local state that persists across tab switches within the editor:
const [personalApiKey, setPersonalApiKey] = useState<string | null>(null);

// On flow load, check trigger node config for prefix
// On flow save, capture rawKey from response if present
// On copy, copy personalApiKey or show "renew to get your key" if null
```

### 6b. Flow save handler — capture personal API key

**File:** `frontend/pages/flows/[id]/edit.tsx`

When the flow save API returns `personalApiKey.rawKey`, store it in state and show a confirmation:

```typescript
const response = await saveFlow(flowData);
if (response.personalApiKey?.rawKey) {
  setPersonalApiKey(response.personalApiKey.rawKey);
  showToast({
    title: 'Personal API Key Created',
    message: `Your key: ${response.personalApiKey.rawKey}`,
    action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(response.personalApiKey.rawKey) },
    variant: 'warning', // warning because it should only be shown once
  });
}
```

### 6c. Flow editor — indicate webhook OpenAPI exposure

**File:** `frontend/pages/flows/[id]/edit.tsx`

- Show a small "OpenAPI" badge or link to `/api/docs` when the flow has a webhook trigger
- Show the slug-based URL in the trigger config

### 6d. Flow list — indicate OpenAPI availability

**File:** `frontend/pages/index.tsx`

Add a small "API" badge on flow cards for webhook flows (same as originally planned).

---

## 7. Auto-Update Mechanism

The spec is fully dynamic — every `GET /api/openapi.json` query:

1. `SELECT * FROM api_deployments` (all deployed webhook flows)
2. `INNER JOIN flows` to get flow names + trigger node configs
3. Extract `inputSchema` and `webhookSecret` from trigger node config
4. Build the spec

**This means:**
- Creating a webhook flow → auto-creates a deployment row on save → appears in spec immediately
- Editing the `inputSchema` or `webhookSecret` → updated in spec on next fetch
- Deleting a flow → cascading delete removes the deployment → gone from spec
- No background jobs, no cache, no manual registration

---

## 8. End-to-End Caller Flow

```
Caller                              Core Agents Backend
  │                                       │
  │  POST /api/webhook/payment-processor  │
  │  Authorization: Bearer wh_xxx         │
  │  { "amount": 100, "currency": "USD" } │
  │──────────────────────────────────────>│
  │                          1. Auth (API key or secret)
  │                          2. Load flow, validate input
  │                          3. Insert execution row (pending)
  │                          4. Enqueue via BullMQ
  │                          5. Return 202 Accepted
  │  <── 202 { status: "queued",          │
  │           executionId: "uuid",        │
  │           pollingUrl: "/api/webhook/  │
  │           payment-processor/          │
  │           executions/uuid" }          │
  │                                       │
  │  (worker executes flow async)         │
  │                                       │
  │  GET /api/webhook/payment-processor/  │
  │      executions/uuid                  │
  │  Authorization: Bearer wh_xxx         │
  │──────────────────────────────────────>│
  │                          1. Auth (same key)
  │                          2. Look up execution
  │  <── 200 { id: "uuid",               │
  │           status: "running",          │
  │           createdAt: "...",           │
  │           startedAt: "..." }          │
  │                                       │
  │  (poll every N seconds)               │
  │                                       │
  │  GET /api/webhook/payment-processor/  │
  │      executions/uuid                  │
  │──────────────────────────────────────>│
  │                          1. Auth
  │                          2. Look up execution
  │  <── 200 { id: "uuid",               │
  │           status: "completed",        │
  │           output: { "result":         │
  │             "Payment processed" },    │
  │           completedAt: "..." }        │
```

The caller uses the `pollingUrl` returned in the POST response to check status. Polling is standard for async webhook patterns — the 202 + polling URL pattern is well established (see [RFC 7231 §4.3.3](https://datatracker.ietf.org/doc/html/rfc7231#section-4.3.3) and the RESTful webhooks pattern).

---

## 9. Example OpenAPI Spec Output

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Core Agents — Webhook Flows API",
    "version": "1.0.0",
    "description": "Dynamically generated API for all webhook-triggered flows."
  },
  "servers": [{ "url": "https://example.com" }],
  "paths": {
    "/api/webhook/payment-processor": {
      "post": {
        "summary": "Process a payment",
        "operationId": "execute-payment-processor",
        "parameters": [
          { "name": "secret", "in": "query", "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "amount": { "type": "number" },
                  "currency": { "type": "string" }
                },
                "required": ["amount", "currency"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Execution queued",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "example": "queued" },
                    "executionId": { "type": "string", "format": "uuid" }
                  }
                }
              }
            }
          }
        },
        "security": [{ "apiKey": [] }]
      }
    },
    "/api/webhook/payment-processor/executions/{executionId}": {
      "get": {
        "summary": "Get execution status and result",
        "operationId": "get-execution-payment-processor",
        "parameters": [{
          "name": "executionId", "in": "path", "required": true,
          "schema": { "type": "string", "format": "uuid" }
        }],
        "responses": {
          "200": { "description": "Execution status", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/payment-processor_execution_status" } } } }
        },
        "security": [{ "apiKey": [] }]
      }
    },
    "/api/webhook/payment-processor/executions": {
      "get": {
        "summary": "List recent executions",
        "operationId": "list-executions-payment-processor",
        "parameters": [{
          "name": "limit", "in": "query", "schema": { "type": "integer", "default": 10 }
        }],
        "responses": {
          "200": { "description": "List of recent executions" }
        },
        "security": [{ "apiKey": [] }]
      }
    }
  },
  "components": {
    "schemas": {
      "payment-processor_input": { /* ... */ },
      "payment-processor_response": { /* ... */ },
      "payment-processor_execution_status": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "status": { "type": "string", "enum": ["pending", "running", "completed", "failed"] },
          "createdAt": { "type": "string", "format": "date-time" },
          "startedAt": { "type": "string", "format": "date-time" },
          "completedAt": { "type": "string", "format": "date-time" },
          "output": { "type": "object" },
          "error": { "type": "string" }
        }
      }
    },
    "securitySchemes": {
      "apiKey": {
        "type": "http",
        "scheme": "bearer",
        "description": "Personal API key (wh_ prefix). Each editor has one key per flow."
      }
    }
  }
}
```

The OpenAPI spec only documents the API key auth method. The webhook secret (`?secret=...`) also works at the server level but is intentionally omitted from the spec — it is an internal/admin-only mechanism.

---

## 10. Files to Create / Modify

### New files:

| File | Purpose |
|------|---------|
| `shared/src/types/webhook-api.ts` | `ApiDeployment`, `ApiKey`, `ApiKeyWithSecret`, `OpenApiSpec` types |
| `backend/src/routes/webhook-openapi.ts` | `GET /api/openapi.json`, `GET /api/docs`, `POST /api/webhook/:slug`, `GET /api/webhook/:slug/executions/:id`, `GET /api/webhook/:slug/executions` + auth middleware |
| `backend/src/routes/webhook-api-keys.ts` | `POST /flows/:flowId/keys/renew`, `DELETE /flows/:flowId/keys/revoke` |

### Modified files:

| File | Changes |
|------|---------|
| `shared/src/db/schema.ts` | Add `api_deployments` and `api_keys` tables |
| `shared/src/types/flow.ts` | Add `personalApiKeyPrefix` and `personalApiKeyCreatedAt` to `TriggerNodeData.config` |
| `shared/src/types/index.ts` | Export `webhook-api.ts` types |
| `backend/src/routes/flows.ts` | Hook on save: upsert deployment + auto-create personal API key. Hook on load: attach key prefix to trigger node config. |
| `backend/src/routes/webhook.ts` | Optionally refactor execution logic into a shared util so `POST /api/webhook/:slug` can delegate without duplicating code |
| `backend/src/index.ts` | Mount `webhook-openapi` router (public) and `webhook-api-keys` router (protected) |
| `frontend/src/components/flow/config/TriggerConfig.tsx` | Add personal API key section (prefix display, renew, revoke, copy). Admin-gate the webhook secret field. |
| `frontend/pages/flows/[id]/edit.tsx` | Capture `personalApiKey.rawKey` from save response, show toast. Show OpenAPI badge. |
| `frontend/pages/index.tsx` | Add "API" badge for webhook flows |

---

## 11. Implementation Order

| Step | What | Details |
|------|------|---------|
| 1 | **DB schema** | Add `api_deployments` + `api_keys` to `shared/src/db/schema.ts` + migration |
| 2 | **Shared types** | Add `webhook-api.ts`, extend `TriggerNodeData.config` in `flow.ts` |
| 3 | **Flow save hook** | Upsert deployment, auto-create personal API key, return raw key in response |
| 4 | **Flow load hook** | Attach personal API key prefix + creation date to trigger node config |
| 5 | **API key renew/revoke routes** | `POST /flows/:flowId/keys/renew`, `DELETE /flows/:flowId/keys/revoke` |
| 6 | **Execution status endpoints** | `GET /api/webhook/:slug/executions/:id` (status & result), `GET /api/webhook/:slug/executions` (list recent) |
| 7 | **OpenAPI spec endpoint** | `GET /api/openapi.json` — dynamic spec generation including execution status paths |
| 8 | **Named webhook route** | `POST /api/webhook/:slug` with auth middleware |
| 9 | **Swagger UI** | `GET /api/docs` |
| 10 | **TriggerConfig.tsx** | Add personal API key section, admin-gate webhook secret |
| 11 | **Edit.tsx** | Capture raw key on save, show toast, OpenAPI badge |
| 12 | **Unit tests** | Spec generation, auth middleware, key lifecycle, execution polling, flow save hooks |
| 13 | **E2E test** | Full flow: create webhook flow → save → get personal key → call slug endpoint → poll execution until completed → verify output |

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|------------|
| API key shown once | Stored in React state only. On page refresh, only prefix is visible. Key must be renewed to retrieve again. |
| Hash storage | SHA-256 + `crypto.timingSafeEqual` on verification. |
| One key per user per flow | `UNIQUE(flow_id, user_id)` constraint. Renew replaces, never accumulates. |
| Auto-creation on save | Only creates a key if the user does not already have one for that flow. Idempotent. |
| Webhook secret admin-gated | Only users with `admin` permission can edit the `webhookSecret` field. Backend enforces this too. |
| Slug collision | `UNIQUE(path_slug)` constraint. Auto-generated slugs append a suffix on conflict. |
| Rate limiting | In-memory token bucket per key ID, configurable per deployment. |
| Public spec | The OpenAPI spec itself is unauthenticated (it just describes the API). Execution endpoints inside the spec require auth. |
| Revocation | Revoke sets `enabled = false`. The key remains in the DB for audit but cannot be used. |
| Raw key in API responses | `rawKey` is only included on creation/renew. Never stored. Never returned on GET/list. |

---

## 13. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Auth managed on the trigger node** (no separate panel) | Auth is a property of the webhook trigger, not a separate concern. Keeps the UI simple and discoverable. |
| **Personal API key auto-created on save** | Zero friction. The user does not need to remember to generate a key — it is ready the moment the flow is saved. |
| **Webhook secret admin-only** | The shared secret is a sensitive credential. Only admins can set/change it. Editors get personal keys instead. |
| **Two independent auth methods** (not mutually exclusive) | Callers can use whichever is most convenient for their use case. `?secret=` is simpler for scripts, `Bearer wh_` is standard for SDKs. |
| **No `auth_type` config field** | The available auth is implicit: secret is available if an admin set it, API key is always available. No need to configure what is available. |
| **Slug-based URLs** | `/api/webhook/payment-processor` is human-readable and stable even if the flow ID changes (e.g. on re-import). |
| **Dynamic spec** (no caching) | Always up-to-date. No cache invalidation complexity. DB queries are fast for realistic fleet sizes. |
| **`wh_` prefix** | Follows the established `cp_` pattern. Easy to identify and scan for in logs/credentials. |
| **Swagger UI from CDN** | Avoids adding a ~3MB npm dependency for a single page. |
| **Key in React state, not localStorage** | The raw key is ephemeral. If the user navigates away, it is gone. Renew is the intended recovery mechanism. |
# New Node Types Plan

## Overview

The current workflow engine has 12 node types across 4 categories (input, processing, tools, output). Below are 7 proposed new nodes that fill common workflow gaps (Switch was already implemented). Each includes the full implementation surface needed.

---

## 1. HTTP Request (`http`)

| Field | Value |
|---|---|
| **Category** | `tools` |
| **Label** | HTTP Request |
| **Description** | Make HTTP requests to external APIs with support for method, URL, headers, body, and authentication. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface HttpNodeData extends BaseNodeData {
  type: 'http';
  config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
    url: string;
    headers?: string;           // JSON object string
    body?: string;              // JSON string or template
    authType?: 'none' | 'basic' | 'bearer' | 'api-key';
    authUsername?: string;
    authPassword?: string;
    authToken?: string;
    authKeyName?: string;
    authKeyValue?: string;
    followRedirects?: boolean;
    timeout?: number;           // ms, default 30000
    retries?: number;
    sslVerify?: boolean;
  };
}
```

### Execution (`worker/src/executor/engine.ts`)

```typescript
case 'http': {
  // Resolve URL and body templates
  // Parse headers JSON
  // Apply auth config
  // Fetch with node-fetch or built-in fetch
  // Return { status, statusText, headers, body, ok }
}
```

### Frontend
- **Node component**: `HttpNode.tsx` — shows method badge (color-coded), URL preview, status line
- **Config panel**: `HttpConfig.tsx` — method select, URL input with template autocomplete, headers editor (key/value list), body textarea, auth section
- **Icon**: `http_post` or `globe`

---

## 2. Loop / For Each (`loop`)

| Field | Value |
|---|---|
| **Category** | `processing` |
| **Label** | Loop |
| **Description** | Iterate over an array of items and execute a sub-graph for each item sequentially. Use a Parallel node inside the loop for concurrent execution. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface LoopNodeData extends BaseNodeData {
  type: 'loop';
  config: {
    itemsField: string;            // "Label.field" — references an upstream array field (e.g., "trigger.chunks")
    itemVariable: string;          // variable name for current item (default: 'item')
    indexVariable?: string;        // variable name for index (default: 'index')
    subNodes: FlowNode[];
    subEdges: FlowEdge[];
    collectResults?: boolean;      // whether to emit array of results
  };
}
```

### Execution
- Look up `itemsField` from input context to get the array
- Iterate sequentially, execute sub-graph for each item, passing `{item, index}` as input
- Error if the resolved field is not an array
- Output: `{ results: [...], count: N, errors: [...] }` or single-pass-through if not collecting

### Frontend
- **Node component**: `LoopNode.tsx` — shows item variable, sub-node count
- **Config panel**: `LoopNodeConfig.tsx` — field selector filtered to only show upstream fields with `array<...>` types, variable name inputs
- **Icon**: `loop`

---

## 3. Delay / Wait (`delay`)

| Field | Value |
|---|---|
| **Category** | `processing` |
| **Label** | Delay |
| **Description** | Pause execution for a fixed duration, ISO 8601 duration, or until a specific timestamp. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface DelayNodeData extends BaseNodeData {
  type: 'delay';
  config: {
    type: 'fixed' | 'duration' | 'timestamp';
    seconds?: number;              // for 'fixed'
    duration?: string;             // ISO 8601: "PT30S", "PT5M", "PT1H"
    timestamp?: string;            // ISO date or {{input.Var}} template
    jitter?: number;               // random +/- seconds to add
  };
}
```

### Execution — BullMQ delayed job (not setTimeout)

The Delay node **must not** use `setTimeout` — that would hold a worker thread and be lost on restart. Instead it uses the same pause/resume infrastructure as HITL, with BullMQ's native delayed jobs for auto-resume:

1. **Engine** throws `PauseExecutionError` (reuse or extends `HitlPauseError`) with:
   - `type: 'delay'`
   - `resumeAt` — computed timestamp (now + delay, with jitter applied)
   - `savedOutputs` — current node outputs to resume from

2. **Runner** catches the error, saves execution to DB:
   - Status: `'awaiting_delay'`
   - `pending_delays: [{ resumeAt, savedOutputs, nodeId }]`
   - Then enqueues a resume job: `queue.add('resume-execution', { executionId, pendingDelayIndex: 0 }, { delay: msUntilResume })`

3. **BullMQ** holds the job in its Redis-backed delayed set — survives restarts, no polling needed.

4. **Resume worker** (new consumer on `'resume-execution'` queue or existing worker) picks up the job when the delay expires, loads the execution, and replays from the delay node using the same replay mechanism as HITL approval.

Benefits over `setTimeout`:
- Survives worker restarts (state persisted + delayed job in Redis)
- No worker thread blocked during delay
- Precise to the millisecond (not poll-interval bound)
- Horizontally scalable — BullMQ handles distributed coordination
- Visible in UI as pending execution

### Status propagation
- A new `'awaiting_delay'` execution status in `ExecutionStatus` union
- Backend `GET /api/executions/pending` includes delayed executions
- UI shows a "pending" badge with countdown if `resumeAt` is available

### Frontend
- **Node component**: `DelayNode.tsx` — shows duration preview, timer icon
- **Config panel**: inline — radio for type, then contextual inputs
- **Icon**: `timer`

---

## 4. AI Transform (`ai-transform`)

| Field | Value |
|---|---|
| **Category** | `processing` |
| **Label** | AI Transform |
| **Description** | A lightweight LLM call for text transformation (summarize, classify, extract, translate) without the complexity of the full LLM Agent. Single prompt → text output. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface AITransformNodeData extends BaseNodeData {
  type: 'ai-transform';
  config: {
    endpointId: string;
    model: string;
    prompt: string;               // template-resolved prompt
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
    outputSchema?: string;
    inputFields?: string[];
  };
}
```

### Execution
- Resolve prompt template
- Single LLM call (no tool-use loop, no context layering, no history)
- Return `{ content, model, usage }`

### Frontend
- **Node component**: `AITransformNode.tsx` — shows model, prompt preview
- **Config panel**: similar to `LLMAgentConfig` but simpler — just endpoint, model, prompt, temperature, max tokens
- **Icon**: `auto_awesome`

---

## 5. Webhook Sender (`webhook-send`)

| Field | Value |
|---|---|
| **Category** | `output` |
| **Label** | Webhook Sender |
| **Description** | Send a webhook/HTTP POST to an external URL with configurable payload. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface WebhookSendNodeData extends BaseNodeData {
  type: 'webhook-send';
  config: {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: string;            // JSON object
    bodyTemplate?: string;       // template for body
    contentType?: string;        // default 'application/json'
    secret?: string;             // HMAC secret for signing
    secretHeader?: string;       // header name for signature
    retries?: number;
    timeout?: number;
  };
}
```

### Execution
- Resolve body template and URL
- POST/PUT/PATCH to URL
- Optional HMAC signing
- Return `{ status, statusText, responseBody }`

### Frontend
- **Node component**: `WebhookSendNode.tsx` — shows URL, method badge
- **Config panel**: `WebhookSendConfig.tsx` — URL, method, headers, body template, signing
- **Icon**: `webhook`

---

## 6. JSON Builder (`json`)

| Field | Value |
|---|---|
| **Category** | `processing` |
| **Label** | JSON Builder |
| **Description** | Construct a JSON object from upstream data using a template structure. |
| **Inputs** | 1 |
| **Outputs** | 1 |

### Config Interface

```typescript
interface JsonNodeData extends BaseNodeData {
  type: 'json';
  config: {
    template: string;              // JSON template string with {{input.Var.field}} placeholders
    mode: 'merge' | 'replace';    // merge with input or output only the template result
    inputFields?: string[];
  };
}
```

### Execution
- Resolve template (replace `{{...}}` with actual values)
- Parse as JSON
- If `merge`, spread result over input; if `replace`, return only the template result

### Frontend
- **Node component**: `JsonNode.tsx` — shows template preview
- **Config panel**: inline — JSON textarea with template autocomplete, mode select
- **Icon**: `data_object`

---

## 7. Note / Comment (`note`)

| Field | Value |
|---|---|
| **Category** | (none — special) |
| **Label** | Note |
| **Description** | A visual annotation on the canvas for documentation purposes. Has no execution behavior. |
| **Inputs** | 0 |
| **Outputs** | 0 |

### Config Interface

```typescript
interface NoteNodeData extends BaseNodeData {
  type: 'note';
  config: {
    content: string;
    color?: string;           // optional highlight color
  };
}
```

### Execution
- No-op: passes through without running
- Skip during topological sort or return `{ note: true }`

### Frontend
- **Node component**: `NoteNode.tsx` — styled text block, no handles, transparent background
- **Config panel**: inline — textarea for content
- **Icon**: `sticky_note_2`
- Special handling: should not appear in normal catalog sections (maybe a separate "Utility" section)

---

## Implementation Checklist (Per Node)

1. **`shared/src/types/flow.ts`**
   - Add string to `NODE_TYPES` array
   - Create `*NodeData` interface extending `BaseNodeData`
   - Add to `NodeData` union type

2. **`backend/src/routes/catalog.ts`**
   - Add `NodeCatalogEntry` with type, label, category, description, defaultConfig, inputs, outputs

3. **`worker/src/executor/engine.ts`**
   - Add `case` in `executeNode()` switch statement

4. **`frontend/src/components/flow/nodes/<Name>Node.tsx`**
   - Create React Flow node component wrapping `BaseNode`

5. **`frontend/src/components/flow/FlowEditor.tsx`**
   - Import component and add to `nodeTypes` map

6. **`frontend/src/components/flow/config/<Name>Config.tsx`** (optional)
   - Create config panel if non-trivial

7. **`frontend/src/components/flow/NodeConfigModal.tsx`**
   - Import config (if created) and render
   - Add to exclusion list for raw JSON fallback
   - Add to `NODE_LABELS` map

8. **`frontend/src/components/flow/NodeCatalog.tsx`**
   - Add icon name to `NODE_ICONS` map

## Recommended Priority Order

| Priority | Node | Rationale |
|---|---|---|
| 1 | **HTTP Request** | Most commonly requested — no workflow engine is complete without external API calls |
| 2 | **Loop** | Iteration over arrays is essential for batch processing |
| 3 | **Delay** | Needed for rate limiting, polling, scheduled actions within flows |
| 4 | **AI Transform** | Lightweight LLM calls without agent complexity fill a common gap |
| 5 | **JSON Builder** | Data shaping/manipulation is a frequent need (complements the `code` node) |
| 6 | **Webhook Sender** | Fires outgoing events — the inverse of the webhook Trigger |
| 7 | **Note** | Low effort, high value for documentation and team collaboration |

# Core Agents Data Flow & Platform Evolution

## Part 1: Input Selection on Existing Nodes

Every processing node gets an **"Input Fields"** config that filters what it receives — like HITL's `displayFields` but generalized. The engine filters `stepInput` down to only the named fields before passing to the node handler.

### Nodes affected:
- **LLM Agent** — controls what context the LLM sees
- **Branch** — controls which fields the condition expression can reference
- **Code** — controls the shape of the `payload` input

### Visual Input Selection (checkboxes, not text)

Instead of a comma-separated text field, the user sees a **checklist** of all available upstream fields. Each field has a checkbox. Checked = included, unchecked = filtered out.

```
Available Input Fields for "LLM Agent" node:
  ☑ llm_agent_1            ← checked (passed to LLM)
    ├── content: string
    ├── streamedContent: string
    └── transactions: array
  ☐ trigger.message        ← unchecked (filtered out)
```

The accumulated data shape (Part 2) powers this checklist — the component knows every field name and type available at that point in the flow.

---

## Part 2: Modal Config Panel + Combined Data Visibility

### Config panel redesign

The right-side properties panel is removed entirely. **Single-clicking** a node opens a **modal dialog** that overlays the canvas. The modal has full room to show:

- Node name (editable)
- Accumulated data shape (read-only, scrollable)
- Visual Input Selection (checkbox list of upstream fields)
- Node-specific config (prompt, model, temperature, etc.)

The modal is faster to work with — click outside or press Escape to close. The left-side NodeCatalog remains as-is.

**Changes are instant.** Every input/toggle in the modal updates the node data immediately via the existing ref callbacks (`setNodeDataRef`, `setNodeLabelRef`). The node on the canvas reflects changes in real time — no "Save" or "Apply" button needed.

### Combined Data Visibility

The modal's **"Incoming Data"** section renders the full accumulated data shape — not just the direct upstream node's output type, but the actual field names and types available at that point in the flow.

### What it shows

- **Accumulated shape** — all upstream node outputs merged into one object, with field names and types
- **Structured output schemas** — if an LLM Agent has a JSON schema or a Code node has an outputSchema, the parsed fields appear in the shape with their types
- **Visual Input Selection** — checkbox list on the accumulated fields, showing which pass through and which are filtered
- **Final shape preview** — once fields are selected, a preview of what the node actually receives
- **MCP Tool output** — just `"result"` (opaque — LLM decides)
- **Parallel children** — each child's node label shown as a separate field

### Examples

**LLM Agent with JSON schema `{"properties":{"transactions":{"type":"array"},"summary":{"type":"string"}}}`:**

```
Incoming Data (accumulated from all upstream):
{
  trigger: { message: any },
  llm_agent_1: {
    content: string,
    streamedContent: string,
    transactions: array,
    summary: string
  }
}
```

**Same node with Input Fields set to "transactions":**

```
Input Fields: "transactions"
  ✓ transactions → passed through
  ✗ summary → filtered out

Downstream receives: { transactions: [...] }
```

### Implementation

- Enhance the existing `InputPreview` component to walk all upstream nodes and accumulate shapes
- Parse `outputSchema` on Code nodes and `outputSchema` on LLM Agent JSON configs
- When "Input Fields" is set, show which fields pass through and which are dropped
- Show the final filtered shape that the node actually receives

This replaces the current `InputPreview` which only shows the direct upstream node's output type badge.

---

## Part 3: Parallel Node Output Flattening

Currently the Parallel node returns `{ merged: { id1: {...}, id2: {...} }, results: [...] }` — nested and hard to use.

Change it to return `{ ...input, id1: {...}, id2: {...} }` — child outputs are merged directly into the result, no extra nesting. Downstream nodes can immediately reference `id1.transactions`.

---

## Part 4: Core Agents MCP Server (Built-in Tools)

An MCP server that runs inside the **worker** process, started automatically, exposing general-purpose tools that every LLM Agent has available by default. No manual MCP server registration needed — tools are auto-injected.

### Architecture

```
Worker Process (Node.js, single process, event-loop driven)
├── FlowExecutor              ← runs DAG, calls LLMs
├── Scheduler                 ← polls for cron-triggered flows
├── Built-in MCP Hub Server   ← SSE on localhost:3100, started at boot
│   └── Tools:
│       ├── store.get / store.set / store.delete / store.list
│       ├── file.read / file.write / file.list
│       ├── now()
│       ├── uuid()
│       ├── log()
│       └── fetch()         ← HTTP GET
```

### How registration works for the flow builder

The backend registers the built-in MCP server in the `mcp_servers` table on startup with a special `built_in: true` flag. In the LLM Agent's tool connection area, these tools are always available without connecting a purple dot — they're auto-injected into tool definitions alongside any connected MCP Tool nodes.

Users can still turn them off on a per-agent basis via a "Include built-in tools" toggle in the LLM Agent config (default: on).

### Tool Reference

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `store.get(key)` | `{ key: string }` | `{ value: any }` | Read a persisted value by key |
| `store.set(key, value)` | `{ key: string, value: any }` | `{ stored: true }` | Persist a value across runs |
| `store.delete(key)` | `{ key: string }` | `{ deleted: true }` | Remove a persisted value |
| `store.list()` | — | `{ keys: string[] }` | List all stored keys |
| `file.read(path)` | `{ path: string }` | `{ content: string, size: number }` | Read a file from the shared workspace |
| `file.write(path, content)` | `{ path: string, content: string }` | `{ path, size }` | Write a file to the shared workspace |
| `file.list(path)` | `{ path: string }` | `{ entries: [{ name, isDir, size }] }` | List directory contents |
| `now()` | — | `{ iso: string, unix: number }` | Current UTC timestamp |
| `uuid()` | — | `{ uuid: string }` | Generate a v4 UUID |
| `log(level, message)` | `{ level: 'info'\|'warn'\|'error', message: string }` | `{ logged: true }` | Append to execution log |
| `fetch(url)` | `{ url: string }` | `{ status, body }` | HTTP GET a URL (simple fetches) |

### DB storage for state

Persistent state (store.* tools) lives in a new `agent_store` table:

```sql
agent_store (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
)
```

This is just a simple key-value table in PostgreSQL — no new infrastructure.

### File workspace

File tools operate within a configurable workspace directory (`WORKSPACE_PATH`, defaults to `/data/workspace`). Path traversal is blocked — attempts to read outside the workspace return an error.

---

## Part 5: Scalability for 1000s of Scheduled Agents

### Queue-based (no inline scheduler)

The scheduler runs as a lightweight **separate process** — it only polls for due flows and pushes jobs to a Valkey queue. Workers pick up jobs from the queue, execute flows, and save results. This separates concerns and allows Kubernetes HPA to scale workers based on queue depth.

### Architecture

```
Scheduler (lightweight polling)
     ↓ (enqueues execution jobs)
Valkey / BullMQ Queue
     ↓ (workers pick up jobs)
N Worker Pods (Kubernetes HPA auto-scales based on queue depth)
```

### How it works

1. **Scheduler Pod** (1 replica, always on) — polls every 60s for due flows, pushes jobs to a Valkey queue
2. **Queue** (Valkey) — holds execution jobs. Each job contains the flowId and the scheduled input payload
3. **Worker Pods** (auto-scaled) — pull jobs from the queue, execute the flow, save results
4. **Kubernetes HPA** — scales worker pods based on queue depth (e.g., scale up when >10 jobs pending)

### Components needed

| Component | What |
|-----------|------|
| Valkey | Queue backend (already common in K8s deployments) |
| BullMQ | Node.js queue library (resilient, supports delayed jobs, rate limiting) |
| Scheduler | Separate lightweight deployment — only checks cron + pushes to queue |
| Worker | The current worker process, but stateless — receives a job, runs it, writes results to DB |

### Helm chart updates

```yaml
# New values:
valkey:
  enabled: true
  image: valkey:7-alpine

scheduler:
  replicaCount: 1
  resources:
    requests: { cpu: 100m, memory: 128Mi }

worker:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetQueueDepth: 10
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits: { cpu: 2000m, memory: 2Gi }
```

### Migration path

The scheduler is Valkey + BullMQ from the start — no inline scheduler. Every scheduled flow goes through the queue, and workers auto-scale based on queue depth. This works for 10 flows or 10,000.

---

## Implementation Order

1. **Data Flow Visibility** — enhanced InputPreview showing full accumulated shape, structured schemas, and filtered preview
2. **Input Selection** on existing nodes (LLM Agent, Branch, Code) — "Input Fields" config + engine filtering
3. **Flatten Parallel output** (no more `{ merged: {...} }` wrapping)
4. **Built-in MCP Server** with store, file, now, uuid, log, fetch tools
5. **Auto-inject** built-in tools into all LLM Agents by default
6. **Valkey queue + BullMQ** for scalable scheduled execution
7. **K8s HPA** scaling based on queue depth

## Files Summary

| File | Change |
|------|--------|
| `shared/src/types/flow.ts` | inputFields on existing configs |
| `worker/src/executor/engine.ts` | Input filtering + Parallel output flattening |
| `worker/src/mcp/built-in.ts` | **New** — MCP server with 11 tools |
| `worker/src/run.ts` | Start built-in MCP server on boot |
| `worker/src/scheduler.ts` | Phase 2: push to queue instead of inline exec |
| `worker/src/queue.ts` | **New** — BullMQ producer/consumer |
| `backend/src/routes/catalog.ts` | — |
| `backend/src/db/schema.ts` | agent_store table |
| `frontend/src/components/flow/nodes/` | — (no new nodes) |
| `frontend/src/components/flow/FlowEditor.tsx` | — |
| `frontend/pages/flows/[id]/edit.tsx` | Config panels |
| `helm/core-agents/values.yaml` | Valkey, scheduler, worker autoscaling |
| `helm/core-agents/templates/` | Valkey deployment, HPA, scheduler |

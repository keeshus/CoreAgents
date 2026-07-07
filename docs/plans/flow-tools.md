# Flow Tools — Implementation Plan

## Overview

Add a new `flow-tool` node type that lets users expose any webhook-enabled flow as a tool that an LLM Agent can call dynamically. The LLM sees the webhook flow's input schema as a tool definition, and when it "calls" the tool, the referenced flow executes inline and the result is fed back to the LLM.

---

## Why Webhook Flows Only?

Webhook flows are the right choice because:
- They have a **defined input schema** (`inputSchema` on the trigger node) — this maps directly to a tool's `input_schema` JSON Schema
- They are **designed for programmatic invocation** — stateless, input→output contract
- They are **scoped to a single execution** — no chat session state to manage
- The schema format is already consumed by the subflow node config (see `SubflowNodeConfig.tsx`)

---

## Changes Required

### 1. Shared Types (`shared/src/types/flow.ts`)

- Add `'flow-tool'` to the `NODE_TYPES` const array
- Define `FlowToolNodeData` interface with `flowIds: string[]` (multi-select):
  ```typescript
  export interface FlowToolNodeData extends BaseNodeData {
    type: 'flow-tool';
    config: {
      flowIds: string[];
      selectedFlows?: Array<{ id: string; name: string; groupId?: string | null }>;
    };
  }
  ```
- Add `FlowToolNodeData` to the `NodeData` union

### 2. Backend API — List Webhook Flows

Add `?trigger_type=webhook` and `?group_id=` filter support to `GET /api/flows` in `backend/src/routes/flows.ts`. This returns flows whose trigger node has `triggerType: 'webhook'`. The response includes the parsed `inputSchema` and `group_id` so the frontend can display them and filter by group. The existing `?search=` param already works for name search.

### 3. Backend API — List Groups for Filter

Ensure the existing `GET /api/groups` endpoint (or equivalent) is available so the config form can populate the group filter dropdown. If groups are already fetched elsewhere in the app, reuse that mechanism.

### 4. Backend Catalog (`backend/src/routes/catalog.ts`)

Add a `flow-tool` entry in the `tools` category:
```typescript
{
  type: 'flow-tool', label: 'Flow Tool', category: 'tools',
  description: 'Expose webhook flows as tools for LLM Agents. Select multiple flows — each becomes a callable tool.',
  defaultConfig: { flowIds: [], selectedFlows: [] },
  inputs: 0, outputs: 0,
}
```

### 5. Frontend: Node Component (`frontend/src/components/flow/nodes/FlowToolNode.tsx`)

Follow the `MCPToolNode` pattern — no regular data input/output handles, but exposes a **purple `tool-output` handle** (to connect to an LLM Agent's `tool-input`). Displays the count of selected flows and shows a hint similar to "Connect purple dot to LLM Agent ↓". If no flows selected, shows a "Not configured" indicator.

### 6. Frontend: Config Form (`frontend/src/components/flow/config/FlowToolConfig.tsx`)

A searchable multi-flow picker with group filtering:

- **Data loading**: Fetches webhook flows via `api.flows.list({ trigger_type: 'webhook' })` and groups via `api.groups.list()` (or equivalent)
- **Group filter**: A dropdown at the top to filter flows by group. Options: "All groups" + each group the user has access to
- **Search**: A text input that filters flows by name client-side (or via the API's `?search=` param)
- **Flow list**: A checkbox list showing matching flows, each with:
  - Flow name and description
  - Field count from input schema
  - Group badge/tag
- **Selection state**: `config.flowIds` contains the IDs of selected flows; `config.selectedFlows` caches the metadata (id, name, groupId) for display
- **No input mapping** — parameters come from the LLM at call time
- For schemaless flows, shows an info icon with a tooltip

### 7. Frontend: Wire Up Registration

| File | Change |
|---|---|
| `FlowEditor.tsx` | Import `FlowToolNode`, add to `nodeTypes` map |
| `NodeConfigModal.tsx` | Import `FlowToolConfig`, add `{node.data.type === 'flow-tool' && <FlowToolConfig ... />}` |
| `NodeCatalog.tsx` | Add `'flow-tool': 'integration_instructions'` to `NODE_ICONS` |

### 8. Backend: API Client

No new helper needed — reuse `api.flows.list({ trigger_type: 'webhook', search, group_id })` and `api.groups.list()`. The frontend config form will call these.

### 8. Engine: Tool Definition Injection (`worker/src/executor/engine.ts`)

**In the `case 'llm-agent':` block** (around lines 629–666), extend the existing tool edge filtering to also check for `flow-tool` nodes:

```
For each edge with targetHandle 'tool-input' into the LLM Agent node:
  If source node type is 'mcp-tool' → existing MCP logic (unchanged)
  If source node type is 'flow-tool' → NEW logic:
    For each flowId in config.flowIds:
      1. Get the referenced flow via context.getFlow(flowId)
      2. Find the trigger node, verify it's a webhook trigger
      3. Parse inputSchema (JSON Schema format)
      4. Generate a tool definition:
         name: "flow_" + slugify(flowName)
         description: flow.description
         input_schema: the parsed JSON Schema (or empty {} if none defined)
      5. Push to toolDefs[]
```

Each selected flow becomes one tool definition. The `flow_` prefix namespaces them and prevents collisions with MCP/built-in tools.

### 9. Engine: Tool Call Dispatch (`worker/src/executor/engine.ts`)

**In the tool-use loop** (around lines 789–826), after the existing MCP tool dispatch and before built-in tools, add a `flow-tool` dispatch block:

```
When the LLM calls a tool whose name starts with "flow_":
  1. Extract the flow name from the tool name (strip "flow_" prefix)
  2. Find the matching flow-tool node from the edge connections
  3. Find the flowId in config.flowIds whose slugified name matches
  4. Get the flow definition via context.getFlow(matchingFlowId)
  5. Execute the flow inline:
     - Create a SubFlowExecutor
     - Annotate ancestorFlowIds with current flow's ID (recursion guard)
     - Call subExecutor.execute(flowDef, toolCallInput, onEvent, context)
     - The toolCallInput is the arguments the LLM provided
  6. If successful → return result.output (filtered for output node if present, else { status: "completed" })
  7. If failed → return { status: "failed", error: "<message>" }
```

**Key considerations:**
- **Recursion guard**: Pass `ancestorFlowIds` to `SubFlowExecutor` to prevent a flow from calling itself (directly or through a chain). Already handled by `SubFlowExecutor`'s depth limit + `ancestorFlowIds`.
- **Error handling**: Wrap execution in try/catch. If the flow fails, return `{ status: "failed", error }` as the tool result so the LLM can try something else.
- **Timeout**: The existing abort controller mechanism already handles timeouts.

#### Output Behavior (Webhook Flow Result)

The tool result depends on how the referenced webhook flow ends:

| Scenario | Tool Result |
|---|---|
| **Output node present** | Return the structured output from the output node — the same data the webhook POST would return |
| **No output node** | Return `{ "status": "completed" }` for a successful execution, or `{ "status": "failed", "error": "<message>" }` if any node fails |

In both cases, the engine's `result.output` from `SubFlowExecutor` already contains the accumulated node outputs. The dispatching code checks for the presence of an output node in the subflow to decide which format to return.

### 10. Engine: Flow Registration in Context

`context.getFlow` is already available and used by subflow nodes — no changes needed.

---

## Data Flow Diagram

```
┌─────────────────────────────────────┐
│  LLM Agent Node                     │
│                                     │
│  Tool definitions injected:         │
│  ┌──────────────────────────────┐   │
│  │ "flow_weather_api":          │   │
│  │   { city: string }           │   │
│  ├──────────────────────────────┤   │
│  │ "flow_send_email":           │   │
│  │   { to: string, body: str }  │   │
│  ├──────────────────────────────┤   │
│  │ "flow_calc_shipping":        │   │
│  │   { weight: number, ... }    │   │
│  └──────────────────────────────┘   │
└──────────┬──────────────────────────┘
           │ LLM calls flow_weather_api({city: "Amsterdam"})
           ▼
┌─────────────────────────────────────┐
│  Flow Tool Node                     │
│  (3 flows selected:                  │
│   "Weather API", "Send Email",      │
│   "Calculate Shipping")             │
└──────────┬──────────────────────────┘
           │ subExecutor.execute(flowDef, {city: "Amsterdam"}, ...)
           ▼
┌─────────────────────────────────────┐
│  Webhook Flow "Weather API"         │
│  Trigger (webhook) → ...→ Output    │
└──────────┬──────────────────────────┘
           │ result = { temperature: 18, condition: "cloudy" }
           ▼
┌─────────────────────────────────────┐
│  Back to LLM Agent                  │
│  "The weather in Amsterdam is 18°C  │
│   and cloudy."                      │
└─────────────────────────────────────┘
```

## Resolved Design Decisions

### 1. Schema Format → JSON Schema

Parse `inputSchema` as **JSON Schema** (`{"type":"object","properties":{...}}`), matching what `SubflowNodeConfig.tsx` already does. The webhook route's `validateInput()` has a known inconsistency with simple `{field: type}` format — this is a pre-existing bug unrelated to Flow Tools. The flow-tool node reads the schema purely to generate the LLM tool definition; validation is the webhook endpoint's responsibility.

### 2. Tool Name → `flow_<slugified-flow-name>`

Use a `flow_` prefix to namespace flow tools and prevent collisions with MCP/built-in tools. Example: a flow named "Weather API" becomes tool `flow_weather_api`. The LLM sees this name, and the dispatch code matches against it. The prefix clearly separates flow tools from other tool types in the LLM's view.

### 3. Caching → Not Needed Initially

`context.getFlow` is called once during tool definition collection (per LLM agent execution) and once per tool call. This is acceptable. If profiling shows it's a bottleneck, a simple `Map<string, FlowDefinition>` cache scoped to the execution can be added later.

### 4. Execution Model → SubFlowExecutor

Reuse `SubFlowExecutor` for consistency with the subflow node. Benefits:
- Sub-execution DB records for audit trail
- SSE events (`subflow.started/completed/failed`) for live execution monitoring
- Hierarchy tracking and depth limiting (max 10) — built-in recursion protection
- Error propagation is identical to subflow behavior

### 5. Schemaless Flows → Allowed with Info

A webhook flow without an `inputSchema` is still selectable as a Flow Tool. The tool definition will have an empty `{}` input schema, meaning the LLM can call it with no arguments. The config form shows an info icon with tooltip: *"No input schema defined — callable without parameters."*

### 6. Multi-Flow Selection → `flowIds: string[]`

The node stores multiple flow IDs in `config.flowIds` instead of a single `flowId`. This means:
- The config form is a searchable, group-filterable multi-checkbox list
- The engine iterates all `flowIds` and generates one tool definition per flow
- The node component shows "N flows selected" instead of a single name
- Tool dispatch resolves the called tool name back to the correct flowId by matching the slugified name

---

## Files to Change (Summary)

| # | File | Change |
|---|---|---|---|
| 1 | `shared/src/types/flow.ts` | Add `'flow-tool'` to `NODE_TYPES`, `FlowToolNodeData` (with `flowIds: string[]`), `NodeData` union |
| 2 | `backend/src/routes/flows.ts` | Add `trigger_type` + `group_id` query param filters |
| 3 | `backend/src/routes/catalog.ts` | Add `flow-tool` catalog entry |
| 4 | `frontend/src/components/flow/nodes/FlowToolNode.tsx` | **NEW** — React Flow node component showing flow count |
| 5 | `frontend/src/components/flow/config/FlowToolConfig.tsx` | **NEW** — Searchable multi-flow picker with group filter |
| 6 | `frontend/src/components/flow/FlowEditor.tsx` | Register `FlowToolNode` |
| 7 | `frontend/src/components/flow/NodeConfigModal.tsx` | Register `FlowToolConfig` |
| 8 | `frontend/src/components/flow/NodeCatalog.tsx` | Add icon key `'flow-tool'` |
| 9 | `worker/src/executor/engine.ts` | Tool def injection (iterate `flowIds`) + tool call dispatch (match `flow_` prefix) |
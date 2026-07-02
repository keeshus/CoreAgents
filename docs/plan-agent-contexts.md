# Plan: Agent Contexts Feature

## Summary

Add a layered context system for LLM Agent nodes. Contexts are reusable text prompts
(title + description + content) that are concatenated into the system prompt when a flow
executes. Five layers: **Global** → **Group** → **Flow** → **Agent Contexts** → **Node System Prompt**.

---

## Data Layer

### Existing tables used

- `agent_store` — stores **global context** as key `'global_context'`, value is JSON string.
- `groups` (already exists) — add `context` column for **group context**.
- `flows` (already exists) — add `flow_context` column for **flow context**.

### New table: `agent_contexts`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `title` | `TEXT NOT NULL` | Display name in pickers |
| `description` | `TEXT NOT NULL DEFAULT ''` | Shown as hint in multi-select |
| `content` | `TEXT NOT NULL DEFAULT ''` | The actual prompt text fed to the LLM |
| `created_by` | `UUID REFERENCES users(id)` | |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

### New column on `groups`

| Column | Type | Notes |
|---|---|---|
| `context` | `TEXT NOT NULL DEFAULT ''` | Context prompt for the entire group |

### New column on `flows`

| Column | Type | Notes |
|---|---|---|
| `flow_context` | `TEXT NOT NULL DEFAULT ''` | Context prompt for this specific flow |

---

## Shared Types (`shared/src/types/`)

### New file: `shared/src/types/context.ts`

```ts
export interface AgentContext {
  id: string;
  title: string;
  description: string;
  content: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Extend `LLMAgentNodeData.config` in `shared/src/types/flow.ts`

```ts
export interface LLMAgentNodeData extends BaseNodeData {
  type: 'llm-agent';
  config: {
    // existing fields…
    contextIds?: string[];  // NEW: references to agent_contexts
  };
}
```

### Extend `FlowDefinition` in `shared/src/types/flow.ts`

```ts
export interface FlowDefinition {
  // existing fields…
  flowContext?: string;  // NEW
}
```

### Export from `shared/src/types/index.ts`

```ts
export * from './context.js';
```

---

## Backend

### New route file: `backend/src/routes/agent-contexts.ts`

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/agent-contexts` | (none — like flows) | List all, ordered by title |
| `POST` | `/api/agent-contexts` | `flow:create` | Create with title, description, content |
| `PUT` | `/api/agent-contexts/:id` | `flow:edit` | Update |
| `DELETE` | `/api/agent-contexts/:id` | `flow:delete` | Delete (cascade references) |

### Global context via `agent_store`

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/settings/global-context` | `admin` | Returns `{ value: "..." }` from `agent_store` key `'global_context'` |
| `PUT` | `/api/settings/global-context` | `admin` | Upserts `{ value: "..." }` |

### Group context — extend existing group update

`PUT /api/groups/:id` already accepts `{ name, description }`. Add `context` field.

### Flow context — extend existing flow update

`PUT /api/flows/:id` already accepts `{ name, description, nodes, edges, group_id }`. Add `flow_context`.

### Register routes in `backend/src/index.ts`

```ts
import agentContextsRouter from './routes/agent-contexts.js';
app.use('/api/agent-contexts', authenticate, agentContextsRouter);
```

### Execution context — new resolver methods

In `backend/src/routes/execution.ts` and `backend/src/routes/chat.ts`, add to `ExecutionContext`:

```ts
getGlobalContext: async () => {
  const [row] = await db.select().from(agentStore).where(eq(agentStore.key, 'global_context'));
  return row?.value as string || '';
},
getGroupContext: async (groupId: string) => {
  if (!groupId) return '';
  const [row] = await db.select({ context: groups.context }).from(groups).where(eq(groups.id, groupId));
  return row?.context || '';
},
getAgentContexts: async (contextIds: string[]) => {
  if (!contextIds?.length) return [];
  const rows = await db.select().from(agentContexts).where(inArray(agentContexts.id, contextIds));
  return rows.map(r => ({ title: r.title, content: r.content }));
},
```

---

## Frontend

### 1. Tab bar on flow overview page (`frontend/pages/index.tsx`)

Replace the flat title/description/search bar with a tabbed layout:

| Tab | `activeTab` | Content |
|---|---|---|
| **Flows** | `'flows'` | Existing flow list (unchanged) |
| **Subflows** | `'subflows'` | Stub — "Coming soon" |
| **Agent Contexts** | `'contexts'` | CRUD list of agent contexts |

Tab bar uses M3 `<button>` styling with `m3-label-large` and active indicator
(bottom border + `text-primary`).

Agent Contexts tab shows a flat list of context cards. Each card:
- **Title** (bold)
- **Description** (truncated to 1 line)
- **Content** (truncated to 2 lines, `font-mono text-xs`)
- **Edit** / **Delete** action buttons

"New Context" button at the top opens an inline editor (or modal) with:
- Title (`TextField`)
- Description (`TextField`)
- Content (large `textarea`)

### 2. Global context in Settings

Add a card to `frontend/pages/settings/index.tsx`:

```ts
{
  href: '/settings/global-context',
  icon: 'language',
  title: 'Global Context',
  description: 'Set the global system context for all LLM agents across all flows',
}
```

Only shown for admin users (`can('admin')`).

New page `frontend/pages/settings/global-context.tsx`:
- Large textarea (15 rows) with placeholder: *"Describe your organisation, goals, brand voice, or any universal instructions..."*
- Save button that calls `PUT /api/settings/global-context`

### 3. LLM Agent config panel (`LLMAgentConfig.tsx`)

Add **"Agent Contexts"** multi-select section **right above the System Prompt** textarea.

Fetches available contexts from `GET /api/agent-contexts` on mount.

Renders a list of checkboxes:
```
☐ Marketing Tone (Our brand voice is professional...)
☐ Support Guidelines (Always be empathetic...)
☑ Compliance Rules (Never share financial data...)
```

Each row: checkbox + title (bold, `text-sm`) + description truncation (1 line, `text-xs text-on-surface-variant`).

Stored in `config.contextIds: string[]`.

### 4. Flow Settings modal (flow editor)

#### Remove from bottom bar

Delete the Settings `<Link href="/settings">` from the floating bottom bar (lines 410-414 of `edit.tsx`).

#### Add cog to top bar

Add a cog button (`<Icon name="settings" className="text-xl" />`) to the floating top bar,
right after the Description field (before the Group selector, if present).

#### Flow Settings modal

Clicking opens a `Dialog.Root` (same pattern as `NodeConfigModal`):

- **Flow name** — `TextField` (pre-filled, changes update `flow.name`)
- **Description** — `TextField` multiline
- **Flow Context** — large textarea (10 rows), placeholder: *"Context for this specific flow..."*
- **Group** — `SelectField` (already exists in top bar, move here)
- **Save** button — calls `persistFlow({ ...flow, flowContext, name, description, group_id })`

The modal content is scrollable. Close via `X` button or `onClose`.

---

## Worker Engine

### System prompt composition (`worker/src/executor/engine.ts`)

Before calling the LLM, build the final system prompt — layers from top (broadest) to
bottom (most specific):

1. **Global context** — `context.getGlobalContext()`
2. **Group context** — `context.getGroupContext(flowDef.groupId)`
3. **Flow context** — `flowDef.flowContext`
4. **Selected agent contexts** — `context.getAgentContexts(config.contextIds)`, each as `"[title]:\n{content}"`
5. **Node system prompt** — resolved `config.systemPrompt` (with `{{input...}}` resolved)

Concatenation:

```ts
const contextLayers = [
  globalContext,
  groupContext,
  flowContext,
  ...agentContexts.map(c => `${c.title}:\n${c.content}`),
  resolvedSystemPrompt,
].filter(Boolean).join('\n\n---\n\n');
```

Each layer is separated with `---` so the LLM can distinguish provenance.

### New `ExecutionContext` methods

```ts
export interface ExecutionContext {
  // existing…
  getGlobalContext?: () => Promise<string>;
  getGroupContext?: (groupId: string) => Promise<string>;
  getAgentContexts?: (contextIds: string[]) => Promise<Array<{ title: string; content: string }>>;
}
```

### Flow definition passed to engine

The `FlowDefinition` object already flows through `execution.ts` and `chat.ts`.
Add `flowContext` and `groupId` fields to the mapped `flowDef` so the engine can access them.

Currently `flowDef` is built as:

```ts
const flowDef: FlowDefinition = {
  id: flowId, name: flowName, description: '',
  nodes: flowNodes as any, edges: flowEdges as any,
  version: 0, createdAt, updatedAt,
};
```

Extend to include:

```ts
flowDef.flowContext = flow.flow_context || '';
if (flow.group_id) flowDef.groupId = flow.group_id;
```

Add `groupId` to `FlowDefinition` type.

---

## Implementation Order

| Step | What | Key Files |
|---|---|---|
| 1 | DB migration: `agent_contexts` table, `groups.context`, `flows.flow_context` | `backend/drizzle/`, `backend/src/db/schema.ts` |
| 2 | Shared types: `AgentContext`, extend `LLMAgentNodeData`, `FlowDefinition`, `Group` | `shared/src/types/context.ts`, `shared/src/types/flow.ts`, `shared/src/types/groups.ts` |
| 3 | Backend CRUD for agent contexts | `backend/src/routes/agent-contexts.ts`, `backend/src/index.ts` |
| 4 | Backend global context endpoints | `backend/src/routes/admin.ts` or new file |
| 5 | Backend: group context + flow context in update routes | `backend/src/routes/groups.ts`, `backend/src/routes/flows.ts` |
| 6 | Backend: add getGlobalContext/getGroupContext/getAgentContexts to execution/chat context | `backend/src/routes/execution.ts`, `backend/src/routes/chat.ts` |
| 7 | Frontend: tab bar on flow overview + Agent Contexts CRUD list | `frontend/pages/index.tsx` |
| 8 | Frontend: Global Context settings page | `frontend/pages/settings/global-context.tsx`, `frontend/pages/settings/index.tsx` |
| 9 | Frontend: multi-select context picker in LLMAgentConfig (above System Prompt) | `frontend/src/components/flow/config/LLMAgentConfig.tsx`, `frontend/src/components/flow/NodeConfigModal.tsx` |
| 10 | Frontend: cog button in top bar + Flow Settings modal (name, description, flow context, group) + remove bottom-bar Settings | `frontend/pages/flows/[id]/edit.tsx` |
| 11 | Worker: compose layered system prompts in engine | `worker/src/executor/engine.ts`, `worker/src/executor/runner.ts` |
| 12 | Unit tests & E2E tests | `shared/src/__tests__/`, `test/e2e/` |

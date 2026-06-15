# Generic Data Flow — Input Selection + Data Manipulation Nodes

## Context

Currently every node receives the full accumulated upstream data and spreads `...input` into its output. Data flows through but nodes have no way to be selective — the LLM sees everything, the Branch sees everything. Users need to control exactly what data each node acts on and produce predictable outputs downstream can rely on.

## Part 1: Input Selection on Existing Nodes

Every processing node gets an **"Input Fields"** config that filters what it receives. Like HITL's `displayFields`/`forwardFields`, but generalized:

### LLM Agent config addition:
```
Input Fields: "transactions, summary"  ← only these upstream fields are passed to messages
```

### Branch config addition:
```
Input Fields: "topic, confidence"  ← only these fields are available to the condition expression
```

### Code config addition:
```
Input Fields: "payload.data"  ← shapes what `payload` contains
```

### Engine changes:
`prepareInput()` already merges upstream data into one object. Add a filter step: if the node config has `inputFields`, extract only those fields before passing to the node handler.

### Frontend:
- Add "Input Fields" text input to LLM Agent, Branch, and Code config panels
- Comma-separated field names, empty = all fields

## Part 2: New Data Manipulation Nodes

Three new node types that reshape data between work nodes:

### Mapper Node
| Config | What |
|--------|------|
| `mappings: [{ from: string, to: string }]` | Rename/select fields |
| `keepAll: boolean` | Whether to keep unmapped fields (default true) |

Example: `{ from: "transactions", to: "txs" }` restructures data for the next node.

Output: `{ ...input, ...mappedFields }` where mappedFields has the renamed keys.

### Filter Node
| Config | What |
|--------|------|
| `keep: string[]` | Fields to keep |
| `drop: string[]` | Fields to drop |

Strips sensitive or unnecessary data between nodes. If both `keep` and `drop` are set, `keep` takes priority.

Output: input with only the specified fields kept or removed.

### Merge Node
Multi-input node. Takes all upstream edges and merges them into one object.

Output: `{ ...input1, ...input2, ...input3 }` (later edges override earlier ones on conflict).

Useful after parallel nodes converge, or when multiple paths feed into one output.

## Implementation Plan

### 1. Shared types
- Add `mapper`, `filter`, `merge` to `NODE_TYPES` in `shared/src/types/flow.ts`
- Add corresponding `NodeData` interfaces
- Add `inputFields` to LLMAgentNodeData, BranchNodeData, CodeNodeData

### 2. Engine
- `executeNode` for each new type is simple JS transformation (no external calls)
- Mapper: applies `mappings` to input
- Filter: keeps/drops fields
- Merge: `prepareInput` already merges multiple upstreams — just returns input as-is
- Input filtering: in `execute()`, if node config has `inputFields`, filter stepInput

### 3. Backend
- Catalog entries for all 3 new node types

### 4. Frontend
- Node UI components (`MapperNode.tsx`, `FilterNode.tsx`, `MergeNode.tsx`)
- Config panels with field editors in edit.tsx
- Register in FlowEditor nodeTypes
- "Input Fields" text input in LLM Agent, Branch, Code config panels

### 5. Tests
- Update node count in types test (9 → 12)
- Add unit test for mapper/filter/merge logic

## Files Summary

| File | Change |
|------|--------|
| `shared/src/types/flow.ts` | 3 new types + inputFields on existing |
| `shared/src/__tests__/types.test.ts` | Update count + assertions |
| `worker/src/executor/engine.ts` | Mapper/Filter/Merge handlers + input filtering |
| `frontend/src/components/flow/nodes/MapperNode.tsx` | New |
| `frontend/src/components/flow/nodes/FilterNode.tsx` | New |
| `frontend/src/components/flow/nodes/MergeNode.tsx` | New |
| `frontend/src/components/flow/FlowEditor.tsx` | Register new nodeTypes |
| `frontend/pages/flows/[id]/edit.tsx` | Config panels |
| `backend/src/routes/catalog.ts` | Catalog entries |

# Group-Scoped Resources Plan

**Branch:** `feat/group-scoped-resources`

---

## Problem

LLM endpoints, MCP servers, embedding providers, and vector stores are currently **app-wide only** — any user with `endpoint:write` / `mcp:write` can create/edit/delete them, and they're visible to all users. There's no way for a group admin to manage their own set of resources isolated from other groups.

## Goals

1. Group admins can create and manage LLM endpoints, MCP servers, and knowledge bases (embedding providers + vector stores) scoped to their group
2. Non-admin group members can use group-scoped resources in their flows
3. App-wide resources remain visible to everyone (backward compatible)
4. Flow config dropdowns (LLM Agent, MCP Tool, Retriever nodes) show resources available to the flow's group
5. No breaking changes for existing app-wide resources

---

## Approach: `group_id` column (flows pattern)

Add a nullable `group_id` foreign key to each resource table. Null = app-wide (visible to everyone). Non-null = scoped to that group (visible to group members + admins).

### Why this over `scope`+`scope_id` (secrets pattern)?

| Pattern | Used for | Why |
|---|---|---|
| `group_id` column | Flows | Simple, direct ownership, one group per resource |
| `scope`+`scope_id` | Secrets | Needed for 3-level scoping (app/group/flow) |

Resources like endpoints and MCP servers only need two levels (app-wide or group-scoped), not three. A single `group_id` column is simpler and matches the flows pattern.

---

## Database Changes

Each table gets a nullable `group_id` column:

```sql
ALTER TABLE llm_endpoints ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE mcp_servers ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE embedding_providers ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE vector_stores ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
```

### What this means

| `group_id` | Visibility | Who can manage |
|---|---|---|
| `NULL` | All users (app-wide) | Users with `endpoint:write` / `mcp:write` / etc. |
| `<group_id>` | Group members only | Group admins + users with `endpoint:write` / etc. |

---

## Permission Changes

### New permissions

| Permission | What it grants |
|---|---|
| `endpoint:read_group` | View group-scoped LLM endpoints |
| `endpoint:write_group` | Create/edit/delete group-scoped LLM endpoints |
| `mcp:read_group` | View group-scoped MCP servers |
| `mcp:write_group` | Create/edit/delete group-scoped MCP servers |
| `embedding:read_group` | View group-scoped embedding providers |
| `embedding:write_group` | Create/edit/delete group-scoped embedding providers |
| `store:read_group` | View group-scoped vector stores |
| `store:write_group` | Create/edit/delete group-scoped vector stores |

### Updated roles

**`admin`** — already has `endpoint:*`, `mcp:*`, `embedding:*`, `store:*` which covers all resources (both app-wide and group-scoped) via the existing wildcard matching.

**`group_admin`** — add all new group-scoped permissions:

```
endpoint:read_group, endpoint:write_group,
mcp:read_group, mcp:write_group,
embedding:read_group, embedding:write_group,
store:read_group, store:write_group,
```

**`editor`** — stays read-only for app-wide resources (unchanged). Could add `read_group` variants if editors should see group resources (discuss).

---

## Backend API Changes

### Common pattern for all four route files

```typescript
// LIST — filter by group for non-admin users
router.get('/', requirePermission('endpoint:read'), async (req, res) => {
  const isAdmin = req.user!.permissions?.includes('admin');
  const conditions = [];

  if (!isAdmin) {
    // Get user's groups
    const userGroups = await db.select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, req.user!.userId));
    const groupIds = userGroups.map(g => g.groupId);

    if (groupIds.length > 0) {
      conditions.push(
        or(
          isNull(llmEndpoints.group_id),          // app-wide
          inArray(llmEndpoints.group_id, groupIds),  // user's groups
        ),
      );
    } else {
      conditions.push(isNull(llmEndpoints.group_id)); // only app-wide
    }
  }

  const result = conditions.length > 0
    ? await db.select().from(llmEndpoints).where(and(...conditions))
    : await db.select().from(llmEndpoints);
  res.json(result);
});

// CREATE — accept optional group_id
router.post('/', requirePermission('endpoint:write'), async (req, res) => {
  const { groupId, ...data } = req.body;
  // If group_id is provided, verify user is a group admin
  if (groupId) {
    const isGroupAdmin = await checkGroupAdmin(req.user!.userId, groupId);
    if (!isGroupAdmin && !isAdmin) {
      return res.status(403).json({ error: 'Only group admins can create group-scoped endpoints' });
    }
  }
  // Insert with optional group_id
  const [endpoint] = await db.insert(llmEndpoints).values({ ...data, group_id: groupId || null }).returning();
  res.status(201).json(endpoint);
});

// UPDATE / DELETE — similar guard: if the resource has a group_id, check group admin
```

### `checkGroupAdmin(userId, groupId)` helper

Reusable function (extract to shared utility):

```typescript
async function checkGroupAdmin(userId: string, groupId: string): Promise<boolean> {
  const [member] = await db.select()
    .from(groupMembers)
    .where(and(
      eq(groupMembers.user_id, userId),
      eq(groupMembers.group_id, groupId),
      eq(groupMembers.role, 'admin'),
    ))
    .limit(1);
  return !!member;
}
```

### Execution context — scope lookups by flow's group

The execution context functions (`getEndpoint`, `getMCPServer`, etc.) currently look up by ID globally. They need to also accept a flow's `group_id` to scope the lookup correctly:

```typescript
// execution.ts — getEndpoint
getEndpoint: async (endpointId: string) => {
  const [endpoint] = await db.select().from(llmEndpoints)
    .where(eq(llmEndpoints.id, endpointId)).limit(1);
  if (!endpoint) return null;
  // If endpoint is group-scoped, verify it belongs to the flow's group
  if (endpoint.group_id && endpoint.group_id !== flowGroupId) {
    return null; // not accessible from this flow
  }
  return endpoint;
},
```

### Routes to modify

| File | Changes |
|---|---|
| `backend/src/routes/llm-endpoints.ts` | Add `group_id` to schema, filter list, guard create/update/delete |
| `backend/src/routes/mcp-servers.ts` | Same pattern |
| `backend/src/routes/embedding-providers.ts` | Same pattern |
| `backend/src/routes/vector-stores.ts` | Same pattern |
| `backend/src/routes/execution.ts` | Scope endpoint/MCP/embedding/vector lookups by flow's `group_id` |
| `backend/src/routes/chat.ts` | Same scoping for chat-based execution |
| `backend/src/routes/admin.ts` | Add new permissions to `group_admin` role |

---

## Frontend Changes

### Settings pages — add group selector

Each settings page (`endpoints.tsx`, `mcp-servers.tsx`, `knowledge.tsx`) gets:

1. **Scope toggle** at the top (same pattern as secrets page):
   - "App-wide" (default, shows resources where `group_id` is null)
   - "Group" (dropdown of user's groups, shows resources for selected group)

2. **Create/edit form** — add group selector when creating:
   - "App-wide" or select a specific group
   - User must be a group admin of the selected group (show warning if not)

3. **List items** — show group badge for group-scoped resources:
   - `App-wide` badge for null group_id
   - `Group: <name>` badge for group-scoped resources

### Flow config panels — filter by flow's group

The dropdowns in `LLMAgentConfig.tsx`, `MCPToolConfig.tsx`, and `RetrieverConfig.tsx` currently list all resources globally. They should also include resources for the current flow's group:

```typescript
// Show endpoints that are either app-wide or belong to the flow's group
const availableEndpoints = allEndpoints.filter(ep =>
  !ep.group_id || ep.group_id === flowGroupId
);
```

This ensures flow authors only see endpoints/MCP servers/knowledge bases available to their flow's group.

### Permission gates

- Users with `endpoint:write` (admins) can create app-wide endpoints
- Users with `endpoint:write_group` (group admins) can create group-scoped endpoints
- If a user lacks `endpoint:write` but has `endpoint:write_group`, show the page read-only for app-wide tab but editable for their groups

---

## Files to Create

| File | Purpose |
|---|---|
| (none) | No new files — all changes are modifications to existing files |

---

## Files to Modify

| File | Changes |
|---|---|
| `shared/src/db/schema.ts` | Add `group_id` to `llmEndpoints`, `mcpServers`, `embeddingProviders`, `vectorStores` |
| `backend/src/db/schema.ts` | Re-export from shared (already does) |
| `backend/src/drizzle/...` | New migration: ALTER TABLE statements for all 4 tables |
| `backend/src/routes/admin.ts` | Add new permissions to `group_admin` role |
| `backend/src/routes/llm-endpoints.ts` | Add group_id to CRUD, filter list, guard mutations |
| `backend/src/routes/mcp-servers.ts` | Same pattern |
| `backend/src/routes/embedding-providers.ts` | Same pattern |
| `backend/src/routes/vector-stores.ts` | Same pattern |
| `backend/src/routes/execution.ts` | Scope resource lookups by flow's group_id |
| `backend/src/routes/chat.ts` | Same scoping |
| `frontend/pages/settings/endpoints.tsx` | Add group selector, filter by group, group badges |
| `frontend/pages/settings/mcp-servers.tsx` | Same |
| `frontend/pages/settings/knowledge.tsx` | Same (for both embedding providers + vector stores) |
| `frontend/src/components/flow/config/LLMAgentConfig.tsx` | Filter endpoints by flow's group |
| `frontend/src/components/flow/config/MCPToolConfig.tsx` | Filter MCP servers by flow's group |
| `frontend/src/components/flow/config/RetrieverConfig.tsx` | Filter embedding providers + vector stores by flow's group |

---

## Migration

New Drizzle migration:

```sql
ALTER TABLE llm_endpoints ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE mcp_servers ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE embedding_providers ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE vector_stores ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
```

---

## Implementation Order

| Step | Description |
|---|---|
| 1 | Migration: add `group_id` to all 4 tables in shared schema + SQL |
| 2 | Add new permissions to `admin.ts` role definitions |
| 3 | Add `checkGroupAdmin()` helper to a shared location |
| 4 | Update `llm-endpoints.ts` routes — list filtering, create/update/delete guards |
| 5 | Update `mcp-servers.ts` routes — same pattern |
| 6 | Update `embedding-providers.ts` routes — same pattern |
| 7 | Update `vector-stores.ts` routes — same pattern |
| 8 | Update `execution.ts` + `chat.ts` — scope lookups by flow's group_id |
| 9 | Update frontend settings pages — group selector, filtering, badges |
| 10 | Update flow config panels — filter dropdowns by flow's group |
| 11 | Verify: `npm run build`, `npm test`, E2E suite |

---

## Open Questions

1. **Visibility for editors** — should the `editor` role (currently read-only for app-wide resources) also see group-scoped resources for groups they belong to? Or only group members with explicit `read_group` permissions?
2. **Group admin vs `write_group` permission** — should a group admin automatically have `write_group` permissions, or should it be a separate permission assigned by a super-admin?
3. **Resource assignment** — can a resource be moved from app-wide to group-scoped (or vice versa)? Should the API allow changing `group_id` on update?
4. **Delete cascade** — when a group is deleted, should all its group-scoped resources be deleted too? (Yes, via `ON DELETE CASCADE` in the FK.)

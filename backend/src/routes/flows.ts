import { Router } from 'express';
import { eq, and, asc, desc, sql, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, flowVersions, executions, executionSteps, chatMessages, chatSessions, userAssignments, users, groups, groupMembers } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { FlowExecutor } from '../../../worker/src/executor/engine.js';
import { topologicalSort } from '../../../worker/src/executor/dag.js';

const router = Router();

// GET /api/flows — list all flows
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string) || '';
    const isSubflow = req.query.is_subflow as string | undefined;
    const sortBy = (req.query.sort as string) === 'created_at' ? flows.created_at : flows.updated_at;
    const orderDir = (req.query.order as string) === 'asc' ? asc : desc;
    const conditions: ReturnType<typeof sql>[] = [];
    if (search) {
      conditions.push(sql`(${flows.name}::text ILIKE ${'%' + search + '%'} OR ${flows.description}::text ILIKE ${'%' + search + '%'})`);
    }
    if (isSubflow === 'true') {
      conditions.push(eq(flows.is_subflow, true));
    } else if (isSubflow === 'false') {
      conditions.push(eq(flows.is_subflow, false));
    }

    // Apply group-based filtering for non-admin users
    const isAdmin = req.user?.permissions?.includes('admin');
    let effectiveWhere = conditions.length > 0 ? and(...conditions) : undefined;

    if (!isAdmin) {
      const userGroupIds = await db
        .select({ groupId: groupMembers.group_id })
        .from(groupMembers)
        .where(eq(groupMembers.user_id, req.user!.userId));
      const groupIdList = userGroupIds.map(g => g.groupId);

      const groupFilter = groupIdList.length > 0
        ? or(isNull(flows.group_id), inArray(flows.group_id, groupIdList))
        : isNull(flows.group_id);

      effectiveWhere = effectiveWhere ? and(effectiveWhere, groupFilter) : groupFilter;
    }
    const baseQuery = db.select({
      id: flows.id,
      name: flows.name,
      description: flows.description,
      nodes: flows.nodes,
      edges: flows.edges,
      version: flows.version,
      is_subflow: flows.is_subflow,
      created_by: flows.created_by,
      created_by_name: users.name,
      created_at: flows.created_at,
      updated_at: flows.updated_at,
    }).from(flows).leftJoin(users, eq(flows.created_by, users.id));
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(flows);
    const dataPromise = (effectiveWhere ? baseQuery.where(effectiveWhere) : baseQuery).orderBy(orderDir(sortBy)).limit(limit).offset(offset);
    const countPromise = effectiveWhere ? countQuery.where(effectiveWhere) : countQuery;
    const [result, countResult] = await Promise.all([dataPromise, countPromise]);

    const sortParam = (req.query.sort as string) === 'created_at' ? 'created_at' : 'updated_at';
    res.json({ data: result, total: Number(countResult[0].count), limit, offset, search: search || undefined, sort: sortParam });
  }),
);

// GET /api/flows/check-name — check if a flow name is already taken
router.get(
  '/check-name',
  asyncHandler(async (req, res) => {
    const name = req.query.name as string;
    const excludeId = req.query.exclude as string | undefined;
    if (!name || !name.trim()) {
      res.json({ available: false });
      return;
    }
    const conditions = [sql`LOWER(${flows.name}) = LOWER(${name.trim()})`];
    if (excludeId) conditions.push(sql`${flows.id} != ${excludeId}`);
    const result = await db.select({ id: flows.id }).from(flows).where(and(...conditions)).limit(1);
    res.json({ available: result.length === 0 });
  }),
);

// GET /api/flows/:id — get single flow by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    // Validate UUID format — PostgreSQL rejects non-UUID comparisons
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }
    const result = await db.select({
      id: flows.id,
      name: flows.name,
      description: flows.description,
      nodes: flows.nodes,
      edges: flows.edges,
      version: flows.version,
      is_subflow: flows.is_subflow,
      created_by: flows.created_by,
      created_by_name: users.name,
      group_id: flows.group_id,
      created_at: flows.created_at,
      updated_at: flows.updated_at,
    }).from(flows).leftJoin(users, eq(flows.created_by, users.id)).where(eq(flows.id, id)).limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// POST /api/flows — create new flow (admin / editor)
router.post(
  '/',
  requirePermission('flow:create'),
  asyncHandler(async (req, res) => {
    const { name, description = '', nodes = [], edges = [], group_id } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Flow name is required' });
      return;
    }

    // Check for duplicate name
    const existing = await db.select({ id: flows.id }).from(flows)
      .where(sql`LOWER(${flows.name}) = LOWER(${name.trim()})`).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: 'A flow with this name already exists' });
      return;
    }

    const isSubflow = deriveIsSubflow(nodes);

    const result = await db
      .insert(flows)
      .values({
        name,
        description,
        nodes,
        edges,
        is_subflow: isSubflow,
        created_by: req.user?.userId,
        group_id,
      })
      .returning();

    res.status(201).json(result[0]);
  }),
);

// PUT /api/flows/:id — update flow (admin / editor)
router.put(
  '/:id',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, description, nodes, edges, group_id } = req.body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) {
      updateData.nodes = nodes;
      updateData.is_subflow = deriveIsSubflow(nodes);
    }
    if (edges !== undefined) updateData.edges = edges;
    if (group_id !== undefined) updateData.group_id = group_id;

    // Check for duplicate name if name changed
    if (name !== undefined && name.trim()) {
      const existing = await db.select({ id: flows.id }).from(flows)
        .where(and(sql`LOWER(${flows.name}) = LOWER(${name.trim()})`, sql`${flows.id} != ${id}`)).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: 'A flow with this name already exists' });
        return;
      }
    }

    const result = await db.update(flows).set(updateData).where(eq(flows.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// DELETE /api/flows/:id — delete flow (admin only)
router.delete(
  '/:id',
  requirePermission('flow:delete'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    // Cascade-delete all related records in a single transaction
    await db.transaction(async (tx) => {
      const sessions = await tx.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.flow_id, id));
      for (const s of sessions) {
        await tx.delete(chatMessages).where(eq(chatMessages.session_id, s.id));
      }
      await tx.delete(chatSessions).where(eq(chatSessions.flow_id, id));

      const execs = await tx.select({ id: executions.id }).from(executions).where(eq(executions.flow_id, id));
      for (const e of execs) {
        await tx.delete(executionSteps).where(eq(executionSteps.execution_id, e.id));
        await tx.delete(userAssignments).where(eq(userAssignments.execution_id, e.id));
      }
      await tx.delete(executions).where(eq(executions.flow_id, id));

      await tx.delete(flowVersions).where(eq(flowVersions.flow_id, id));

      const result = await tx.delete(flows).where(eq(flows.id, id)).returning();
      if (result.length === 0) {
        throw new Error('Flow not found');
      }
    });

    res.status(204).send();
  }),
);

// ── Helper: derive is_subflow from trigger nodes ────────────────────────────

function deriveIsSubflow(nodes: any[]): boolean {
  return Array.isArray(nodes) && nodes.some(
    (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'subflow'
  );
}

// ── POST /api/flows/validate — compile/validation endpoint ──────────────────

router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const { nodes = [], edges = [], subflowAncestry = [] } = req.body;
    const errors: string[] = [];

    // Topological sort & cycle detection
    const { sorted, cycles } = topologicalSort(nodes, edges);

    // Check ancestry for recursion cycles
    if (subflowAncestry.length > 0) {
      for (const node of nodes) {
        if (node.data?.type === 'subflow') {
          const targetId = node.data?.config?.subflowId;
          if (targetId && subflowAncestry.includes(targetId)) {
            errors.push(`Circular subflow reference detected at node "${node.data?.label || node.id}": ${[...subflowAncestry, targetId].join(' -> ')}`);
          }
        }
      }

      // Recursion depth check
      if (subflowAncestry.length >= 10) {
        errors.push(`Subflow recursion depth limit exceeded (max 10, current ${subflowAncestry.length})`);
      }
    }

    // Run engine compile validation
    if (cycles.length === 0) {
      try {
        const executor = new FlowExecutor();
        const compileErrors = executor.compileFlow(sorted, edges, {});
        errors.push(...compileErrors);
      } catch (err) {
        errors.push(`Compilation error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Validate subflow nodes have input mappings
    for (const node of nodes) {
      if (node.data?.type === 'subflow') {
        const config = node.data?.config || {};
        if (!config.subflowId) {
          errors.push(`Subflow node "${node.data?.label || node.id}": missing subflowId`);
        }
      }
    }

    res.json({ valid: errors.length === 0, errors });
  }),
);

export default router;

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { agentContexts, groups } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/agent-contexts — list all (optionally filtered by group_id)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const groupId = req.query.group_id as string | undefined;
    const conditions = groupId ? [eq(agentContexts.group_id, groupId)] : [];
    const rows = await db.select({
      id: agentContexts.id,
      title: agentContexts.title,
      description: agentContexts.description,
      content: agentContexts.content,
      group_id: agentContexts.group_id,
      group_name: groups.name,
      created_by: agentContexts.created_by,
      created_at: agentContexts.created_at,
      updated_at: agentContexts.updated_at,
    }).from(agentContexts)
      .leftJoin(groups, eq(agentContexts.group_id, groups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(agentContexts.title);
    res.json(rows);
  }),
);

// GET /api/agent-contexts/:id — get single
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const [row] = await db.select().from(agentContexts).where(eq(agentContexts.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ error: 'Agent context not found' });
      return;
    }
    res.json(row);
  }),
);

// POST /api/agent-contexts — create
router.post(
  '/',
  requirePermission('flow:create'),
  asyncHandler(async (req, res) => {
    const { title, description = '', content = '', group_id } = req.body;
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const [row] = await db
      .insert(agentContexts)
      .values({
        title: title.trim(),
        description,
        content,
        group_id: group_id || null,
        created_by: req.user?.userId,
      })
      .returning();
    // Fetch the created context with group_name for the response
    const [result] = await db.select({
      id: agentContexts.id,
      title: agentContexts.title,
      description: agentContexts.description,
      content: agentContexts.content,
      group_id: agentContexts.group_id,
      group_name: groups.name,
      created_by: agentContexts.created_by,
      created_at: agentContexts.created_at,
      updated_at: agentContexts.updated_at,
    }).from(agentContexts)
      .leftJoin(groups, eq(agentContexts.group_id, groups.id))
      .where(eq(agentContexts.id, row.id));
    res.status(201).json(result);
  }),
);

// PUT /api/agent-contexts/:id — update
router.put(
  '/:id',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { title, description, content, group_id } = req.body;
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    if (group_id !== undefined) updateData.group_id = group_id || null;
    const [row] = await db.update(agentContexts).set(updateData).where(eq(agentContexts.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: 'Agent context not found' });
      return;
    }
    const [result] = await db.select({
      id: agentContexts.id,
      title: agentContexts.title,
      description: agentContexts.description,
      content: agentContexts.content,
      group_id: agentContexts.group_id,
      group_name: groups.name,
      created_by: agentContexts.created_by,
      created_at: agentContexts.created_at,
      updated_at: agentContexts.updated_at,
    }).from(agentContexts)
      .leftJoin(groups, eq(agentContexts.group_id, groups.id))
      .where(eq(agentContexts.id, row.id));
    res.json(result);
  }),
);

// DELETE /api/agent-contexts/:id — delete
router.delete(
  '/:id',
  requirePermission('flow:delete'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const [row] = await db.delete(agentContexts).where(eq(agentContexts.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: 'Agent context not found' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { agentContexts } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/agent-contexts — list all
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(agentContexts).orderBy(agentContexts.title);
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
    const { title, description = '', content = '' } = req.body;
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
        created_by: req.user?.userId,
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/agent-contexts/:id — update
router.put(
  '/:id',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { title, description, content } = req.body;
    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    const [row] = await db.update(agentContexts).set(updateData).where(eq(agentContexts.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: 'Agent context not found' });
      return;
    }
    res.json(row);
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

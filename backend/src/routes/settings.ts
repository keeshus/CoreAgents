import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { agentStore } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/settings/global-context
router.get('/global-context', asyncHandler(async (_req, res) => {
  const [row] = await db.select().from(agentStore).where(eq(agentStore.key, 'global_context')).limit(1);
  res.json({ value: row?.value || '' });
}));

// PUT /api/settings/global-context
router.put('/global-context', requirePermission('admin'), asyncHandler(async (req, res) => {
  const { value } = req.body || {};
  await db.insert(agentStore).values({ key: 'global_context', value }).onConflictDoUpdate({ target: agentStore.key, set: { value, updated_at: new Date() } });
  res.json({ status: 'ok' });
}));

export default router;

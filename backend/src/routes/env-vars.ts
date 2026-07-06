import { Router } from 'express';
import { db } from '../db/connection.js';
import { appEnvVars, groupVaultConfig, groupMembers } from 'core-agents-shared';
import { eq, and } from 'drizzle-orm';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/', requirePermission('admin'), async (req, res) => {
  try {
    let [row] = await db.select().from(appEnvVars).limit(1);
    if (!row) {
      [row] = await db.insert(appEnvVars).values({ env_vars: [] }).returning();
    }
    return res.json(row?.env_vars || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch env vars' });
  }
});

router.put('/', requirePermission('admin'), async (req, res) => {
  try {
    const { envVars } = req.body;
    if (!Array.isArray(envVars)) {
      return res.status(400).json({ error: 'envVars must be an array' });
    }
    let [row] = await db.select().from(appEnvVars).limit(1);
    if (!row) {
      [row] = await db.insert(appEnvVars).values({ env_vars: envVars }).returning();
    } else {
      [row] = await db.update(appEnvVars)
        .set({ env_vars: envVars, updated_at: new Date() })
        .where(eq(appEnvVars.id, row.id))
        .returning();
    }
    return res.json(row?.env_vars || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update env vars' });
  }
});

router.get('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const [config] = await db.select({ env_vars: groupVaultConfig.env_vars })
      .from(groupVaultConfig)
      .where(eq(groupVaultConfig.group_id, groupId))
      .limit(1);
    return res.json(config?.env_vars || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch group env vars' });
  }
});

router.put('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { envVars } = req.body;
    if (!Array.isArray(envVars)) {
      return res.status(400).json({ error: 'envVars must be an array' });
    }

    const userId = (req as any).user?.userId;
    const isAdmin = (req as any).user?.permissions?.includes('admin');
    if (!isAdmin) {
      const [member] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.user_id, userId), eq(groupMembers.group_id, groupId)))
        .limit(1);
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only group admins can update group env vars' });
      }
    }

    const [updated] = await db.update(groupVaultConfig)
      .set({ env_vars: envVars, updated_at: new Date() })
      .where(eq(groupVaultConfig.group_id, groupId))
      .returning();
    return res.json(updated?.env_vars || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update group env vars' });
  }
});

export default router;

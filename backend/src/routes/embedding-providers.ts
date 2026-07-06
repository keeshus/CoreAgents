import { Router } from 'express';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { embeddingProviders, groupMembers } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

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

router.get('/embedding-providers', requirePermission('embedding:read'), asyncHandler(async (req, res) => {
  const isAdmin = req.user!.permissions?.includes('admin');
  const conditions: any[] = [];

  if (!isAdmin) {
    const userGroups = await db.select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, req.user!.userId));
    const groupIds = userGroups.map(g => g.groupId);

    if (groupIds.length > 0) {
      conditions.push(
        or(
          isNull(embeddingProviders.group_id),
          inArray(embeddingProviders.group_id, groupIds),
        ),
      );
    } else {
      conditions.push(isNull(embeddingProviders.group_id));
    }
  }

  const result = conditions.length > 0
    ? await db.select().from(embeddingProviders).where(and(...conditions))
    : await db.select().from(embeddingProviders);

  res.json(result);
}));

router.get('/embedding-providers/:id', requirePermission('embedding:read'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const isAdmin = req.user!.permissions?.includes('admin');
  if (!isAdmin && row.group_id) {
    const userGroups = await db.select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, req.user!.userId));
    const groupIds = userGroups.map(g => g.groupId);
    if (!groupIds.includes(row.group_id)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  res.json(row);
}));

router.post('/embedding-providers', requirePermission('embedding:write', 'embedding:write_group'), asyncHandler(async (req, res) => {
  const { name, providerType, baseUrl, apiKey, model, groupId } = req.body;
  if (!name || !providerType || !apiKey) {
    res.status(400).json({ error: 'name, providerType, and apiKey required' }); return;
  }

  if (groupId) {
    const isAdmin = req.user!.permissions?.includes('admin');
    const isGroupAdmin = await checkGroupAdmin(req.user!.userId, groupId);
    if (!isAdmin && !isGroupAdmin) {
      res.status(403).json({ error: 'Only group admins can create group-scoped embedding providers' });
      return;
    }
  }

  const [row] = await db.insert(embeddingProviders).values({
    name, provider_type: providerType, base_url: baseUrl || null, api_key: apiKey, model: model || 'text-embedding-ada-002',
    group_id: groupId || null,
  }).returning();
  res.status(201).json(row);
}));

router.put('/embedding-providers/:id', requirePermission('embedding:write', 'embedding:write_group'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  const [existing] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  const isAdmin = req.user!.permissions?.includes('admin');
  if (existing.group_id) {
    if (!isAdmin) {
      const isGroupAdmin = await checkGroupAdmin(req.user!.userId, existing.group_id);
      if (!isGroupAdmin) {
        res.status(403).json({ error: 'Only group admins can modify group-scoped embedding providers' });
        return;
      }
    }
  } else {
    if (!isAdmin && !req.user!.permissions.includes('embedding:write')) {
      res.status(403).json({ error: 'Insufficient permissions to modify app-wide embedding providers' });
      return;
    }
  }

  const data: Record<string, unknown> = { updated_at: new Date() };
  const { name, providerType, baseUrl, apiKey, model } = req.body;
  if (name !== undefined) data.name = name;
  if (providerType !== undefined) data.provider_type = providerType;
  if (baseUrl !== undefined) data.base_url = baseUrl;
  if (apiKey !== undefined) data.api_key = apiKey;
  if (model !== undefined) data.model = model;

  const [row] = await db.update(embeddingProviders).set(data).where(eq(embeddingProviders.id, id)).returning();
  res.json(row);
}));

router.delete('/embedding-providers/:id', requirePermission('embedding:write', 'embedding:write_group'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  const [existing] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  const isAdmin = req.user!.permissions?.includes('admin');
  if (existing.group_id) {
    if (!isAdmin) {
      const isGroupAdmin = await checkGroupAdmin(req.user!.userId, existing.group_id);
      if (!isGroupAdmin) {
        res.status(403).json({ error: 'Only group admins can delete group-scoped embedding providers' });
        return;
      }
    }
  } else {
    if (!isAdmin && !req.user!.permissions.includes('embedding:write')) {
      res.status(403).json({ error: 'Insufficient permissions to delete app-wide embedding providers' });
      return;
    }
  }

  await db.delete(embeddingProviders).where(eq(embeddingProviders.id, id));
  res.status(204).send();
}));

export default router;

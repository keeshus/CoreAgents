import { Router } from 'express';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { chatApiKeys, chatApiDeployments, flows } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  return `ca_${crypto.randomBytes(32).toString('hex')}`;
}

// GET /api/flows/:flowId/chat-api/deployment — Get deployment config
router.get('/flows/:flowId/chat-api/deployment', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = req.params.flowId as string;

  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
  if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

  const [deployment] = await db.select().from(chatApiDeployments).where(eq(chatApiDeployments.flow_id, flowId));
  res.json(deployment || { flow_id: flowId, enabled: false, model_name: '', rate_limit: 0 });
}));

// PUT /api/flows/:flowId/chat-api/deployment — Update deployment config
router.put('/flows/:flowId/chat-api/deployment', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = req.params.flowId as string;
  const { enabled, model_name, rate_limit } = req.body || {};

  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
  if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

  // Verify it's a chat flow
  const nodes = (flow.nodes || []) as Array<{ data: { type: string; config: Record<string, unknown> } }>;
  const triggerNode = nodes.find(n => n.data?.type === 'trigger');
  if (!triggerNode || (triggerNode.data as any).config?.triggerType !== 'chat') {
    res.status(400).json({ error: 'Only chat-triggered flows can have a Chat API deployment' });
    return;
  }

  const [existing] = await db.select().from(chatApiDeployments).where(eq(chatApiDeployments.flow_id, flowId));

  if (existing) {
    const [updated] = await db.update(chatApiDeployments)
      .set({
        enabled: enabled !== undefined ? enabled : existing.enabled,
        model_name: model_name !== undefined ? model_name : existing.model_name,
        rate_limit: rate_limit !== undefined ? rate_limit : existing.rate_limit,
        updated_at: new Date(),
      })
      .where(eq(chatApiDeployments.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(chatApiDeployments)
      .values({
        flow_id: flowId,
        enabled: enabled || false,
        model_name: model_name || 'default',
        rate_limit: rate_limit || 0,
      })
      .returning();
    res.status(201).json(created);
  }
}));

// GET /api/flows/:flowId/chat-api/keys — List API keys for a flow
router.get('/flows/:flowId/chat-api/keys', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = req.params.flowId as string;
  const keys = await db.select({
    id: chatApiKeys.id,
    flow_id: chatApiKeys.flow_id,
    label: chatApiKeys.label,
    key_prefix: chatApiKeys.key_prefix,
    enabled: chatApiKeys.enabled,
    last_used_at: chatApiKeys.last_used_at,
    created_by: chatApiKeys.created_by,
    created_at: chatApiKeys.created_at,
    expires_at: chatApiKeys.expires_at,
  }).from(chatApiKeys).where(eq(chatApiKeys.flow_id, flowId));
  res.json(keys);
}));

// POST /api/flows/:flowId/chat-api/keys — Create a new API key
router.post('/flows/:flowId/chat-api/keys', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = req.params.flowId as string;
  const { label } = req.body || {};

  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
  if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8);

  const [keyRecord] = await db.insert(chatApiKeys).values({
    flow_id: flowId,
    label: label || 'Default',
    key_hash: keyHash,
    key_prefix: keyPrefix,
    enabled: true,
    created_by: req.user?.userId,
  }).returning();

  // Return the full raw key once (it won't be shown again)
  res.status(201).json({
    id: keyRecord.id,
    flow_id: keyRecord.flow_id,
    label: keyRecord.label,
    key_prefix: keyRecord.key_prefix,
    raw_key: rawKey,
    enabled: keyRecord.enabled,
    created_at: keyRecord.created_at,
    expires_at: keyRecord.expires_at,
  });
}));

// DELETE /api/flows/:flowId/chat-api/keys/:keyId — Delete an API key
router.delete('/flows/:flowId/chat-api/keys/:keyId', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const flowId = req.params.flowId as string;
  const keyId = req.params.keyId as string;

  const [existing] = await db.select().from(chatApiKeys).where(
    and(eq(chatApiKeys.id, keyId), eq(chatApiKeys.flow_id, flowId))
  );
  if (!existing) { res.status(404).json({ error: 'API key not found' }); return; }

  await db.delete(chatApiKeys).where(eq(chatApiKeys.id, keyId));
  res.status(204).end();
}));

export default router;

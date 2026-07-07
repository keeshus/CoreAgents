import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db/connection.js';
import { apiKeys, apiDeployments } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

function asStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : (v || '');
}

const API_KEY_PREFIX = 'wh_';

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(48).toString('hex');
  const raw = `${API_KEY_PREFIX}${random}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 10);
  return { raw, hash, prefix };
}

function generateSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 63);
}

// POST /api/flows/:flowId/keys/renew — renew personal API key
router.post(
  '/flows/:flowId/keys/renew',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const flowId = asStr(req.params.flowId);
    const [flow] = await db.select({ id: apiDeployments.flow_id }).from(apiDeployments).where(eq(apiDeployments.flow_id, flowId)).limit(1)
    if (!flow) { res.status(404).json({ error: 'Flow not found or not deployed' }); return; }

    const { raw, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      flow_id: flowId,
      user_id: req.user!.userId,
      key_hash: hash,
      key_prefix: prefix,
    }).onConflictDoUpdate({
      target: [apiKeys.flow_id, apiKeys.user_id],
      set: { key_hash: hash, key_prefix: prefix, enabled: true },
    });

    res.json({ rawKey: raw, prefix, createdAt: new Date().toISOString() });
  }),
);

// DELETE /api/flows/:flowId/keys/revoke — revoke personal API key
router.delete(
  '/flows/:flowId/keys/revoke',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const flowId = asStr(req.params.flowId);
    await db.update(apiKeys).set({ enabled: false })
      .where(and(eq(apiKeys.flow_id, flowId), eq(apiKeys.user_id, req.user!.userId)));
    res.status(204).end();
  }),
);

// DELETE /api/flows/:flowId/keys/:userId — admin revoke any user's key
router.delete(
  '/flows/:flowId/keys/:userId',
  requirePermission('admin'),
  asyncHandler(async (req, res) => {
    const flowId = asStr(req.params.flowId);
    const userId = asStr(req.params.userId);
    await db.update(apiKeys).set({ enabled: false })
      .where(and(eq(apiKeys.flow_id, flowId), eq(apiKeys.user_id, userId)));
    res.status(204).end();
  }),
);

// GET /api/flows/:flowId/deployment — get deployment config
router.get(
  '/flows/:flowId/deployment',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const flowId = asStr(req.params.flowId);
    const [deployment] = await db.select().from(apiDeployments).where(eq(apiDeployments.flow_id, flowId)).limit(1)
    if (!deployment) {
      res.json({ pathSlug: '', rateLimit: 0, summary: '' });
      return;
    }
    res.json({ pathSlug: deployment.path_slug, rateLimit: deployment.rate_limit, summary: deployment.summary });
  }),
);

// PUT /api/flows/:flowId/deployment — create/update deployment config
router.put(
  '/flows/:flowId/deployment',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const flowId = asStr(req.params.flowId);
    const { pathSlug, rateLimit, summary } = req.body;

    const slug = pathSlug || generateSlug(req.body.name || flowId);

    const [existing] = await db.select().from(apiDeployments).where(eq(apiDeployments.flow_id, flowId)).limit(1)

    if (existing) {
      const [updated] = await db.update(apiDeployments)
        .set({
          path_slug: slug || existing.path_slug,
          rate_limit: rateLimit !== undefined ? rateLimit : existing.rate_limit,
          summary: summary !== undefined ? summary : existing.summary,
          updated_at: new Date(),
        })
        .where(eq(apiDeployments.flow_id, flowId)).limit(1)
        .returning();
      res.json({ pathSlug: updated.path_slug, rateLimit: updated.rate_limit, summary: updated.summary });
    } else {
      const [created] = await db.insert(apiDeployments).values({
        flow_id: flowId,
        path_slug: slug,
        rate_limit: rateLimit || 0,
        summary: summary || '',
      }).returning();
      res.status(201).json({ pathSlug: created.path_slug, rateLimit: created.rate_limit, summary: created.summary });
    }
  }),
);

export { generateSlug, generateApiKey };
export default router;

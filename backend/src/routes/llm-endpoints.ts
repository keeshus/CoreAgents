import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { llmEndpoints } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/llm-endpoints — list all endpoints
router.get(
  '/',
  requirePermission('endpoint:read'),
  asyncHandler(async (_req, res) => {
    const result = await db.select().from(llmEndpoints);
    res.json(result.map(({ api_key, ...safe }: any) => safe));
  }),
);

// GET /api/llm-endpoints/default — get the default endpoint (for Co-Pilot)
router.get('/default', asyncHandler(async (_req, res) => {
  const [result] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.is_default, true)).limit(1);
  if (!result) { res.status(404).json({ error: 'No default endpoint configured' }); return; }
  const { api_key, ...safe } = result;
  res.json(safe);
}));

// GET /api/llm-endpoints/:id — get single endpoint
router.get(
  '/:id',
  requirePermission('endpoint:read'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, id)).limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: 'LLM endpoint not found' });
      return;
    }

    const { api_key, ...safe } = result[0];
    res.json(safe);
  }),
);

// POST /api/llm-endpoints — create endpoint (admin only)
router.post(
  '/',
  requirePermission('endpoint:write'),
  asyncHandler(async (req, res) => {
    const { name, providerType, baseUrl, apiKey, defaultModel, models = [] } = req.body;

    if (!name || !providerType || !apiKey || !defaultModel) {
      res.status(400).json({ error: 'name, providerType, apiKey, and defaultModel are required' });
      return;
    }

    const validProviders = ['anthropic', 'openai', 'litellm'];
    if (!validProviders.includes(providerType)) {
      res.status(400).json({ error: `providerType must be one of: ${validProviders.join(', ')}` });
      return;
    }

    const result = await db
      .insert(llmEndpoints)
      .values({
        name,
        provider_type: providerType,
        base_url: baseUrl || null,
        api_key: apiKey,
        default_model: defaultModel,
        models,
      })
      .returning();

    res.status(201).json(result[0]);
  }),
);

// PUT /api/llm-endpoints/:id — update endpoint (admin only)
router.put(
  '/:id',
  requirePermission('endpoint:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, providerType, baseUrl, apiKey, defaultModel, models, isDefault } = req.body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (providerType !== undefined) {
      const validProviders = ['anthropic', 'openai', 'litellm'];
      if (!validProviders.includes(providerType)) {
        res.status(400).json({ error: `providerType must be one of: ${validProviders.join(', ')}` });
        return;
      }
      updateData.provider_type = providerType;
    }
    if (baseUrl !== undefined) updateData.base_url = baseUrl;
    if (apiKey !== undefined) updateData.api_key = apiKey;
    if (defaultModel !== undefined) updateData.default_model = defaultModel;
    if (models !== undefined) updateData.models = models;
    if (isDefault === true) {
      await db.update(llmEndpoints).set({ is_default: false }).where(eq(llmEndpoints.is_default, true));
      updateData.is_default = true;
    } else if (isDefault === false) {
      updateData.is_default = false;
    }

    const result = await db.update(llmEndpoints).set(updateData).where(eq(llmEndpoints.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'LLM endpoint not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// DELETE /api/llm-endpoints/:id — delete endpoint (admin only)
router.delete(
  '/:id',
  requirePermission('endpoint:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const result = await db.delete(llmEndpoints).where(eq(llmEndpoints.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'LLM endpoint not found' });
      return;
    }

    res.status(204).send();
  }),
);

export default router;

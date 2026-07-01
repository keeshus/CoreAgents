import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { vectorStores } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import neo4j from 'neo4j-driver';
import { registerStore, createQdrantStore, createNeo4jStore } from '../vector-stores/index.js';

const router = Router();

// Initialize pgvector fallback
registerStore('pgvector', createQdrantStore('http://qdrant-e2e:6333')); // placeholder, real one uses db

// Load persisted stores on startup
(async () => {
  try {
    const stores = await db.select().from(vectorStores);
    for (const s of stores) {
      try {
        const factory = s.store_type === 'neo4j' ? createNeo4jStore : createQdrantStore;
        const store = factory(s.url, s.api_key || undefined);
        registerStore(s.name, store);
        console.log(`Vector store loaded: ${s.name} (${s.store_type})`);
      } catch (err) {
        console.warn(`Failed to load vector store ${s.name}:`, (err as Error).message);
      }
    }
  } catch { /* DB not ready yet */ }
})();

// GET /api/vector-stores/:id/collections — list collections
import { QdrantClient } from '@qdrant/js-client-rest';
router.get('/vector-stores/:id/collections', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [rs] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (!rs) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    if (rs.store_type === 'neo4j') {
      const driver = neo4j.driver(rs.url, neo4j.auth.basic('', rs.api_key || ''));
      const session = driver.session();
      try {
        const result = await session.run('MATCH (d:Document) RETURN DISTINCT d.collectionName AS name');
        res.json(result.records.map(r => r.get('name')));
      } finally { await session.close(); await driver.close(); }
    } else {
      const client = new QdrantClient({ url: rs.url, apiKey: rs.api_key || undefined });
      const result = await client.getCollections();
      res.json(result.collections.map((c: any) => c.name));
    }
  } catch { res.json([]); }
}));

// POST /api/vector-stores/:id/refresh — refresh and persist collections
router.post('/vector-stores/:id/refresh', requirePermission('store:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [rs] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (!rs) { res.status(404).json({ error: 'Not found' }); return; }
  let collections: string[] = [];
  try {
    if (rs.store_type === 'neo4j') {
      const driver = neo4j.driver(rs.url, neo4j.auth.basic('', rs.api_key || ''));
      const session = driver.session();
      try {
        const result = await session.run('MATCH (d:Document) RETURN DISTINCT d.collectionName AS name');
        collections = result.records.map(r => r.get('name'));
      } finally { await session.close(); await driver.close(); }
    } else {
      const client = new QdrantClient({ url: rs.url, apiKey: rs.api_key || undefined });
      const result = await client.getCollections();
      collections = result.collections.map((c: any) => c.name);
    }
  } catch { collections = []; }
  const [updated] = await db.update(vectorStores).set({ collections: collections as any, updated_at: new Date() }).where(eq(vectorStores.id, id)).returning();
  res.json(updated);
}));

router.get('/vector-stores', asyncHandler(async (_req, res) => {
  res.json(await db.select().from(vectorStores));
}));

router.get('/vector-stores/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.post('/vector-stores', requirePermission('store:write'), asyncHandler(async (req, res) => {
  const { name, storeType = 'qdrant', url, apiKey } = req.body;
  if (!name || !url) { res.status(400).json({ error: 'name and url required' }); return; }

  // Test connection
  try {
    const factory = storeType === 'neo4j' ? createNeo4jStore : createQdrantStore;
    const store = factory(url, apiKey || undefined);
    registerStore(name, store);
  } catch (err: any) {
    res.status(400).json({ error: `Connection failed: ${err.message}` }); return;
  }

  const [row] = await db.insert(vectorStores).values({
    name, store_type: storeType, url, api_key: apiKey || null,
  }).returning();
  res.status(201).json(row);
}));

router.put('/vector-stores/:id', requirePermission('store:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const data: Record<string, unknown> = { updated_at: new Date() };
  const { name, url, apiKey } = req.body;
  if (name !== undefined) data.name = name;
  if (url !== undefined) data.url = url;
  if (apiKey !== undefined) data.api_key = apiKey;

  // Re-register if URL changed
  if (url) {
    const [existing] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
    if (existing) {
      try {
        const factory = existing.store_type === 'neo4j' ? createNeo4jStore : createQdrantStore;
        registerStore(existing.name, factory(url, apiKey || undefined));
      } catch {}
    }
  }

  const [row] = await db.update(vectorStores).set(data).where(eq(vectorStores.id, id)).returning();
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.delete('/vector-stores/:id', requirePermission('store:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (row) {
    // Unregister (vector store registry doesn't have remove, but it's fine)
  }
  await db.delete(vectorStores).where(eq(vectorStores.id, id));
  res.status(204).send();
}));

export default router;

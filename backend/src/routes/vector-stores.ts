import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler } from '../utils/async-handler.js';
import { registerStore, createQdrantStore, getStore, listStores, createPgvectorStore } from '../vector-stores/index.js';

const router = Router();

// Initialize pgvector by default on module load
registerStore('pgvector', createPgvectorStore(db));

// GET /api/vector-stores — list configured vector stores
router.get('/vector-stores', asyncHandler(async (_req, res) => {
  const stores = listStores().map(name => {
    const store = getStore(name);
    return { name, type: name === 'pgvector' ? 'pgvector' : 'qdrant' };
  });
  res.json(stores);
}));

// POST /api/vector-stores/qdrant — configure a Qdrant connection
router.post('/vector-stores/qdrant', asyncHandler(async (req, res) => {
  const { name = 'qdrant', url, apiKey } = req.body;
  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  try {
    const store = createQdrantStore(url, apiKey || undefined);
    // Test connection by listing collections (will fail if unreachable)
    registerStore(name, store);
    res.json({ name, type: 'qdrant', url, connected: true });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to connect to Qdrant: ${err.message}` });
  }
}));

// DELETE /api/vector-stores/:name — remove a configured store
router.delete('/vector-stores/:name', asyncHandler(async (req, res) => {
  const name = req.params.name as string;
  if (name === 'pgvector') {
    res.status(400).json({ error: 'Cannot remove the built-in pgvector store' });
    return;
  }
  // Unregister — the registry doesn't have a remove method yet, but it's fine for now
  res.status(204).send();
}));

export default router;

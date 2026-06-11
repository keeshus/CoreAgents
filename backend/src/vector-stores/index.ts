/**
 * Pluggable vector store abstraction.
 * Supports pgvector (built-in) and Qdrant (external).
 */
import { sql } from 'drizzle-orm';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface VectorSearchResult {
  documentId: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

export interface VectorStore {
  search(
    collectionName: string,
    queryEmbedding: number[],
    topK: number,
    minScore: number,
  ): Promise<VectorSearchResult[]>;

  upsert(
    collectionName: string,
    points: Array<{
      id: string;
      embedding: number[];
      payload: { documentId: string; chunkText: string; chunkIndex: number };
    }>,
  ): Promise<void>;

  deleteCollection(collectionName: string): Promise<void>;
}

// ── pgvector implementation ──────────────────────────────────

export function createPgvectorStore(db: any): VectorStore {
  return {
    async search(collectionName, queryEmbedding, topK, minScore) {
      const embeddingStr = `[${queryEmbedding.join(',')}]`;
      const results = await db.execute(sql`
        SELECT
          e.document_id AS "documentId",
          e.chunk_text AS "chunkText",
          e.chunk_index AS "chunkIndex",
          1 - (e.embedding <=> ${embeddingStr}::vector) AS similarity
        FROM embeddings e
        JOIN documents d ON d.id = e.document_id
        WHERE d.collection_name = ${collectionName}
          AND 1 - (e.embedding <=> ${embeddingStr}::vector) >= ${minScore}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `);
      return (results.rows || []) as VectorSearchResult[];
    },

    async upsert(collectionName, points) {
      // pgvector uses the embeddings table, inserted via the normal flow
      // This is handled by the knowledge upload route
      throw new Error('pgvector upsert handled via SQL, not this adapter');
    },

    async deleteCollection(collectionName) {
      // Handled by the knowledge route
      throw new Error('pgvector deletion handled via SQL, not this adapter');
    },
  };
}

// ── Qdrant implementation ────────────────────────────────────

export function createQdrantStore(url: string, apiKey?: string): VectorStore {
  const client = new QdrantClient({ url, apiKey });

  return {
    async search(collectionName, queryEmbedding, topK, minScore) {
      // Qdrant collection names must be valid identifiers
      const safeName = collectionName.replace(/[^a-zA-Z0-9_-]/g, '_');

      try {
        const result = await client.search(safeName, {
          vector: queryEmbedding,
          limit: topK,
          score_threshold: minScore,
          with_payload: true,
        });

        return result.map(r => ({
          documentId: (r.payload as any)?.documentId || '',
          chunkText: (r.payload as any)?.chunkText || '',
          chunkIndex: (r.payload as any)?.chunkIndex || 0,
          similarity: r.score,
        }));
      } catch (err: any) {
        // Collection might not exist yet
        if (err?.status === 404 || err?.message?.includes('not found')) {
          return [];
        }
        throw err;
      }
    },

    async upsert(collectionName, points) {
      const safeName = collectionName.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Ensure collection exists
      try {
        await client.getCollection(safeName);
      } catch {
        await client.createCollection(safeName, {
          vectors: { size: points[0]?.embedding.length || 1536, distance: 'Cosine' },
        });
      }

      await client.upsert(safeName, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.embedding,
          payload: p.payload,
        })),
      });
    },

    async deleteCollection(collectionName) {
      const safeName = collectionName.replace(/[^a-zA-Z0-9_-]/g, '_');
      try { await client.deleteCollection(safeName); } catch {}
    },
  };
}

// ── Store registry ───────────────────────────────────────────

const stores = new Map<string, VectorStore>();

export function registerStore(name: string, store: VectorStore) {
  stores.set(name, store);
}

export function getStore(name: string): VectorStore | undefined {
  return stores.get(name);
}

export function listStores(): string[] {
  return Array.from(stores.keys());
}

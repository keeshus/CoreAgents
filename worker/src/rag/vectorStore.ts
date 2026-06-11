import { sql } from 'drizzle-orm';

// The caller must pass in the db instance
export async function searchSimilar(
  db: any,
  collectionName: string,
  queryEmbedding: number[],
  topK: number = 5,
  minScore: number = 0.7
): Promise<Array<{ documentId: string; chunkText: string; chunkIndex: number; similarity: number }>> {
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

  return (results.rows || []) as any[];
}

import OpenAI from 'openai';

// Default: use OpenAI embeddings API. Can be swapped for a local model.
export async function generateEmbedding(
  text: string,
  options?: { apiKey?: string; model?: string }
): Promise<number[]> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  const model = options?.model || 'text-embedding-ada-002';

  if (!apiKey) {
    // Fallback: return a zero vector for development without API key
    console.warn('No OPENAI_API_KEY set — returning zero embedding vector');
    return new Array(1536).fill(0);
  }

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model,
    input: text,
  });

  return response.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

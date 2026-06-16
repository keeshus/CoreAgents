/**
 * Worker consumer entry point.
 * Listens to the BullMQ queue and executes flows as jobs arrive.
 */
import { createExecutionWorker } from './queue.js';
import { FlowExecutor } from './executor/engine.js';
import type { ExecutionContext } from './executor/engine.js';

async function main() {
  console.log('Worker started, waiting for jobs...');

  // Lazy-load DB dependencies at runtime
  const { db } = await import('../../backend/src/db/connection.js');
  const { llmEndpoints } = await import('../../backend/src/db/schema.js');
  const { eq } = await import('drizzle-orm');

  const worker = createExecutionWorker(async (job) => {
    const { flow, input } = job;
    console.log(`Executing flow: ${flow.name} (${flow.id})`);

    const executionContext: ExecutionContext = {
      getEndpoint: async (endpointId: string) => {
        const [endpoint] = await db
          .select()
          .from(llmEndpoints)
          .where(eq(llmEndpoints.id, endpointId));
        if (!endpoint) return null;
        return {
          providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
          apiKey: endpoint.api_key,
          baseUrl: endpoint.base_url,
        };
      },
      flowNodes: flow.nodes,
      flowEdges: flow.edges,
    };

    const executor = new FlowExecutor();
    const result = await executor.execute(flow, input, async () => {}, executionContext);
    console.log(`Flow ${flow.id} completed`);
  });

  process.on('SIGTERM', () => {
    console.log('Worker: shutting down...');
    worker.close();
  });
  process.on('SIGINT', () => {
    console.log('Worker: shutting down...');
    worker.close();
  });
}

main().catch((err) => {
  console.error('Worker: failed to start:', err);
  process.exit(1);
});

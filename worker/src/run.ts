/**
 * Worker process entry point.
 * Runs the scheduler for cron-based flow triggers.
 */
import { Scheduler } from './scheduler.js';
import { FlowExecutor } from './executor/engine.js';

// Lazy-load DB dependencies at runtime
async function main() {
  console.log('Worker starting...');

  // Dynamically import DB modules (available at runtime via tsx)
  const { db } = await import('../../../backend/src/db/connection.js');
  const { flows, llmEndpoints } = await import('../../../backend/src/db/schema.js');
  const { eq } = await import('drizzle-orm');

  const scheduler = new Scheduler(
    // Load scheduled flows from DB
    async () => {
      const allFlows = await db.select().from(flows);
      const scheduled: Array<{
        flowId: string;
        flowName: string;
        cronExpression: string;
        scheduleInput: string | undefined;
        nodes: any[];
        edges: any[];
      }> = [];

      for (const flow of allFlows) {
        const nodes = (flow.nodes || []) as any[];
        const trigger = nodes.find((n: any) => n.data?.type === 'trigger');
        if (!trigger) continue;

        const config = trigger.data?.config || {};
        if (config.triggerType === 'schedule' && config.cronExpression) {
          scheduled.push({
            flowId: flow.id,
            flowName: flow.name,
            cronExpression: config.cronExpression,
            scheduleInput: config.scheduleInput || undefined,
            nodes: flow.nodes as any[],
            edges: flow.edges as any[],
          });
        }
      }

      return scheduled;
    },

    // Execute a scheduled flow
    async (scheduledFlow) => {
      const executionContext = {
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
        flowNodes: scheduledFlow.nodes,
        flowEdges: scheduledFlow.edges,
      };

      const executor = new FlowExecutor();

      await executor.execute(
        {
          id: scheduledFlow.flowId,
          name: scheduledFlow.flowName,
          description: '',
          nodes: scheduledFlow.nodes,
          edges: scheduledFlow.edges,
          version: 1,
          createdAt: '',
          updatedAt: '',
        },
        (() => {
          const raw = scheduledFlow.scheduleInput?.trim();
          if (!raw) return { triggerType: 'schedule', timestamp: new Date().toISOString() };
          try {
            const parsed = JSON.parse(raw);
            return { triggerType: 'schedule', timestamp: new Date().toISOString(), ...parsed };
          } catch {
            return { triggerType: 'schedule', timestamp: new Date().toISOString(), message: raw };
          }
        })(),
        async () => {}, // No SSE streaming needed for scheduled runs
        executionContext,
      );
    },
  );

  await scheduler.start();

  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('Worker: shutting down...');
    scheduler.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('Worker: shutting down...');
    scheduler.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Worker: failed to start:', err);
  process.exit(1);
});

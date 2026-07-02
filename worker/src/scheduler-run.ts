/**
 * Scheduler entry point.
 * Loads scheduled flows from the database and starts the cron-based scheduler.
 * This runs as a separate process from the worker consumer.
 */
import { Scheduler } from './scheduler.js';

async function main() {
  console.log('Scheduler starting...');

  // Dynamically import DB modules
  const { db } = await import('../../backend/src/db/connection.js');
  const { flows } = await import('../../backend/src/db/schema.js');

  const scheduler = new Scheduler(async () => {
    const allFlows = await db.select().from(flows);
    const scheduled: Array<{
      flowId: string;
      flowName: string;
      cronExpression: string;
      inputMessage: string | undefined;
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
          inputMessage: config.inputMessage || undefined,
          nodes: flow.nodes as any[],
          edges: flow.edges as any[],
          flowContext: flow.flow_context || '',
          groupId: flow.group_id || undefined,
        });
      }
    }

    return scheduled;
  });

  await scheduler.start();

  process.on('SIGTERM', () => {
    console.log('Scheduler: shutting down...');
    scheduler.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('Scheduler: shutting down...');
    scheduler.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Scheduler: failed to start:', err);
  process.exit(1);
});

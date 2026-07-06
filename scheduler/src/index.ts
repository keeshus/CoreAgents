import { Scheduler } from './scheduler.js';
import { getDb, flows } from 'core-agents-shared';
import { Queue } from 'bullmq';
import type { FlowDefinition } from 'core-agents-shared';

const connection = {
  host: process.env.VALKEY_HOST || 'localhost',
  port: Number(process.env.VALKEY_PORT) || 6379,
  password: process.env.VALKEY_PASSWORD || undefined,
  ...(process.env.VALKEY_TLS === 'true' ? { tls: {} } : {}),
};

const queue = new Queue('flow-executions', { connection });

async function main() {
  console.log('Scheduler starting...');

  const { db } = getDb();

  const scheduler = new Scheduler(
    async () => {
      const allFlows = await db.select().from(flows);
      const scheduled: Array<{
        flowId: string;
        flowName: string;
        cronExpression: string;
        inputMessage: string | undefined;
        nodes: any[];
        edges: any[];
        flowContext: string;
        groupId: string | undefined;
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
    },
    async (flowDef: FlowDefinition, input: Record<string, unknown>) => {
      await queue.add('execute-flow', { flow: flowDef, input }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    },
  );

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

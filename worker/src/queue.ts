import { Queue, Worker as QueueWorker } from 'bullmq';
import type { FlowDefinition } from 'core-agents-shared';

const connection = {
  host: process.env.VALKEY_HOST || 'localhost',
  port: Number(process.env.VALKEY_PORT) || 6379,
  password: process.env.VALKEY_PASSWORD || undefined,
  ...(process.env.VALKEY_TLS === 'true' ? { tls: {} } : {}),
};

export const executionQueue = new Queue('flow-executions', { connection });

export async function enqueueExecution(flow: FlowDefinition, input: Record<string, unknown>) {
  return executionQueue.add(
    'execute-flow',
    { flow, input },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  );
}

export function createExecutionWorker(
  handler: (job: { flow: FlowDefinition; input: Record<string, unknown> }) => Promise<void>,
) {
  const worker = new QueueWorker(
    'flow-executions',
    async (job) => {
      await handler(job.data as any);
    },
    { connection },
  );
  return worker;
}

/**
 * Worker consumer entry point.
 * Listens to the BullMQ queue and executes flows as jobs arrive.
 */
import { createExecutionWorker } from './queue.js';
import { executeFlowWithPersistence } from './executor/runner.js';
import { createSidecarClient, createReaper } from './sandbox/index.js';

async function main() {
  console.log('Worker started, waiting for jobs...');

  const { getDb, executions, executionSteps, agentContexts, agentStore, groups } = await import('core-agents-shared');
  const { db } = getDb();
  const { eq, and, inArray } = await import('drizzle-orm');

  const sidecarClient = createSidecarClient();
  const reaper = createReaper(sidecarClient, db, executions);

  const worker = createExecutionWorker(async (job) => {
    const { flow, input } = job;
    const executionId = (input as any)?.__executionId as string | undefined;
    console.log(`Executing flow: ${flow.name} (${flow.id})${executionId ? ' exec=' + executionId : ''}`);

    let execId = executionId;
    if (!execId) {
      const [exec] = await db.insert(executions).values({
        flow_id: flow.id, status: 'running', input, started_at: new Date(),
      }).returning();
      execId = exec.id;
    } else {
      await db.update(executions).set({ status: 'running', started_at: new Date() })
        .where(eq(executions.id, execId));
    }

    const result = await executeFlowWithPersistence({
      flow,
      input,
      executionId: execId,
      db,
      executionsTable: executions,
      executionStepsTable: executionSteps,
      eq,
      and,
      inArray,
      agentContextsTable: agentContexts,
      agentStoreTable: agentStore,
      groupsTable: groups,
    });

    console.log(`Flow ${flow.id}: ${result.status} (exec ${execId})`);
  });

  reaper.start();

  process.on('SIGTERM', () => {
    console.log('Worker: shutting down...');
    reaper.stop();
    worker.close();
  });
  process.on('SIGINT', () => {
    console.log('Worker: shutting down...');
    reaper.stop();
    worker.close();
  });
}

main().catch((err) => {
  console.error('Worker: failed to start:', err);
  process.exit(1);
});

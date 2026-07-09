import { executionQueue } from './queue.js';
import type { FlowDefinition } from 'core-agents-shared';

let reconciliationInterval: NodeJS.Timeout | null = null;

function getCronFromFlow(flow: any): string | null {
  const nodes = (flow.nodes || []) as any[];
  const trigger = nodes.find(
    (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'schedule',
  );
  const cron = trigger?.data?.config?.cronExpression as string | undefined;
  return cron?.trim() || null;
}

export async function reconcileSchedules(db: any, flowsTable: any, eq: any): Promise<void> {
  try {
    const allFlows = await db.select({ id: flowsTable.id, nodes: flowsTable.nodes }).from(flowsTable);
    const repeatableJobs = await executionQueue.getRepeatableJobs();

    const bullJobs = new Map<string, string>();
    for (const job of repeatableJobs) {
      const flowId = job.id?.replace(/^schedule:/, '');
      if (flowId) bullJobs.set(flowId, job.pattern);
    }

    for (const flow of allFlows) {
      const dbCron = getCronFromFlow(flow);

      if (dbCron) {
        const bullPattern = bullJobs.get(flow.id);
        if (!bullPattern || bullPattern !== dbCron) {
          if (bullPattern) {
            await executionQueue.removeRepeatable(`schedule:${flow.id}`, { pattern: bullPattern });
          }
          await executionQueue.add(`schedule:${flow.id}`, { flowId: flow.id }, {
            repeat: { pattern: dbCron },
            jobId: `schedule:${flow.id}`,
          });
        }
      } else if (bullJobs.has(flow.id)) {
        await executionQueue.removeRepeatable(`schedule:${flow.id}`, { pattern: bullJobs.get(flow.id)! });
      }
    }
  } catch (err) {
    console.error('Schedule reconciliation failed:', err instanceof Error ? err.message : String(err));
  }
}

export function startReconciliation(db: any, flowsTable: any, eq: any): void {
  if (reconciliationInterval) return;
  reconcileSchedules(db, flowsTable, eq);
  reconciliationInterval = setInterval(() => reconcileSchedules(db, flowsTable, eq), 3600_000);
}

export function stopReconciliation(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
  }
}

import { executionQueue } from './queue.js';
import type { FlowDefinition } from 'orchestream-ai-shared';

let reconciliationInterval: NodeJS.Timeout | null = null;

function getCronFromFlow(flow: any): string | null {
  const nodes = (flow.nodes || []) as any[];
  const trigger = nodes.find(
    (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'schedule',
  );
  const cron = trigger?.data?.config?.cronExpression as string | undefined;
  return cron?.trim() || null;
}

function getInputMessageFromFlow(flow: any): Record<string, unknown> | undefined {
  const nodes = (flow.nodes || []) as any[];
  const trigger = nodes.find(
    (n: any) => n.data?.type === 'trigger' && n.data?.config?.triggerType === 'schedule',
  );
  const raw = trigger?.data?.config?.inputMessage as string | undefined;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function reconcileSchedules(db: any, flowsTable: any, eq: any): Promise<void> {
  try {
    const allFlows = await db.select({ id: flowsTable.id, nodes: flowsTable.nodes }).from(flowsTable);
    // BullMQ 6: repeatable jobs are managed as Job Schedulers.
    const schedulers = await executionQueue.getJobSchedulers();

    const bullJobs = new Map<string, string>();
    for (const scheduler of schedulers) {
      const flowId = scheduler.name?.replace(/^schedule:/, '');
      if (flowId && scheduler.pattern) bullJobs.set(flowId, scheduler.pattern);
    }

    for (const flow of allFlows) {
      const dbCron = getCronFromFlow(flow);

      if (dbCron) {
        const bullPattern = bullJobs.get(flow.id);
        if (!bullPattern || bullPattern !== dbCron) {
          await executionQueue.upsertJobScheduler(`schedule:${flow.id}`, { pattern: dbCron }, {
            name: `schedule:${flow.id}`,
            data: { flowId: flow.id, inputMessage: getInputMessageFromFlow(flow) },
          });
        }
      } else if (bullJobs.has(flow.id)) {
        await executionQueue.removeJobScheduler(`schedule:${flow.id}`);
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

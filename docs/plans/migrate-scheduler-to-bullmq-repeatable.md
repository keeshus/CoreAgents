# Migrate Scheduler to BullMQ Repeatable Jobs

## Problem

The scheduler is a standalone service with a single point of failure:

- Polls the DB every 30s — can miss exact cron minutes
- In-memory state only; restarts lose the `lastRun` map, risking duplicate triggers
- If the scheduler container goes down, no scheduled flows execute until it comes back
- No horizontal scaling (multiple instances would double-trigger)
- One extra service to deploy, monitor, and maintain

## Solution

Eliminate the scheduler service entirely. Use BullMQ's native repeatable jobs instead.

BullMQ stores repeatable job definitions in Redis and handles cron matching internally using sorted sets — no polling, no in-memory state, distributed coordination built in.

---

## Migration Steps

### 1. Add repeatable job management to flow CRUD

In `backend/src/routes/flows.ts`, add BullMQ calls on create, update, and delete:

**Create flow (POST /):**

After the insert succeeds and the webhook hook runs, check if the trigger node has `triggerType: 'schedule'` with a `cronExpression`. If so:

```ts
import { executionQueue } from 'core-agents-worker/queue';

// Inline worker import to avoid circular dep; or extract queue access to shared lib
await executionQueue.add(
  `schedule:${flow.id}`,
  { flowId: flow.id },
  {
    repeat: { pattern: cronExpression },
    jobId: `schedule:${flow.id}`,       // stable ID prevents duplicates
  },
);
```

BullMQ deduplicates by `jobId` — adding the same repeatable job twice is a no-op.

**Update flow (PUT /:id):**

Compare the old and new trigger config. If the cron expression changed:

```ts
// Remove old schedule
await executionQueue.removeRepeatable(
  `schedule:${flow.id}`,
  { pattern: oldCron },
);

// Add new schedule (if triggerType is still 'schedule')
await executionQueue.add(
  `schedule:${flow.id}`,
  { flowId: flow.id },
  { repeat: { pattern: newCron }, jobId: `schedule:${flow.id}` },
);
```

If the trigger was changed from `schedule` to something else, remove the repeatable job.

**Delete flow (DELETE /:id):**

```ts
if (triggerType === 'schedule' && cronExpression) {
  await executionQueue.removeRepeatable(
    `schedule:${flow.id}`,
    { pattern: cronExpression },
  );
}
```

### 2. Remove the scheduler service

- Delete `scheduler/src/` directory
- Remove `scheduler/Dockerfile`
- Remove `scheduler/package.json`
- Remove scheduler service from `docker-compose.yml`
- Remove scheduler from `helm/core-agents/templates/scheduler.yaml`
- Remove scheduler from any CI/CD or deployment scripts

### 3. Create a reconciliation job

BullMQ's repeatable jobs are stored in Redis. If a flow's cron expression is somehow updated via direct DB manipulation (migration, bug, etc.), the repeatable job in Redis can become orphaned — either missing when it should exist, or still running when the flow no longer has a schedule.

Add a lightweight **reconciliation worker** that periodically checks DB against BullMQ and fixes mismatches.

```ts
// backend/src/services/schedule-reconciliation.ts
import { executionQueue } from 'core-agents-worker/queue';
import { db, flows } from 'core-agents-shared';

async function isRepeatableRegistered(flowId: string, cronExpression: string): Promise<boolean> {
  const repeatable = await executionQueue.getRepeatableJobs();
  return repeatable.some(
    (j: any) => j.id === `schedule:${flowId}` && j.pattern === cronExpression,
  );
}

export async function reconcileSchedules(): Promise<{ added: number; removed: number; errors: string[] }> {
  const allFlows = await db.select().from(flows);
  const repeatableJobs = await executionQueue.getRepeatableJobs();
  const errors: string[] = [];
  let added = 0;
  let removed = 0;

  // Convert repeatable jobs to a Map<flowId, pattern>
  const bullJobs = new Map<string, string>();
  for (const job of repeatableJobs) {
    const flowId = job.id?.replace(/^schedule:/, '');
    if (flowId) bullJobs.set(flowId, job.pattern);
  }

  for (const flow of allFlows) {
    const nodes = (flow.nodes || []) as any[];
    const trigger = nodes.find((n: any) => n.data?.type === 'trigger');
    const config = trigger?.data?.config || {};
    const dbPattern = config.triggerType === 'schedule' && config.cronExpression
      ? (config.cronExpression as string).trim()
      : null;

    if (dbPattern) {
      const bullPattern = bullJobs.get(flow.id);
      if (!bullPattern) {
        // Missing in BullMQ — add it
        try {
          await executionQueue.add(`schedule:${flow.id}`, { flowId: flow.id }, {
            repeat: { pattern: dbPattern },
            jobId: `schedule:${flow.id}`,
          });
          added++;
        } catch (e) { errors.push(`Failed to add schedule for ${flow.id}: ${e}`); }
      } else if (bullPattern !== dbPattern) {
        // Pattern mismatch — update it
        try {
          await executionQueue.removeRepeatable(`schedule:${flow.id}`, { pattern: bullPattern });
          await executionQueue.add(`schedule:${flow.id}`, { flowId: flow.id }, {
            repeat: { pattern: dbPattern },
            jobId: `schedule:${flow.id}`,
          });
          added++;
        } catch (e) { errors.push(`Failed to update schedule for ${flow.id}: ${e}`); }
      }
    } else {
      // Flow has no schedule but BullMQ has a repeatable job — orphaned
      if (bullJobs.has(flow.id)) {
        try {
          await executionQueue.removeRepeatable(`schedule:${flow.id}`, { pattern: bullJobs.get(flow.id)! });
          removed++;
        } catch (e) { errors.push(`Failed to remove orphaned schedule for ${flow.id}: ${e}`); }
      }
    }
  }

  return { added, removed, errors };
}
```

**When to reconcile:**

| Trigger | How |
|---|---|
| Worker startup | Run once before starting the execution worker |
| Interval (e.g., every hour) | `setInterval(reconcileSchedules, 3600_000)` runs as a background loop in the worker or backend |
| Flow CRUD error fallback | If the BullMQ call in POST/PUT/DELETE fails, log and defer to the next reconciliation cycle |

### 4. Update the execution worker

The current worker processes `execute-flow` jobs with full `{ flow, input }` payloads. The repeatable job payload is smaller — just `{ flowId }`. The worker needs to handle both shapes:

```ts
// In worker's job handler
const { flow, flowId, input } = job.data;

let flowDef: FlowDefinition;
if (flow) {
  // Direct enqueue (webhook, manual trigger)
  flowDef = flow;
} else {
  // Repeatable schedule trigger — load flow from DB
  const [dbFlow] = await db.select().from(flows).where(eq(flows.id, flowId));
  if (!dbFlow) { /* error, not found */ }
  flowDef = { id: dbFlow.id, name: dbFlow.name, nodes: dbFlow.nodes, ... };
}
```

This avoids storing the full flow definition in every repeatable job, keeping Redis lean.

---

## Files to Change

| File | Change |
|---|---|
| `backend/src/routes/flows.ts` | Add BullMQ `add`/`removeRepeatable` calls on POST/PUT/DELETE |
| `worker/src/queue.ts` | Export `executionQueue` so backend can import it |
| `backend/src/services/schedule-reconciliation.ts` | New file — reconciliation logic |
| `worker/src/run.ts` | Add reconciliation on startup + interval |
| `worker/src/executor/runner.ts` | Handle `{ flowId }` payload (load from DB) |
| `scheduler/` (entire directory) | Delete |
| `docker-compose.yml` | Remove scheduler service |
| `helm/core-agents/templates/scheduler.yaml` | Delete |
| `helm/core-agents/values.yaml` | Remove scheduler config |
| `package.json` (root workspaces) | Remove `scheduler` workspace |
| `.github/workflows/*.yml` | Remove scheduler build/deploy steps |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Duplicate triggers on deploy** | `jobId: \`schedule:${flow.id}\`` ensures idempotency |
| **Cron expression invalid** | Validate in the backend before `queue.add()`; reject with 400 |
| **Redis down on flow save** | Catch error and defer to reconciliation (it will auto-fix within 1h) |
| **Migration — existing schedules orphaned** | Run reconciliation once as part of the deploy |
| **Backend needs worker queue import** | Extract queue creation to `core-agents-shared` or inject via config |

---

## BullMQ Repeatable API (v5)

```
queue.add(name, data, { repeat: { pattern: cron }, jobId: stableId })
queue.removeRepeatable(name, { pattern: cron })
queue.getRepeatableJobs()  // returns [{ id, name, pattern, every, ... }]
```

- `pattern`: standard 5-field cron (`* * * * *`)
- `jobId`: optional stable identifier for idempotency
- Repeatable jobs are evaluated by BullMQ's internal scheduler (built into the Queue/Worker, no separate service needed)

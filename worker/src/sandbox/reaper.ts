import { sql, eq, and, lt } from 'drizzle-orm';
import type { SidecarClient } from './sidecar-client.js';

const DEFAULT_TTL_HOURS = 168;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function createReaper(
  sidecarClient: SidecarClient,
  db: any,
  executionsTable: any,
): { start: () => void; stop: () => void } {
  const ttlHours = parseInt(process.env.SIDECAR_TTL_HOURS ?? String(DEFAULT_TTL_HOURS), 10);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function reap(): Promise<void> {
    try {
      const expired = await db
        .select()
        .from(executionsTable)
        .where(
          and(
            eq(executionsTable.status, 'awaiting_approval'),
            lt(executionsTable.updated_at, sql`now() - interval '1 hour' * ${ttlHours}`),
          ),
        );

      for (const exec of expired) {
        try {
          await db
            .update(executionsTable)
            .set({ status: 'cancelled', error: 'HITL TTL expired' })
            .where(eq(executionsTable.id, exec.id));
          await sidecarClient.teardown(exec.id);
          console.log(`reaper: cancelled expired execution ${exec.id} (HITL TTL=${ttlHours}h)`);
        } catch (err) {
          console.error(`reaper: failed to clean up execution ${exec.id}:`, err);
        }
      }
    } catch (err) {
      console.error('reaper: query failed:', err);
    }
  }

  return {
    start(): void {
      if (timer) return;
      timer = setInterval(reap, CHECK_INTERVAL_MS);
      reap();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

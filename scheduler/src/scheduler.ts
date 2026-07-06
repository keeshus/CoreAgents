import type { FlowDefinition } from 'core-agents-shared';

interface ScheduledFlow {
  flowId: string;
  flowName: string;
  cronExpression: string;
  inputMessage?: string;
  nodes: any[];
  edges: any[];
  flowContext?: string;
  groupId?: string;
}

interface ScheduleEntry {
  flow: ScheduledFlow;
  lastRun: number;
}

function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, month, dow] = parts;
  const values: Record<string, number> = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dom: date.getDate(),
    month: date.getMonth() + 1,
    dow: date.getDay(),
  };

  const fields: Array<{ field: string; value: number }> = [
    { field: min, value: values.minute },
    { field: hour, value: values.hour },
    { field: dom, value: values.dom },
    { field: month, value: values.month },
    { field: dow, value: values.dow },
  ];

  for (const { field, value } of fields) {
    if (!fieldMatches(field, value)) return false;
  }
  return true;
}

function fieldMatches(pattern: string, value: number): boolean {
  if (pattern === '*') return true;

  const stepMatch = pattern.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
  if (stepMatch) {
    const range = stepMatch[1];
    const step = parseInt(stepMatch[2]);
    if (step === 0) return false;
    if (range === '*') return value % step === 0;
    const [lo, hi] = range.split('-').map(Number);
    return value >= (lo || 0) && value <= (hi || 59) && (value - (lo || 0)) % step === 0;
  }

  if (pattern.includes(',')) {
    return pattern.split(',').some(p => fieldMatches(p.trim(), value));
  }

  if (pattern.includes('-')) {
    const [lo, hi] = pattern.split('-').map(Number);
    return value >= lo && value <= hi;
  }

  return parseInt(pattern) === value;
}

export class Scheduler {
  private schedules = new Map<string, ScheduleEntry>();
  private interval: NodeJS.Timeout | null = null;
  private loadFn: () => Promise<ScheduledFlow[]>;
  private enqueueFn: (flowDef: FlowDefinition, input: Record<string, unknown>) => Promise<void>;

  constructor(
    loadFn: () => Promise<ScheduledFlow[]>,
    enqueueFn: (flowDef: FlowDefinition, input: Record<string, unknown>) => Promise<void>,
  ) {
    this.loadFn = loadFn;
    this.enqueueFn = enqueueFn;
  }

  async start(): Promise<void> {
    console.log('Scheduler: starting...');
    await this.reload();

    this.interval = setInterval(() => this.tick(), 30_000);
    console.log('Scheduler: running (checking every 30s)');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Scheduler: stopped');
  }

  async reload(): Promise<void> {
    try {
      const flows = await this.loadFn();
      const newIds = new Set(flows.map(f => f.flowId));

      for (const [id] of this.schedules) {
        if (!newIds.has(id)) this.schedules.delete(id);
      }

      for (const flow of flows) {
        const existing = this.schedules.get(flow.flowId);
        if (existing) {
          existing.flow = flow;
        } else {
          this.schedules.set(flow.flowId, { flow, lastRun: 0 });
        }
      }

      console.log(`Scheduler: reloaded — ${this.schedules.size} scheduled flow(s)`);
    } catch (err) {
      console.error('Scheduler: failed to reload flows:', err);
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const nowDate = new Date();

    for (const [, entry] of this.schedules) {
      const { flow, lastRun } = entry;

      if (!cronMatches(flow.cronExpression, nowDate)) continue;

      if (now - lastRun < 60_000) continue;

      entry.lastRun = now;

      console.log(`Scheduler: triggering flow "${flow.flowName}" (${flow.flowId})`);

      const flowDef = {
        id: flow.flowId,
        name: flow.flowName,
        description: '',
        nodes: flow.nodes,
        edges: flow.edges,
        version: 1,
        createdAt: '',
        updatedAt: '',
        flowContext: flow.flowContext || '',
        groupId: flow.groupId || undefined,
      };

      const input: Record<string, unknown> = (() => {
        const raw = flow.inputMessage?.trim();
        if (!raw) return { triggerType: 'schedule', timestamp: new Date().toISOString() };
        try {
          const parsed = JSON.parse(raw);
          return { triggerType: 'schedule', timestamp: new Date().toISOString(), ...parsed };
        } catch {
          return { triggerType: 'schedule', timestamp: new Date().toISOString(), message: raw };
        }
      })();

      this.enqueueFn(flowDef, input).catch(err => {
        console.error(`Scheduler: failed to enqueue flow "${flow.flowName}":`, (err as Error).message);
      });
    }
  }
}

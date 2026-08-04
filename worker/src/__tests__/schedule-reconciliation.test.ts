import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ queue (BullMQ 6 Job Scheduler API)
const mockUpsertJobScheduler = vi.fn();
const mockRemoveJobScheduler = vi.fn();
const mockGetJobSchedulers = vi.fn();

vi.mock('../queue.js', () => ({
  executionQueue: {
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    getJobSchedulers: mockGetJobSchedulers,
  },
}));

const { reconcileSchedules } = await import('../schedule-reconciliation.js');

function mockDb(flows: Array<{ id: string; nodes: any }>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn().mockResolvedValue(flows),
    })),
  };
}

const mockEq = vi.fn((a: any, b: any) => ({ op: 'eq', a, b }));
const mockFlowsTable = { id: 'id', nodes: 'nodes' };

describe('reconcileSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a job scheduler for a new schedule flow', async () => {
    mockGetJobSchedulers.mockResolvedValue([]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *', inputMessage: '{"task":"check"}' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'schedule:flow-1',
      { pattern: '*/5 * * * *' },
      { name: 'schedule:flow-1', data: { flowId: 'flow-1', inputMessage: { task: 'check' } } },
    );
  });

  it('updates the scheduler when cron changes', async () => {
    mockGetJobSchedulers.mockResolvedValue([
      { name: 'schedule:flow-1', pattern: '0 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      'schedule:flow-1',
      { pattern: '*/5 * * * *' },
      expect.objectContaining({ data: expect.objectContaining({ flowId: 'flow-1' }) }),
    );
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
  });

  it('removes the scheduler when the schedule trigger is removed', async () => {
    mockGetJobSchedulers.mockResolvedValue([
      { name: 'schedule:flow-1', pattern: '0 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'manual' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith('schedule:flow-1');
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it('does nothing when schedule flow already has correct cron', async () => {
    mockGetJobSchedulers.mockResolvedValue([
      { name: 'schedule:flow-1', pattern: '*/5 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
  });

  it('handles flows without schedule trigger gracefully', async () => {
    mockGetJobSchedulers.mockResolvedValue([]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'manual' } } }] },
      { id: 'flow-2', nodes: [] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
  });
});

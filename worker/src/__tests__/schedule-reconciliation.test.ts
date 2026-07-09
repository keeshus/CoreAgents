import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ queue
const mockAdd = vi.fn();
const mockRemoveRepeatable = vi.fn();
const mockGetRepeatableJobs = vi.fn();

vi.mock('../queue.js', () => ({
  executionQueue: {
    add: mockAdd,
    removeRepeatable: mockRemoveRepeatable,
    getRepeatableJobs: mockGetRepeatableJobs,
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

  it('adds a repeatable job for a new schedule flow', async () => {
    mockGetRepeatableJobs.mockResolvedValue([]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockAdd).toHaveBeenCalledWith(
      'schedule:flow-1',
      { flowId: 'flow-1' },
      { repeat: { pattern: '*/5 * * * *' }, jobId: 'schedule:flow-1' },
    );
  });

  it('updates a repeatable job when cron changes', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { id: 'schedule:flow-1', pattern: '0 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockRemoveRepeatable).toHaveBeenCalledWith('schedule:flow-1', { pattern: '0 * * * *' });
    expect(mockAdd).toHaveBeenCalledWith(
      'schedule:flow-1',
      { flowId: 'flow-1' },
      { repeat: { pattern: '*/5 * * * *' }, jobId: 'schedule:flow-1' },
    );
  });

  it('removes a repeatable job when schedule trigger is removed', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { id: 'schedule:flow-1', pattern: '0 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'manual' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockRemoveRepeatable).toHaveBeenCalledWith('schedule:flow-1', { pattern: '0 * * * *' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('does nothing when schedule flow already has correct cron', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { id: 'schedule:flow-1', pattern: '*/5 * * * *' },
    ]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/5 * * * *' } } }] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemoveRepeatable).not.toHaveBeenCalled();
  });

  it('handles flows without schedule trigger gracefully', async () => {
    mockGetRepeatableJobs.mockResolvedValue([]);
    const db = mockDb([
      { id: 'flow-1', nodes: [{ data: { type: 'trigger', config: { triggerType: 'manual' } } }] },
      { id: 'flow-2', nodes: [] },
    ]);

    await reconcileSchedules(db, mockFlowsTable, mockEq);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemoveRepeatable).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createReaper } from '../sandbox/reaper.js';
import type { SidecarClient } from '../sandbox/sidecar-client.js';

describe('createReaper', () => {
  const mockSidecarClient: SidecarClient = {
    setup: vi.fn(),
    exec: vi.fn(),
    teardown: vi.fn(),
  };

  const mockDb = { select: vi.fn(), update: vi.fn() };
  const mockExecutionsTable = { id: 'id', status: 'status', updated_at: 'updated_at' };

  it('returns an object with start and stop methods', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(reaper).toHaveProperty('start');
    expect(reaper).toHaveProperty('stop');
  });

  it('start is a function', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(typeof reaper.start).toBe('function');
  });

  it('stop is a function', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(typeof reaper.stop).toBe('function');
  });

  it('start and stop are distinct functions', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(reaper.start).not.toBe(reaper.stop);
  });

  it('start can be called without throwing', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(() => reaper.start()).not.toThrow();
    // stop to clean up interval
    reaper.stop();
  });

  it('stop can be called without throwing (even before start)', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    expect(() => reaper.stop()).not.toThrow();
  });

  it('start and stop can be called multiple times', () => {
    const reaper = createReaper(mockSidecarClient, mockDb, mockExecutionsTable);
    reaper.start();
    reaper.start(); // second start should be a no-op
    reaper.stop();
    reaper.stop(); // second stop should be a no-op
    expect(true).toBe(true);
  });
});

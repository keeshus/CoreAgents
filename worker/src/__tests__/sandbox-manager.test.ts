import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSandboxManager } from '../sandbox/manager.js';
import type { SidecarClient } from '../sandbox/sidecar-client.js';

describe('createSandboxManager', () => {
  let mockSidecarClient: SidecarClient;

  beforeEach(() => {
    mockSidecarClient = {
      setup: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn(),
      teardown: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('returns an object with setup and teardown methods', () => {
    const manager = createSandboxManager(mockSidecarClient);
    expect(manager).toHaveProperty('setup');
    expect(manager).toHaveProperty('teardown');
    expect(typeof manager.setup).toBe('function');
    expect(typeof manager.teardown).toBe('function');
  });

  describe('setup', () => {
    it('calls sidecarClient.setup with the executionId', async () => {
      const manager = createSandboxManager(mockSidecarClient);
      await manager.setup('exec-456');

      expect(mockSidecarClient.setup).toHaveBeenCalledTimes(1);
      expect(mockSidecarClient.setup).toHaveBeenCalledWith('exec-456');
    });

    it('forwards the promise (resolves when sidecar resolves)', async () => {
      mockSidecarClient.setup = vi.fn().mockResolvedValue('anything');
      const manager = createSandboxManager(mockSidecarClient);
      await expect(manager.setup('exec-456')).resolves.toBeUndefined();
    });

    it('forwards rejection from sidecar', async () => {
      mockSidecarClient.setup = vi.fn().mockRejectedValue(new Error('sidecar unavailable'));
      const manager = createSandboxManager(mockSidecarClient);
      await expect(manager.setup('exec-456')).rejects.toThrow('sidecar unavailable');
    });
  });

  describe('teardown', () => {
    it('calls sidecarClient.teardown with the executionId', async () => {
      const manager = createSandboxManager(mockSidecarClient);
      await manager.teardown('exec-456');

      expect(mockSidecarClient.teardown).toHaveBeenCalledTimes(1);
      expect(mockSidecarClient.teardown).toHaveBeenCalledWith('exec-456');
    });

    it('forwards rejection from sidecar', async () => {
      mockSidecarClient.teardown = vi.fn().mockRejectedValue(new Error('teardown failed'));
      const manager = createSandboxManager(mockSidecarClient);
      await expect(manager.teardown('exec-456')).rejects.toThrow('teardown failed');
    });
  });
});

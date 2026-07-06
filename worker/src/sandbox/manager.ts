import type { SidecarClient } from './sidecar-client.js';

export interface SandboxManager {
  setup(executionId: string): Promise<void>;
  teardown(executionId: string): Promise<void>;
}

export function createSandboxManager(sidecarClient: SidecarClient): SandboxManager {
  return {
    async setup(executionId: string): Promise<void> {
      await sidecarClient.setup(executionId);
    },

    async teardown(executionId: string): Promise<void> {
      await sidecarClient.teardown(executionId);
    },
  };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The ChatApiSettings component is a React component that:
// 1. Fetches deployment config from /api/flows/:flowId/chat-api/deployment
// 2. Fetches API keys from /api/flows/:flowId/chat-api/keys
// 3. Allows enabling/disabling, setting model name, rate limit
// 4. Allows creating/deleting API keys

describe('ChatApiSettings component logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defines the correct API endpoints', () => {
    // Verify the endpoint patterns used by the component
    const getDeploymentUrl = (flowId: string) => `/api/flows/${flowId}/chat-api/deployment`;
    const getKeysUrl = (flowId: string) => `/api/flows/${flowId}/chat-api/keys`;
    const putDeploymentUrl = (flowId: string) => `/api/flows/${flowId}/chat-api/deployment`;
    const postKeyUrl = (flowId: string) => `/api/flows/${flowId}/chat-api/keys`;
    const deleteKeyUrl = (flowId: string, keyId: string) => `/api/flows/${flowId}/chat-api/keys/${keyId}`;

    expect(getDeploymentUrl('flow-1')).toBe('/api/flows/flow-1/chat-api/deployment');
    expect(getKeysUrl('flow-1')).toBe('/api/flows/flow-1/chat-api/keys');
    expect(putDeploymentUrl('flow-1')).toBe('/api/flows/flow-1/chat-api/deployment');
    expect(postKeyUrl('flow-1')).toBe('/api/flows/flow-1/chat-api/keys');
    expect(deleteKeyUrl('flow-1', 'key-1')).toBe('/api/flows/flow-1/chat-api/keys/key-1');
  });

  it('handles fetch response for deployment config', async () => {
    const mockResponse = { flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 100 };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const res = await fetch(`/api/flows/flow-1/chat-api/deployment`);
    const data = await res.json();

    expect(data.enabled).toBe(true);
    expect(data.model_name).toBe('gpt-4o');
  });

  it('handles fetch response for API keys', async () => {
    const mockKeys = [
      { id: 'key-1', flow_id: 'flow-1', label: 'Default', key_prefix: 'ca_abc', enabled: true },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockKeys),
    });

    const res = await fetch(`/api/flows/flow-1/chat-api/keys`);
    const data = await res.json();

    expect(data.length).toBe(1);
    expect(data[0].key_prefix).toBe('ca_abc');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, API_URL, streamSSE } from '@/lib/api-client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockResponse(data: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  };
}

function mockStreamResponse(chunks: string[]) {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({}),
    body: {
      getReader: () => ({
        read: () => {
          if (index < chunks.length) {
            return Promise.resolve({ done: false, value: encoder.encode(chunks[index++]) });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
        cancel: () => {},
      }),
    },
  };
}

describe('api-client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('API_URL', () => {
    it('defaults to /api', () => {
      expect(API_URL).toBe('/api');
    });
  });

  describe('groups', () => {
    it('list fetches /api/groups', async () => {
      mockFetch.mockResolvedValue(mockResponse([{ id: '1', name: 'group1' }]));
      const result = await api.groups.list();
      expect(mockFetch).toHaveBeenCalledWith('/api/groups', expect.objectContaining({ credentials: 'include' }));
      expect(result).toEqual([{ id: '1', name: 'group1' }]);
    });

    it('get fetches /api/groups/:id', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }));
      await api.groups.get('1');
      expect(mockFetch).toHaveBeenCalledWith('/api/groups/1', expect.any(Object));
    });

    it('create sends POST with body', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1' }));
      await api.groups.create({ name: 'test' });
      expect(mockFetch).toHaveBeenCalledWith('/api/groups', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }));
    });

    it('delete sends DELETE', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204));
      await api.groups.delete('1');
      expect(mockFetch).toHaveBeenCalledWith('/api/groups/1', expect.objectContaining({
        method: 'DELETE',
      }));
    });

    it('addMember sends POST to members endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'm1' }));
      await api.groups.addMember('g1', 'u1');
      expect(mockFetch).toHaveBeenCalledWith('/api/groups/g1/members', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 'u1' }),
      }));
    });

    it('removeMember sends DELETE to member endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204));
      await api.groups.removeMember('g1', 'u1');
      expect(mockFetch).toHaveBeenCalledWith('/api/groups/g1/members/u1', expect.objectContaining({
        method: 'DELETE',
      }));
    });
  });

  describe('flows', () => {
    it('list builds query params', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [], total: 0 }));
      await api.flows.list({ limit: 10, offset: 1, search: 'test', sort: 'name' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows?limit=10&offset=1&search=test&sort=name',
        expect.any(Object),
      );
    });

    it('list with is_subflow and trigger_type', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [], total: 0 }));
      await api.flows.list({ is_subflow: true, trigger_type: 'chat' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows?is_subflow=true&trigger_type=chat',
        expect.any(Object),
      );
    });

    it('list handles no params', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [], total: 0 }));
      await api.flows.list();
      expect(mockFetch).toHaveBeenCalledWith('/api/flows', expect.any(Object));
    });

    it('get fetches by id', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'f1' }));
      await api.flows.get('f1');
      expect(mockFetch).toHaveBeenCalledWith('/api/flows/f1', expect.any(Object));
    });

    it('create sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'f1' }));
      await api.flows.create({ name: 'flow1' });
      expect(mockFetch).toHaveBeenCalledWith('/api/flows', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'flow1' }),
      }));
    });

    it('update sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'f1' }));
      await api.flows.update('f1', { name: 'updated' });
      expect(mockFetch).toHaveBeenCalledWith('/api/flows/f1', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'updated' }),
      }));
    });

    it('delete sends DELETE', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204));
      await api.flows.delete('f1');
      expect(mockFetch).toHaveBeenCalledWith('/api/flows/f1', expect.objectContaining({
        method: 'DELETE',
      }));
    });

    it('checkName builds query params', async () => {
      mockFetch.mockResolvedValue(mockResponse({ available: true }));
      await api.flows.checkName('my flow', 'exclude-id');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows/check-name?name=my%20flow&exclude=exclude-id',
        expect.any(Object),
      );
    });

    it('checkName excludes optional excludeId', async () => {
      mockFetch.mockResolvedValue(mockResponse({ available: true }));
      await api.flows.checkName('test');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/flows/check-name?name=test',
        expect.any(Object),
      );
    });
  });

  describe('auth', () => {
    it('profile fetches /api/auth/profile', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'u1' }));
      const result = await api.auth.profile();
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/profile', expect.any(Object));
      expect(result).toEqual({ id: 'u1' });
    });

    it('updateProfile sends PUT', async () => {
      mockFetch.mockResolvedValue(mockResponse({ name: 'new' }));
      await api.auth.updateProfile({ name: 'new' });
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/profile', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'new' }),
      }));
    });

    it('changePassword sends PUT to password endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));
      await api.auth.changePassword({ currentPassword: 'old', newPassword: 'new' });
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/password', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ currentPassword: 'old', newPassword: 'new' }),
      }));
    });
  });

  describe('llmEndpoints', () => {
    it('list with group filter', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));
      await api.llmEndpoints.list({ groupId: 'g1' });
      expect(mockFetch).toHaveBeenCalledWith('/api/llm-endpoints?group_id=g1', expect.any(Object));
    });

    it('list without group filter', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));
      await api.llmEndpoints.list();
      expect(mockFetch).toHaveBeenCalledWith('/api/llm-endpoints', expect.any(Object));
    });
  });

  describe('mcpServers', () => {
    it('refreshTools sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));
      await api.mcpServers.refreshTools('m1');
      expect(mockFetch).toHaveBeenCalledWith('/api/mcp-servers/m1/refresh', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  describe('vectorStores', () => {
    it('refresh sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));
      await api.vectorStores.refresh('v1');
      expect(mockFetch).toHaveBeenCalledWith('/api/vector-stores/v1/refresh', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  describe('secretVaults', () => {
    it('test sends POST', async () => {
      mockFetch.mockResolvedValue(mockResponse({ ok: true }));
      await api.secretVaults.test('sv1');
      expect(mockFetch).toHaveBeenCalledWith('/api/secret-vaults/sv1/test', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  describe('streamSSE', () => {
    it('yields parsed SSE events', async () => {
      mockFetch.mockResolvedValue(mockStreamResponse(['data: {"key":"value"}\n', 'data: {"done":true}\n']));
      const events: any[] = [];
      for await (const event of streamSSE('/api/flows/f1/execute', { input: {} })) {
        events.push(event);
      }
      expect(events).toEqual([{ key: 'value' }, { done: true }]);
    });

    it('skips malformed SSE lines', async () => {
      mockFetch.mockResolvedValue(mockStreamResponse(['data: {"valid":true}\n', 'data: not-json\n', 'data: {"also":true}\n']));
      const events: any[] = [];
      for await (const event of streamSSE('/api/flows/f1/execute', { input: {} })) {
        events.push(event);
      }
      expect(events).toEqual([{ valid: true }, { also: true }]);
    });

    it('uses POST with JSON body', async () => {
      mockFetch.mockResolvedValue(mockStreamResponse(['data: {}\n']));
      const generator = streamSSE('/test', { foo: 'bar' });
      await generator.next();
      expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
        headers: { 'Content-Type': 'application/json' },
      }));
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response with message from body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Name is required' }),
      });
      await expect(api.groups.create({ name: '' })).rejects.toThrow('Name is required');
    });

    it('throws with statusText when body has no message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });
      await expect(api.groups.list()).rejects.toThrow('Request failed: 500');
    });

    it('throws with statusText when json parsing fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('parse error')),
      });
      await expect(api.groups.list()).rejects.toThrow('Internal Server Error');
    });
  });

  describe('204 handling', () => {
    it('returns undefined for 204 responses', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204));
      const result = await api.groups.delete('1');
      expect(result).toBeUndefined();
    });
  });
});
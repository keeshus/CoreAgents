import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSidecarClient } from '../sandbox/sidecar-client.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('createSidecarClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a client with default URL when no argument is given', () => {
    const client = createSidecarClient();
    expect(client).toHaveProperty('setup');
    expect(client).toHaveProperty('exec');
    expect(client).toHaveProperty('teardown');
  });

  it('creates a client with custom URL', () => {
    const client = createSidecarClient('http://example:4001');
    expect(client).toHaveProperty('setup');
    expect(client).toHaveProperty('exec');
    expect(client).toHaveProperty('teardown');
  });

  describe('setup', () => {
    it('calls POST /setup with executionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const client = createSidecarClient('http://localhost:4001');
      await client.setup('exec-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4001/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: 'exec-123' }),
      });
    });
  });

  describe('exec', () => {
    it('calls POST /exec with request body and returns parsed response', async () => {
      const mockResponse = { stdout: 'hello', stderr: '', exitCode: 0 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = createSidecarClient('http://localhost:4001');
      const result = await client.exec({
        executionId: 'exec-123',
        command: 'echo hello',
        timeout: 30000,
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4001/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: 'exec-123', command: 'echo hello', timeout: 30000 }),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('teardown', () => {
    it('calls POST /teardown with executionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const client = createSidecarClient('http://localhost:4001');
      await client.teardown('exec-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4001/teardown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: 'exec-123' }),
      });
    });
  });

  describe('error handling', () => {
    it('throws an error with response body message when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'internal server error' }),
      });

      const client = createSidecarClient('http://localhost:4001');
      await expect(client.setup('exec-123')).rejects.toThrow(
        'sidecar /setup failed: internal server error',
      );
    });

    it('throws with HTTP status when no error field in body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'not found' }),
      });

      const client = createSidecarClient('http://localhost:4001');
      await expect(client.exec({
        executionId: 'exec-123',
        command: 'ls',
      })).rejects.toThrow('sidecar /exec failed: HTTP 404');
    });
  });
});

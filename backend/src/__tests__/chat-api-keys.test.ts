import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../utils/async-handler.js', () => ({
  asyncHandler: vi.fn((fn: any) => fn),
}));

vi.mock('../middleware/auth.js', () => ({
  requirePermission: vi.fn((...actions: string[]) =>
    (req: any, res: any, next: any) => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const perms = req.user.permissions || [];
      const hasPermission = perms.includes('admin') || actions.some((a: string) => perms.includes(a));
      if (!hasPermission) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    },
  ),
}));

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
}));

// ── Helpers ───────────────────────────────────────────────────

function getHandler(router: any, method: string, path: string) {
  for (const layer of router.stack) {
    const r = layer.route;
    if (r?.path === path && r.methods?.[method]) {
      return r.stack.at(-1).handle;
    }
  }
  throw new Error(`Handler not found: ${method.toUpperCase()} ${path}`);
}

function getMiddleware(router: any, method: string, path: string, index = 0) {
  for (const layer of router.stack) {
    const r = layer.route;
    if (r?.path === path && r.methods?.[method]) {
      return r.stack[index].handle;
    }
  }
  throw new Error(`Middleware not found: ${method.toUpperCase()} ${path}`);
}

function mockChain(resolvedValue: any) {
  return { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(resolvedValue), limit: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), returning: vi.fn().mockReturnThis() };
}

function insertChain(resolvedValue: any) {
  return { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(resolvedValue) };
}

function updateChain(resolvedValue: any) {
  return { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(resolvedValue) };
}

function makeReq(overrides?: any) {
  return { params: {}, query: {}, body: {}, user: { userId: 'admin', permissions: ['admin'] }, ...overrides };
}

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
}

// ── Tests ─────────────────────────────────────────────────────

describe('chat-api-keys routes', () => {
  let router: any;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    const mod = await import('../routes/chat-api-keys.js');
    router = mod.default;
  });

  describe('GET /flows/:flowId/chat-api/deployment', () => {
    it('returns deployment when one exists', async () => {
      const deployment = { flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 100 };
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Test', nodes: [], edges: [] }]))
        .mockReturnValueOnce(mockChain([deployment]));
      const req = makeReq({ params: { flowId: 'flow-1' } });
      const res = makeRes();
      const next = vi.fn();

      await getHandler(router, 'get', '/flows/:flowId/chat-api/deployment')(req, res, next);

      if (next.mock.calls.length > 0) {
        console.log('next was called with error:', next.mock.calls[0][0]?.message || next.mock.calls[0][0]);
      }
      expect(res.json).toHaveBeenCalledWith(deployment);
    });

    it('returns fallback object when no deployment exists', async () => {
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Test', nodes: [], edges: [] }]))
        .mockReturnValueOnce(mockChain([]));
      const req = makeReq({ params: { flowId: 'flow-1' } });
      const res = makeRes();

      await getHandler(router, 'get', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({ flow_id: 'flow-1', enabled: false, model_name: '', rate_limit: 0 });
    });

    it('returns 404 when flow not found', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ params: { flowId: 'nonexistent' } });
      const res = makeRes();

      await getHandler(router, 'get', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('enforces flow:edit permission', async () => {
      const req = makeReq({ user: { userId: 'u1', permissions: ['flow:read'] } });
      const res = makeRes();
      const next = vi.fn();

      getMiddleware(router, 'get', '/flows/:flowId/chat-api/deployment')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('PUT /flows/:flowId/chat-api/deployment', () => {
    it('creates deployment for a chat flow', async () => {
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Chat Flow', nodes: [{ data: { type: 'trigger', config: { triggerType: 'chat' } } }], edges: [] }]))
        .mockReturnValueOnce(mockChain([]));
      db.insert.mockReturnValue(insertChain([{ flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 10 }]));
      const req = makeReq({ params: { flowId: 'flow-1' }, body: { enabled: true, model_name: 'gpt-4o', rate_limit: 10 } });
      const res = makeRes();

      await getHandler(router, 'put', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 10 });
    });

    it('updates existing deployment', async () => {
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Chat Flow', nodes: [{ data: { type: 'trigger', config: { triggerType: 'chat' } } }], edges: [] }]))
        .mockReturnValueOnce(mockChain([{ id: 'dep-1', flow_id: 'flow-1', enabled: false, model_name: 'old', rate_limit: 0 }]));
      db.update.mockReturnValue(updateChain([{ id: 'dep-1', flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 50 }]));
      const req = makeReq({ params: { flowId: 'flow-1' }, body: { enabled: true, model_name: 'gpt-4o', rate_limit: 50 } });
      const res = makeRes();

      await getHandler(router, 'put', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(db.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ id: 'dep-1', flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 50 });
    });

    it('rejects non-chat flows', async () => {
      db.select.mockReturnValue(mockChain([{ id: 'flow-1', name: 'Webhook Flow', nodes: [{ data: { type: 'trigger', config: { triggerType: 'webhook' } } }], edges: [] }]));
      const req = makeReq({ params: { flowId: 'flow-1' }, body: { enabled: true } });
      const res = makeRes();

      await getHandler(router, 'put', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when flow not found', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ params: { flowId: 'nonexistent' } });
      const res = makeRes();

      await getHandler(router, 'put', '/flows/:flowId/chat-api/deployment')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /flows/:flowId/chat-api/keys', () => {
    it('returns list of API keys', async () => {
      const keys = [{ id: 'key-1', flow_id: 'flow-1', label: 'Default', key_prefix: 'ca_abc', enabled: true, last_used_at: null, created_by: null, created_at: new Date().toISOString(), expires_at: null }];
      db.select.mockReturnValue(mockChain(keys));
      const req = makeReq({ params: { flowId: 'flow-1' } });
      const res = makeRes();

      await getHandler(router, 'get', '/flows/:flowId/chat-api/keys')(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith(keys);
    });

    it('returns empty array when no keys exist', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ params: { flowId: 'flow-1' } });
      const res = makeRes();

      await getHandler(router, 'get', '/flows/:flowId/chat-api/keys')(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('POST /flows/:flowId/chat-api/keys', () => {
    it('creates a key and returns raw_key once', async () => {
      db.select.mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Chat Flow' }]));
      db.insert.mockReturnValue(insertChain([{ id: 'key-new', flow_id: 'flow-1', label: 'My Key', key_prefix: '', enabled: true, created_at: new Date(), expires_at: null }]));
      const req = makeReq({ params: { flowId: 'flow-1' }, body: { label: 'My Key' } });
      const res = makeRes();

      await getHandler(router, 'post', '/flows/:flowId/chat-api/keys')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(201);
      const data = res.json.mock.calls[0][0];
      expect(data.raw_key).toBeDefined();
      expect(data.raw_key.startsWith('ca_')).toBe(true);
      expect(data.label).toBe('My Key');
    });

    it('defaults label when not provided', async () => {
      db.select.mockReturnValueOnce(mockChain([{ id: 'flow-1', name: 'Chat Flow' }]));
      db.insert.mockReturnValue(insertChain([{ id: 'key-new', flow_id: 'flow-1', label: 'Default', key_prefix: '', enabled: true, created_at: new Date(), expires_at: null }]));
      const req = makeReq({ params: { flowId: 'flow-1' } });
      const res = makeRes();

      await getHandler(router, 'post', '/flows/:flowId/chat-api/keys')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].label).toBe('Default');
    });

    it('returns 404 when flow not found', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ params: { flowId: 'nonexistent' } });
      const res = makeRes();

      await getHandler(router, 'post', '/flows/:flowId/chat-api/keys')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('DELETE /flows/:flowId/chat-api/keys/:keyId', () => {
    it('deletes an existing key and returns 204', async () => {
      db.select.mockReturnValueOnce(mockChain([{ id: 'key-1', flow_id: 'flow-1' }]));
      db.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      const req = makeReq({ params: { flowId: 'flow-1', keyId: 'key-1' } });
      const res = makeRes();

      await getHandler(router, 'delete', '/flows/:flowId/chat-api/keys/:keyId')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 404 when key not found', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ params: { flowId: 'flow-1', keyId: 'nonexistent' } });
      const res = makeRes();

      await getHandler(router, 'delete', '/flows/:flowId/chat-api/keys/:keyId')(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('permission enforcement', () => {
    it('blocks unauthenticated requests', async () => {
      const req = makeReq({ user: null });
      const res = makeRes();
      const next = vi.fn();
      getMiddleware(router, 'get', '/flows/:flowId/chat-api/deployment')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks unauthenticated POST', async () => {
      const req = makeReq({ user: null });
      const res = makeRes();
      const next = vi.fn();
      getMiddleware(router, 'post', '/flows/:flowId/chat-api/keys')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

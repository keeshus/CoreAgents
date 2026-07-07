import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));

vi.mock('core-agents-shared', () => ({
  apiDeployments: { _: { name: 'api_deployments' } },
  apiKeys: { _: { name: 'api_keys' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
}));

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

function mockChain(data?: any) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => data !== undefined ? data : chain),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(),
    onConflictDoUpdate: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
  };
  return chain;
}

describe('webhook-api-keys routes', () => {
  let router: any;
  let db: any;
  let req: any;
  let res: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    const mod = await import('../routes/webhook-api-keys.js');
    router = mod.default;
    req = { params: {}, query: {}, body: {}, user: { userId: 'user-1', permissions: ['flow:edit'] } };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
  });

  // Need to pass next + wait a tick because asyncHandler fires .catch(next) asynchronously
  async function callHandler(handler: any) {
    const next = vi.fn();
    handler(req, res, next);
    await new Promise(r => setTimeout(r, 0));
    if (next.mock.calls.length > 0) throw next.mock.calls[0][0];
  }

  describe('POST /flows/:flowId/keys/renew', () => {
    it('renews key when deployment exists', async () => {
      req.params = { flowId: 'flow-1' };
      const chain = mockChain([{ flow_id: 'flow-1' }]);
      db.select.mockReturnValue(chain);
      db.insert.mockReturnValue(mockChain());

      await callHandler(getHandler(router, 'post', '/flows/:flowId/keys/renew'));

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: expect.stringMatching(/^wh_/), rawKey: expect.stringMatching(/^wh_/) }),
      );
    });

    it('returns 404 when no deployment exists', async () => {
      req.params = { flowId: 'flow-1' };
      const chain = mockChain([]);
      db.select.mockReturnValue(chain);

      await callHandler(getHandler(router, 'post', '/flows/:flowId/keys/renew'));

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow not found or not deployed' });
    });

    it('returns 403 without flow:edit permission', async () => {
      req.user = { userId: 'u1', permissions: ['flow:read'] };
      const next = vi.fn();

      getMiddleware(router, 'post', '/flows/:flowId/keys/renew')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /flows/:flowId/keys/revoke', () => {
    it('revokes personal key', async () => {
      req.params = { flowId: 'flow-1' };
      const chain = mockChain();
      db.update.mockReturnValue(chain);

      await callHandler(getHandler(router, 'delete', '/flows/:flowId/keys/revoke'));

      expect(db.update).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('returns 403 without flow:edit permission', async () => {
      req.user = { userId: 'u1', permissions: ['flow:read'] };
      const next = vi.fn();

      getMiddleware(router, 'delete', '/flows/:flowId/keys/revoke')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /flows/:flowId/keys/:userId', () => {
    it('admin can revoke any user key', async () => {
      req.user = { userId: 'admin-1', permissions: ['admin'] };
      req.params = { flowId: 'flow-1', userId: 'target-user' };

      await callHandler(getHandler(router, 'delete', '/flows/:flowId/keys/:userId'));

      expect(db.update).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('returns 403 without admin permission', async () => {
      req.user = { userId: 'u1', permissions: ['flow:edit'] };
      req.params = { flowId: 'flow-1', userId: 'target-user' };
      const next = vi.fn();

      getMiddleware(router, 'delete', '/flows/:flowId/keys/:userId')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('GET /flows/:flowId/deployment', () => {
    it('returns deployment config', async () => {
      req.params = { flowId: 'flow-1' };
      const chain = mockChain([{ path_slug: 'my-flow', rate_limit: 10, summary: 'Test' }]);
      db.select.mockReturnValue(chain);

      await callHandler(getHandler(router, 'get', '/flows/:flowId/deployment'));

      expect(res.json).toHaveBeenCalledWith({ pathSlug: 'my-flow', rateLimit: 10, summary: 'Test' });
    });

    it('returns defaults when no deployment exists', async () => {
      req.params = { flowId: 'flow-1' };
      const chain = mockChain([]);
      db.select.mockReturnValue(chain);

      await callHandler(getHandler(router, 'get', '/flows/:flowId/deployment'));

      expect(res.json).toHaveBeenCalledWith({ pathSlug: '', rateLimit: 0, summary: '' });
    });
  });

  describe('PUT /flows/:flowId/deployment', () => {
    it('creates deployment when none exists', async () => {
      req.params = { flowId: 'flow-1' };
      req.body = { pathSlug: 'my-flow', rateLimit: 5, summary: 'Test flow' };
      const selectChain = mockChain([]);
      db.select.mockReturnValue(selectChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ path_slug: 'my-flow', rate_limit: 5, summary: 'Test flow' }]);
      db.insert.mockReturnValue(insertChain);

      await callHandler(getHandler(router, 'put', '/flows/:flowId/deployment'));

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ pathSlug: 'my-flow', rateLimit: 5, summary: 'Test flow' });
    });

    it('updates existing deployment', async () => {
      req.params = { flowId: 'flow-1' };
      req.body = { pathSlug: 'updated-slug', rateLimit: 20, summary: 'Updated' };
      const selectChain = mockChain([{ path_slug: 'old', rate_limit: 5, summary: 'Old' }]);
      db.select.mockReturnValue(selectChain);
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([{ path_slug: 'updated-slug', rate_limit: 20, summary: 'Updated' }]);
      db.update.mockReturnValue(updateChain);

      await callHandler(getHandler(router, 'put', '/flows/:flowId/deployment'));

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ pathSlug: 'updated-slug', rateLimit: 20, summary: 'Updated' });
    });

    it('auto-generates slug from request body name when none provided', async () => {
      req.params = { flowId: 'flow-1' };
      req.body = { name: 'My Cool Flow' };
      const selectChain = mockChain([]);
      db.select.mockReturnValue(selectChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ path_slug: 'my-cool-flow', rate_limit: 0, summary: '' }]);
      db.insert.mockReturnValue(insertChain);

      await callHandler(getHandler(router, 'put', '/flows/:flowId/deployment'));

      expect(db.insert).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ pathSlug: 'my-cool-flow', rateLimit: 0, summary: '' });
    });
  });

  describe('generateSlug helper', () => {
    it('generates URL-safe slug from name', async () => {
      const { generateSlug } = await import('../routes/webhook-api-keys.js');
      expect(generateSlug('My Payment Flow')).toBe('my-payment-flow');
      expect(generateSlug('  Hello   World  ')).toBe('hello-world');
      expect(generateSlug('a'.repeat(100))).toHaveLength(63);
    });
  });

  describe('generateApiKey helper', () => {
    it('generates wh_ prefixed key with hash and prefix', async () => {
      const { generateApiKey } = await import('../routes/webhook-api-keys.js');
      const result = generateApiKey();

      expect(result.raw).toMatch(/^wh_/);
      expect(result.raw.length).toBeGreaterThan(50);
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.prefix).toBe(result.raw.slice(0, 10));
    });

    it('generates unique keys on each call', async () => {
      const { generateApiKey } = await import('../routes/webhook-api-keys.js');
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });
  });
});

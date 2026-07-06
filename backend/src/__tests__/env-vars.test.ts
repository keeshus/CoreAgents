import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

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
  appEnvVars: { _: { name: 'app_env_vars' } },
  groupVaultConfig: { _: { name: 'group_vault_config' } },
  groupMembers: { _: { name: 'group_members' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
}));

// ── Router helpers ────────────────────────────────────────────

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

function mockChain() {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(),
  };
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────

describe('env-vars routes', () => {
  let router: any;
  let db: any;
  let req: any;
  let res: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    const mod = await import('../routes/env-vars.js');
    router = mod.default;
    req = { params: {}, query: {}, body: {}, user: { userId: 'admin-id', permissions: ['admin'] } };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  });

  // ─── App-level (admin-only) ─────────────────────────────────

  describe('GET /', () => {
    it('returns env vars from existing row', async () => {
      const envVars = [{ key: 'FOO', value: 'bar', type: 'static' }];
      const chain = mockChain();
      chain.limit.mockResolvedValue([{ env_vars: envVars }]);
      db.select.mockReturnValue(chain);

      await getHandler(router, 'get', '/')(req, res);

      expect(db.select).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(envVars);
    });

    it('auto-creates the singleton row if none exists', async () => {
      const selectChain = mockChain();
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ env_vars: [] }]);
      db.insert.mockReturnValue(insertChain);

      await getHandler(router, 'get', '/')(req, res);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 403 without admin permission', async () => {
      req.user = { userId: 'u1', permissions: ['flow:read'] };
      const next = vi.fn();

      getMiddleware(router, 'get', '/')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('PUT /', () => {
    it('updates existing row with valid envVars', async () => {
      const envVars = [{ key: 'BAR', value: 'baz', type: 'static' }];
      const selectChain = mockChain();
      selectChain.limit.mockResolvedValue([{ id: 'row-1' }]);
      db.select.mockReturnValue(selectChain);
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([{ env_vars: envVars }]);
      db.update.mockReturnValue(updateChain);
      req.body = { envVars };

      await getHandler(router, 'put', '/')(req, res);

      expect(db.update).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(envVars);
    });

    it('inserts row when none exists yet', async () => {
      const envVars = [{ key: 'NEW', value: 'val', type: 'static' }];
      const selectChain = mockChain();
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ env_vars: envVars }]);
      db.insert.mockReturnValue(insertChain);
      req.body = { envVars };

      await getHandler(router, 'put', '/')(req, res);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(envVars);
    });

    it('returns 400 when body is missing envVars', async () => {
      req.body = {};

      await getHandler(router, 'put', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'envVars must be an array' });
    });

    it('returns 403 without admin permission', async () => {
      req.user = { userId: 'u1', permissions: ['flow:read'] };
      const next = vi.fn();

      getMiddleware(router, 'put', '/')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── Group-level ────────────────────────────────────────────

  describe('GET /groups/:groupId', () => {
    it('returns empty array when no config exists', async () => {
      const chain = mockChain();
      chain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(chain);
      req.params = { groupId: 'group-1' };

      await getHandler(router, 'get', '/groups/:groupId')(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns env_vars from existing config', async () => {
      const envVars = [{ key: 'GROUP_VAR', value: 'val', type: 'static' }];
      const chain = mockChain();
      chain.limit.mockResolvedValue([{ env_vars: envVars }]);
      db.select.mockReturnValue(chain);
      req.params = { groupId: 'group-1' };

      await getHandler(router, 'get', '/groups/:groupId')(req, res);

      expect(res.json).toHaveBeenCalledWith(envVars);
    });
  });

  describe('PUT /groups/:groupId', () => {
    it('admin can update group env vars', async () => {
      const envVars = [{ key: 'G_VAR', value: 'v', type: 'static' }];
      req.params = { groupId: 'group-1' };
      req.body = { envVars };
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([{ env_vars: envVars }]);
      db.update.mockReturnValue(updateChain);

      await getHandler(router, 'put', '/groups/:groupId')(req, res);

      // Admin bypasses membership check, so db.select should NOT be called for members
      expect(db.select).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(envVars);
    });

    it('group admin can update group env vars', async () => {
      const envVars = [{ key: 'G_VAR', value: 'v', type: 'static' }];
      req.user = { userId: 'member-id', permissions: ['flow:read'] };
      req.params = { groupId: 'group-1' };
      req.body = { envVars };

      const memberChain = mockChain();
      memberChain.limit.mockResolvedValue([{ id: 'gm-1', role: 'admin', user_id: 'member-id', group_id: 'group-1' }]);
      db.select.mockReturnValue(memberChain);
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([{ env_vars: envVars }]);
      db.update.mockReturnValue(updateChain);

      await getHandler(router, 'put', '/groups/:groupId')(req, res);

      expect(res.json).toHaveBeenCalledWith(envVars);
    });

    it('non-group-member returns 403', async () => {
      req.user = { userId: 'outsider', permissions: ['flow:read'] };
      req.params = { groupId: 'group-1' };
      req.body = { envVars: [{ key: 'X', value: 'y', type: 'static' }] };

      const memberChain = mockChain();
      memberChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(memberChain);

      await getHandler(router, 'put', '/groups/:groupId')(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only group admins can update group env vars' });
    });

    it('group member with non-admin role returns 403', async () => {
      req.user = { userId: 'member', permissions: ['flow:read'] };
      req.params = { groupId: 'group-1' };
      req.body = { envVars: [{ key: 'X', value: 'y', type: 'static' }] };

      const memberChain = mockChain();
      memberChain.limit.mockResolvedValue([{ id: 'gm-1', role: 'member', user_id: 'member', group_id: 'group-1' }]);
      db.select.mockReturnValue(memberChain);

      await getHandler(router, 'put', '/groups/:groupId')(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only group admins can update group env vars' });
    });

    it('returns 400 when envVars is missing', async () => {
      req.params = { groupId: 'group-1' };
      req.body = {};

      await getHandler(router, 'put', '/groups/:groupId')(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'envVars must be an array' });
    });
  });
});

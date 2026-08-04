import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() } }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  asc: vi.fn((x: any) => ({ dir: 'asc', x })),
  desc: vi.fn((x: any) => ({ dir: 'desc', x })),
  sql: vi.fn((strings: any, ...values: any[]) => ({ op: 'sql', strings, values })),
  inArray: vi.fn((a: any, b: any[]) => ({ op: 'inArray', a, b })),
  isNull: vi.fn((a: any) => ({ op: 'isNull', a })),
  or: vi.fn((...args: any[]) => ({ op: 'or', args })),
}));

vi.mock('orchestream-ai-shared', () => ({
  flows: { _: { name: 'flows' } },
  flowVersions: { _: { name: 'flow_versions' } },
  users: { _: { name: 'users' } },
  executions: { _: { name: 'executions' } },
  executionSteps: { _: { name: 'execution_steps' } },
  chatSessions: { _: { name: 'chat_sessions' } },
  chatMessages: { _: { name: 'chat_messages' } },
  userAssignments: { _: { name: 'user_assignments' } },
  groupMembers: { _: { name: 'group_members' } },
  apiDeployments: { _: { name: 'api_deployments' } },
  apiKeys: { _: { name: 'api_keys' } },
}));

vi.mock('../routes/webhook-api-keys.js', () => ({
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-+/g, '-').slice(0, 63),
  ),
  generateApiKey: vi.fn(() => ({ raw: 'wh_test_raw_key_12345', hash: 'test-hash-value', prefix: 'wh_test_pr' })),
}));

vi.mock('../../../worker/src/executor/engine.js', () => ({
  FlowExecutor: vi.fn(),
}));

vi.mock('../../../worker/src/executor/dag.js', () => ({
  topologicalSort: vi.fn((nodes: any[], _edges: any[]) => ({
    sorted: nodes || [],
    cycles: [],
  })),
}));

vi.mock('../../../worker/src/queue.js', () => ({
  executionQueue: {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
  },
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

function mockChain(resolvedValue?: any) {
  const isData = arguments.length > 0;
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => (isData ? Promise.resolve(resolvedValue) : chain)),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
    delete: vi.fn(() => chain),
    catch: vi.fn(),
  };

  if (isData) {
    chain.then = (onfulfilled: any) => {
      const result = onfulfilled(resolvedValue);
      return result instanceof Promise ? result : Promise.resolve(result);
    };
  }

  return chain;
}

function makeFlow(overrides = {}) {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    description: 'A test flow',
    nodes: [],
    edges: [],
    version: 1,
    is_subflow: false,
    created_by: 'user-1',
    created_by_name: 'Test User',
    group_id: null,
    flow_context: '',
    env_vars: [],
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeReq(overrides?: any) {
  return { params: {}, query: {}, body: {}, headers: {}, user: { userId: 'admin', permissions: ['admin'] }, ...overrides };
}

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), send: vi.fn(), end: vi.fn() };
}

describe('flows routes', () => {
  let router: any;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    // Set up default FlowExecutor mock
    const engineMod = await import('../../../worker/src/executor/engine.js');
    vi.mocked(engineMod.FlowExecutor).mockImplementation(function() {
      return { compileFlow: vi.fn().mockReturnValue([]) };
    });
    const mod = await import('../routes/flows.js');
    router = mod.default;
  });

  // ─── GET / (list flows) ─────────────────────────────────────

  describe('GET /', () => {
    it('returns flows with pagination', async () => {
      const flowsData = [makeFlow({ id: 'flow-1' }), makeFlow({ id: 'flow-2' })];
      const dataChain = mockChain(flowsData);
      const countChain = mockChain([{ count: 2 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { limit: '10', offset: '0' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith({
        data: flowsData,
        total: 2,
        limit: 10,
        offset: 0,
        search: undefined,
        sort: 'updated_at',
      });
    });

    it('applies search filter', async () => {
      const dataChain = mockChain([makeFlow()]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { search: 'test', limit: '20', offset: '0' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: [makeFlow()], search: 'test' }),
      );
    });

    it('filters by is_subflow=true', async () => {
      const dataChain = mockChain([makeFlow({ is_subflow: true })]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { is_subflow: 'true' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it('filters by is_subflow=false', async () => {
      const dataChain = mockChain([makeFlow({ is_subflow: false })]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { is_subflow: 'false' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it('filters by trigger_type=webhook', async () => {
      const dataChain = mockChain([makeFlow()]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { trigger_type: 'webhook' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it('returns empty list when no flows exist', async () => {
      const dataChain = mockChain([]);
      const countChain = mockChain([{ count: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { limit: '20', offset: '0' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith({
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
        search: undefined,
        sort: 'updated_at',
      });
    });

    it('enforces max limit of 100', async () => {
      const dataChain = mockChain([]);
      const countChain = mockChain([{ count: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { limit: '500' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });

    it('sorts by created_at desc', async () => {
      const dataChain = mockChain([makeFlow()]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { sort: 'created_at', order: 'desc' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sort: 'created_at' }));
    });

    it('applies group-based filtering for non-admin users', async () => {
      const groupChain = mockChain([{ groupId: 'group-1' }]);
      const dataChain = mockChain([makeFlow({ group_id: 'group-1' })]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(groupChain).mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ user: { userId: 'user-1', permissions: ['flow:read'] } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      // Group membership query + data + count = 3 select calls
      expect(db.select).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it('filters by group_id for admin users', async () => {
      const dataChain = mockChain([makeFlow({ group_id: 'group-1' })]);
      const countChain = mockChain([{ count: 1 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { group_id: 'group-1' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it('returns empty results for search with no matches', async () => {
      const dataChain = mockChain([]);
      const countChain = mockChain([{ count: 0 }]);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const req = makeReq({ query: { search: 'nonexistent' } });
      const res = makeRes();

      await getHandler(router, 'get', '/')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: [], total: 0, search: 'nonexistent',
      }));
    });
  });

  // ─── GET /check-name ────────────────────────────────────────

  describe('GET /check-name', () => {
    it('returns available: true when name is not taken', async () => {
      const chain = mockChain([]);
      db.select.mockReturnValue(chain);

      const req = makeReq({ query: { name: 'New Flow' } });
      const res = makeRes();

      await getHandler(router, 'get', '/check-name')(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: true });
    });

    it('returns available: false when name is taken', async () => {
      const chain = mockChain([{ id: 'existing-flow' }]);
      db.select.mockReturnValue(chain);

      const req = makeReq({ query: { name: 'Existing Flow' } });
      const res = makeRes();

      await getHandler(router, 'get', '/check-name')(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: false });
    });

    it('returns available: false when name is empty', async () => {
      const req = makeReq({ query: { name: '' } });
      const res = makeRes();

      await getHandler(router, 'get', '/check-name')(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: false });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns available: false when name is whitespace', async () => {
      const req = makeReq({ query: { name: '   ' } });
      const res = makeRes();

      await getHandler(router, 'get', '/check-name')(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: false });
    });

    it('respects exclude parameter for editing flows', async () => {
      const chain = mockChain([]);
      db.select.mockReturnValue(chain);

      const req = makeReq({ query: { name: 'My Flow', exclude: 'flow-1' } });
      const res = makeRes();

      await getHandler(router, 'get', '/check-name')(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: true });
    });
  });

  // ─── GET /:id ───────────────────────────────────────────────

  describe('GET /:id', () => {
    it('returns flow by id', async () => {
      const chain = mockChain([makeFlow()]);
      db.select.mockReturnValue(chain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await getHandler(router, 'get', '/:id')(req, res);

      expect(res.json).toHaveBeenCalledWith(makeFlow());
    });

    it('returns 404 when id is not a valid UUID', async () => {
      const req = makeReq({ params: { id: 'not-a-uuid' } });
      const res = makeRes();

      await getHandler(router, 'get', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow not found' });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns 404 when flow not found', async () => {
      const chain = mockChain([]);
      db.select.mockReturnValue(chain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await getHandler(router, 'get', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow not found' });
    });

    it('attaches webhook API key and path slug for webhook flows', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'trigger-1', data: { type: 'trigger', config: { triggerType: 'webhook' } } },
        ],
      });
      const flowChain = mockChain([flow]);
      const apiKeyChain = mockChain([{ keyPrefix: 'wh_abc', createdAt: new Date('2026-01-01') }]);
      const deployChain = mockChain([{ pathSlug: 'test-flow' }]);
      db.select
        .mockReturnValueOnce(flowChain)
        .mockReturnValueOnce(apiKeyChain)
        .mockReturnValueOnce(deployChain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await getHandler(router, 'get', '/:id')(req, res);

      const result = res.json.mock.calls[0][0];
      const triggerNode = result.nodes[0];
      expect(triggerNode.data.config.personalApiKeyPrefix).toBe('wh_abc');
      expect(triggerNode.data.config.pathSlug).toBe('test-flow');
    });

    it('handles webhook flow without API key gracefully', async () => {
      const flow = makeFlow({
        nodes: [
          { id: 'trigger-1', data: { type: 'trigger', config: { triggerType: 'webhook' } } },
        ],
      });
      const flowChain = mockChain([flow]);
      const apiKeyChain = mockChain([]);
      const deployChain = mockChain([{ pathSlug: 'test-flow' }]);
      db.select
        .mockReturnValueOnce(flowChain)
        .mockReturnValueOnce(apiKeyChain)
        .mockReturnValueOnce(deployChain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await getHandler(router, 'get', '/:id')(req, res);

      const result = res.json.mock.calls[0][0];
      const triggerNode = result.nodes[0];
      expect(triggerNode.data.config.personalApiKeyPrefix).toBeUndefined();
      expect(triggerNode.data.config.pathSlug).toBe('test-flow');
    });
  });

  // ─── POST / (create flow) ───────────────────────────────────

  describe('POST /', () => {
    it('creates a new flow with valid data', async () => {
      const nameCheckChain = mockChain([]);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([makeFlow()]);
      db.select.mockReturnValue(nameCheckChain);
      db.insert.mockReturnValue(insertChain);

      const req = makeReq({ body: { name: 'New Flow', description: 'A new flow' } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Flow' }));
    });

    it('returns 400 when name is missing', async () => {
      const req = makeReq({ body: { description: 'No name' } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow name is required' });
    });

    it('returns 400 when name is empty string', async () => {
      const req = makeReq({ body: { name: '' } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow name is required' });
    });

    it('returns 409 when name is already taken', async () => {
      const nameCheckChain = mockChain([{ id: 'existing-flow' }]);
      db.select.mockReturnValue(nameCheckChain);

      const req = makeReq({ body: { name: 'Existing Flow' } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'A flow with this name already exists' });
    });

    it('sets is_subflow=true when nodes contain subflow trigger', async () => {
      const nameCheckChain = mockChain([]);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([makeFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'subflow' } } }],
        is_subflow: true,
      })]);
      db.select.mockReturnValue(nameCheckChain);
      db.insert.mockReturnValue(insertChain);

      const req = makeReq({ body: { name: 'Subflow', nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'subflow' } } }] } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_subflow: true }));
    });

    it('auto-deploys webhook flows and creates API key', async () => {
      const nameCheckChain = mockChain([]);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([makeFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }],
      })]);
      const deployInsertChain = mockChain();
      const keyInsertChain = mockChain();
      db.select.mockReturnValue(nameCheckChain);
      db.insert
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(deployInsertChain)
        .mockReturnValueOnce(keyInsertChain);

      const req = makeReq({ body: { name: 'Webhook Flow', nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }] } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      // 3 inserts: flow, apiDeployments, apiKeys
      expect(db.insert).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        personalApiKey: { rawKey: 'wh_test_raw_key_12345', prefix: 'wh_test_pr' },
      }));
    });

    it('registers repeatable BullMQ job for schedule-triggered flows', async () => {
      const nameCheckChain = mockChain([]);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([makeFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *', inputMessage: '{"task":"check"}' } } }],
      })]);
      db.select.mockReturnValue(nameCheckChain);
      db.insert.mockReturnValue(insertChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');

      const req = makeReq({ body: { name: 'Scheduled Flow', nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *', inputMessage: '{"task":"check"}' } } }] } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      expect(executionQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'schedule:flow-1',
        { pattern: '0 * * * *' },
        expect.objectContaining({ name: 'schedule:flow-1', data: { flowId: 'flow-1', inputMessage: { task: 'check' } } }),
      );
    });

    it('handles add rejection gracefully on create', async () => {
      const nameCheckChain = mockChain([]);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([makeFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }],
      })]);
      db.select.mockReturnValue(nameCheckChain);
      db.insert.mockReturnValue(insertChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');
      vi.mocked(executionQueue.add).mockRejectedValueOnce(new Error('Add failed'));

      const req = makeReq({ body: { name: 'Scheduled Flow', nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }] } });
      const res = makeRes();

      await getHandler(router, 'post', '/')(req, res);

      // The catch should swallow the error; flow creation still succeeds
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('enforces flow:create permission', async () => {
      const req = makeReq({ user: { userId: 'u1', permissions: ['flow:read'] } });
      const res = makeRes();
      const next = vi.fn();

      getMiddleware(router, 'post', '/')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── PUT /:id (update flow) ─────────────────────────────────

  describe('PUT /:id', () => {
    function makeUpdateFlow(overrides = {}) {
      return makeFlow({
        nodes: [],
        ...overrides,
      });
    }

    it('updates existing flow', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({ name: 'Updated Flow' })]);
      db.update.mockReturnValue(updateChain);
      // Access check select (canAccessFlow): flow owned by the admin user,
      // then duplicate-name check returns no conflict
      db.select
        .mockReturnValueOnce(mockChain([{ created_by: 'admin', group_id: null }]))
        .mockReturnValueOnce(mockChain([]));

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' }, body: { name: 'Updated Flow' } });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated Flow' }));
    });

    it('returns 404 when flow not found', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([]);
      db.update.mockReturnValue(updateChain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' }, body: { name: 'Updated' } });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow not found' });
    });

    it('returns 409 when new name conflicts with existing flow', async () => {
      const nameCheckChain = mockChain([{ id: 'other-flow' }]);
      db.select.mockReturnValue(nameCheckChain);

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' }, body: { name: 'Taken Name' } });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'A flow with this name already exists' });
    });

    it('updates is_subflow when nodes are provided', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'subflow' } } }],
        is_subflow: true,
      })]);
      db.update.mockReturnValue(updateChain);

      const req = makeReq({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'subflow' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_subflow: true }));
    });

    it('auto-deploys webhook trigger on update', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }],
      })]);
      db.update.mockReturnValue(updateChain);
      const existingKeyChain = mockChain([]);
      db.select
        .mockReturnValueOnce(mockChain([{ created_by: 'admin', group_id: null }])) // access check
        .mockReturnValue(existingKeyChain);

      const req = makeReq({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      // Should insert deployment and key
      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        personalApiKey: { rawKey: 'wh_test_raw_key_12345', prefix: 'wh_test_pr' },
      }));
    });

    it('does not create API key if user already has one', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }],
      })]);
      db.update.mockReturnValue(updateChain);
      const existingKeyChain = mockChain([{ id: 'existing-key' }]);
      db.select.mockReturnValue(existingKeyChain);

      const req = makeReq({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'webhook' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      // Should insert deployment only (key already exists, so no insert)
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveProperty('personalApiKey');
    });

    it('updates schedule cron when nodes change', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 */2 * * *', inputMessage: '{"task":"check"}' } } }],
      })]);
      db.update.mockReturnValue(updateChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');

      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      const req = makeReq({
        params: { id: flowId },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 */2 * * *', inputMessage: '{"task":"check"}' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      expect(executionQueue.upsertJobScheduler).toHaveBeenCalledWith(
        `schedule:${flowId}`,
        { pattern: '0 */2 * * *' },
        expect.objectContaining({ name: `schedule:${flowId}`, data: { flowId, inputMessage: { task: 'check' } } }),
      );
    });

    it('handles removeJobScheduler rejection gracefully on update', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }],
      })]);
      db.update.mockReturnValue(updateChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');
      vi.mocked(executionQueue.removeJobScheduler).mockRejectedValueOnce(new Error('Remove failed'));

      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      const req = makeReq({
        params: { id: flowId },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      // The catch should swallow the error; execution should still succeed
      expect(res.json).toHaveBeenCalled();
      expect(executionQueue.upsertJobScheduler).toHaveBeenCalled();
    });

    it('handles add rejection gracefully on update', async () => {
      const updateChain = mockChain();
      updateChain.returning.mockResolvedValue([makeUpdateFlow({
        nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }],
      })]);
      db.update.mockReturnValue(updateChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');
      vi.mocked(executionQueue.add).mockRejectedValueOnce(new Error('Add failed'));

      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      const req = makeReq({
        params: { id: flowId },
        body: { nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }] },
      });
      const res = makeRes();

      await getHandler(router, 'put', '/:id')(req, res);

      // The catch should swallow the error; the update still succeeds
      expect(res.json).toHaveBeenCalled();
    });

    it('enforces flow:edit permission', async () => {
      const req = makeReq({ user: { userId: 'u1', permissions: ['flow:read'] } });
      const res = makeRes();
      const next = vi.fn();

      getMiddleware(router, 'put', '/:id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /:id ────────────────────────────────────────────

  describe('DELETE /:id', () => {
    it('deletes a flow and cascades related records', async () => {
      const existingFlowChain = mockChain([{ nodes: [] }]);
      db.select.mockReturnValue(existingFlowChain);

      const mockTx = {
        select: vi.fn(() => mockChain([{ id: 'session-1' }, { id: 'session-2' }])),
        delete: vi.fn(() => {
          const chain = mockChain();
          chain.returning.mockResolvedValue([{ id: 'flow-1' }]);
          return chain;
        }),
      };
      db.transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await getHandler(router, 'delete', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 404 when flow not found (via transaction error)', async () => {
      const existingFlowChain = mockChain([{ nodes: [] }]);
      db.select
        .mockReturnValueOnce(existingFlowChain);

      const mockTx = {
        select: vi.fn(() => mockChain([])),
        delete: vi.fn(() => {
          const chain = mockChain();
          chain.returning.mockResolvedValue([]);
          return chain;
        }),
      };
      db.transaction.mockImplementation(async (fn: any) => {
        await fn(mockTx);
      });

      const req = makeReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
      const res = makeRes();

      await expect(getHandler(router, 'delete', '/:id')(req, res)).rejects.toThrow('Flow not found');
    });

    it('removes schedule before deleting', async () => {
      const existingFlowChain = mockChain([{ nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }] }]);
      db.select.mockReturnValue(existingFlowChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');

      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      const mockTx = {
        select: vi.fn(() => mockChain([])),
        delete: vi.fn(() => {
          const chain = mockChain();
          chain.returning.mockResolvedValue([{ id: flowId }]);
          return chain;
        }),
      };
      db.transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const req = makeReq({ params: { id: flowId } });
      const res = makeRes();

      await getHandler(router, 'delete', '/:id')(req, res);

      expect(executionQueue.removeJobScheduler).toHaveBeenCalledWith(
        `schedule:${flowId}`,
      );
    });

    it('handles removeJobScheduler rejection on delete gracefully', async () => {
      const existingFlowChain = mockChain([{ nodes: [{ id: 't1', data: { type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *' } } }] }]);
      db.select.mockReturnValue(existingFlowChain);
      const { executionQueue } = await import('../../../worker/src/queue.js');
      vi.mocked(executionQueue.removeJobScheduler).mockRejectedValueOnce(new Error('Remove failed'));

      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      const mockTx = {
        select: vi.fn(() => mockChain([])),
        delete: vi.fn(() => {
          const chain = mockChain();
          chain.returning.mockResolvedValue([{ id: flowId }]);
          return chain;
        }),
      };
      db.transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const req = makeReq({ params: { id: flowId } });
      const res = makeRes();

      await getHandler(router, 'delete', '/:id')(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('enforces flow:delete permission', async () => {
      const req = makeReq({ user: { userId: 'u1', permissions: ['flow:read'] } });
      const res = makeRes();
      const next = vi.fn();

      getMiddleware(router, 'delete', '/:id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── POST /validate ─────────────────────────────────────────

  describe('POST /validate', () => {
    it('returns valid: true when no errors', async () => {
      const req = makeReq({ body: { nodes: [], edges: [] } });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      expect(res.json).toHaveBeenCalledWith({ valid: true, errors: [] });
    });

    it('detects cycles via topologicalSort', async () => {
      const { topologicalSort } = await import('../../../worker/src/executor/dag.js');
      vi.mocked(topologicalSort).mockReturnValueOnce({ sorted: [], cycles: [['node-1', 'node-2']] });

      const req = makeReq({ body: { nodes: [{ id: 'node-1', data: { type: 'code' } }], edges: [{ source: 'node-1', target: 'node-1' }] } });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      // Should still return valid: true since cycles are reported but don't produce errors
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
    });

    it('reports compileFlow errors', async () => {
      const { FlowExecutor } = await import('../../../worker/src/executor/engine.js');
      vi.mocked(FlowExecutor).mockImplementation(function() {
        return { compileFlow: vi.fn().mockReturnValueOnce(['Invalid node configuration']) };
      });

      const req = makeReq({ body: { nodes: [{ id: 'n1', data: { type: 'output', config: { inputFields: ['missing.field'] } } }], edges: [] } });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
    });

    it('catches compilation exceptions gracefully', async () => {
      const { FlowExecutor } = await import('../../../worker/src/executor/engine.js');
      vi.mocked(FlowExecutor).mockImplementation(function() {
        return { compileFlow: vi.fn(() => { throw new Error('Unexpected error'); }) };
      });

      const req = makeReq({ body: { nodes: [{ id: 'n1', data: { type: 'code' } }], edges: [] } });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Compilation error');
    });

    it('handles non-Error compilation exception', async () => {
      const { FlowExecutor } = await import('../../../worker/src/executor/engine.js');
      vi.mocked(FlowExecutor).mockImplementation(function() {
        return { compileFlow: vi.fn(() => { throw 'string error'; }) };
      });

      const req = makeReq({ body: { nodes: [{ id: 'n1', data: { type: 'code' } }], edges: [] } });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Compilation error');
    });

    it('detects circular subflow references', async () => {
      const req = makeReq({
        body: {
          nodes: [
            { id: 'sf1', data: { type: 'subflow', label: 'Sub One', config: { subflowId: 'sub-1' } } },
          ],
          edges: [],
          subflowAncestry: ['sub-1'],
        },
      });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Circular subflow reference');
    });

    it('skips circular check when subflowAncestry is non-empty but targetId is missing', async () => {
      const req = makeReq({
        body: {
          nodes: [
            { id: 'sf1', data: { type: 'subflow', config: {} } },
          ],
          edges: [],
          subflowAncestry: ['sub-1'],
        },
      });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      // No circular reference error should be pushed, but missing subflowId error should
      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Circular'))).toBe(false);
      expect(result.errors.some((e: string) => e.includes('subflowId'))).toBe(true);
    });

    it('detects recursion depth limit exceeded', async () => {
      const req = makeReq({
        body: {
          nodes: [],
          edges: [],
          subflowAncestry: Array(10).fill('some-id'),
        },
      });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Subflow recursion depth limit exceeded');
    });

    it('validates subflow nodes have subflowId', async () => {
      const req = makeReq({
        body: {
          nodes: [
            { id: 'sf1', data: { type: 'subflow', label: 'Broken Sub', config: {} } },
          ],
          edges: [],
        },
      });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('missing subflowId');
    });

    it('handles subflow node with missing config entirely', async () => {
      const req = makeReq({
        body: {
          nodes: [
            { id: 'sf2', data: { type: 'subflow' } },
          ],
          edges: [],
        },
      });
      const res = makeRes();

      await getHandler(router, 'post', '/validate')(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('missing subflowId');
    });
  });
});
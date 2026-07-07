import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

vi.mock('core-agents-shared', () => ({
  flows: { _: { name: 'flows' } },
  apiDeployments: { _: { name: 'api_deployments' } },
  executions: { _: { name: 'executions' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
}));

vi.mock('../../../worker/src/queue.js', () => ({
  enqueueExecution: vi.fn(async () => {}),
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

function mockChain(data?: any) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => data !== undefined ? data : chain),
    values: vi.fn(() => chain),
    returning: vi.fn(),
    then: undefined as any,
    catch: vi.fn(),
  };
  if (data !== undefined) {
    chain.then = (onfulfilled: any) => {
      const result = onfulfilled(data);
      return result instanceof Promise ? result : Promise.resolve(result);
    };
  }
  return chain;
}

function makeWebhookFlow(overrides = {}) {
  return {
    id: 'flow-1',
    name: 'Test Webhook Flow',
    description: 'A test flow',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        data: {
          type: 'trigger',
          config: {
            triggerType: 'webhook',
          },
        },
      },
    ],
    edges: [],
    version: 1,
    created_by: 'user-1',
    group_id: null,
    is_subflow: false,
    flow_context: '',
    env_vars: [],
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

async function callHandler(handler: any, req: any, res: any) {
  const next = vi.fn();
  handler(req, res, next);
  await new Promise(r => setTimeout(r, 0));
  if (next.mock.calls.length > 0) throw next.mock.calls[0][0];
}

describe('webhook routes (slug resolution)', () => {
  let router: any;
  let db: any;
  let req: any;
  let res: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    db.select.mockReturnValue(mockChain([]));
    db.insert.mockReturnValue(mockChain());
    const mod = await import('../routes/webhook.js');
    router = mod.default;
    req = {
      params: {},
      query: {},
      body: {},
      headers: {},
      protocol: 'http',
      get: vi.fn().mockReturnValue('localhost:3001'),
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      end: vi.fn(),
    };
  });

  describe('POST /webhook/:flowId', () => {
    it('UUID flowId passes through unchanged (no apiDeployments lookup)', async () => {
      const flowId = '550e8400-e29b-41d4-a716-446655440000';
      req.params = { flowId };
      req.body = { amount: 100 };

      const flowChain = mockChain([makeWebhookFlow({ id: flowId })]);
      db.select.mockReturnValue(flowChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ id: 'exec-1' }]);
      db.insert.mockReturnValue(insertChain);

      await callHandler(getHandler(router, 'post', '/webhook/:flowId'), req, res);

      // Only one select call — for the flow lookup, not apiDeployments
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ status: 'queued', executionId: 'exec-1' });
    });

    it('non-UUID slug resolves via apiDeployments lookup', async () => {
      req.params = { flowId: 'my-slug' };
      req.body = { amount: 100 };

      const deployChain = mockChain([{ flow_id: 'flow-1', path_slug: 'my-slug' }]);
      const flowChain = mockChain([makeWebhookFlow()]);
      db.select.mockReturnValueOnce(deployChain).mockReturnValueOnce(flowChain);
      const insertChain = mockChain();
      insertChain.returning.mockResolvedValue([{ id: 'exec-1' }]);
      db.insert.mockReturnValue(insertChain);

      await callHandler(getHandler(router, 'post', '/webhook/:flowId'), req, res);

      // Two select calls: one for apiDeployments slug resolution, one for flow lookup
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({ status: 'queued', executionId: 'exec-1' });
    });

    it('non-UUID slug not found returns 404', async () => {
      req.params = { flowId: 'unknown-slug' };

      const deployChain = mockChain([]);
      db.select.mockReturnValue(deployChain);

      await callHandler(getHandler(router, 'post', '/webhook/:flowId'), req, res);

      // Slug not found in apiDeployments, then flow lookup also empty → 404
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Flow not found' });
    });
  });
});

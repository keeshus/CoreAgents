import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../utils/async-handler.js', () => ({
  asyncHandler: vi.fn((fn: any) => fn),
}));

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  inArray: vi.fn((a: any, b: any[]) => ({ op: 'inArray', a, b })),
}));

// crypto mock for deterministic key hashing
const mockDigest = vi.fn(() => 'mocked-hash');
vi.mock('crypto', () => ({
  default: { randomBytes: vi.fn((n: number) => Buffer.alloc(n, 'b')), createHash: vi.fn(() => ({ update: vi.fn().mockReturnThis(), digest: mockDigest })) },
  randomBytes: vi.fn((n: number) => Buffer.alloc(n, 'b')),
  createHash: vi.fn(() => ({ update: vi.fn().mockReturnThis(), digest: mockDigest })),
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
  const limit = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn(() => Object.assign(Promise.resolve(resolvedValue), { limit }));
  const chain = { from: vi.fn(() => chain), where };
  Object.assign(chain, { limit });
  return chain;
}

function makeReq(overrides?: any) {
  return { params: {}, query: {}, body: {}, headers: {}, user: { userId: 'admin', permissions: ['admin'] }, ...overrides };
}

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
}

// ── Tests ─────────────────────────────────────────────────────

describe('openai-chat routes', () => {
  let router: any;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = (await import('../db/connection.js')).db;
    const mod = await import('../routes/openai-chat.js');
    router = mod.default;
  });

  describe('authenticateApiKey middleware', () => {
    it('returns 401 when no Authorization header is present', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();

      const middleware = getMiddleware(router, 'post', '/v1/chat/completions', 0);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for invalid API key (no matching key_hash)', async () => {
      db.select.mockReturnValue(mockChain([]));
      const req = makeReq({ headers: { authorization: 'Bearer some-key' } });
      const res = makeRes();
      const next = vi.fn();

      const middleware = getMiddleware(router, 'post', '/v1/chat/completions', 0);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for disabled API key', async () => {
      db.select.mockReturnValue(mockChain([{ id: 'key-1', flow_id: 'flow-1', enabled: false, key_hash: 'mocked-hash', expires_at: null }]));
      const req = makeReq({ headers: { authorization: 'Bearer some-key' } });
      const res = makeRes();
      const next = vi.fn();

      const middleware = getMiddleware(router, 'post', '/v1/chat/completions', 0);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 400 when deployment is not enabled', async () => {
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'key-1', flow_id: 'flow-1', enabled: true, key_hash: 'mocked-hash', expires_at: null, label: 'test' }]))
        .mockReturnValueOnce(mockChain([]));
      db.update.mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });
      const req = makeReq({ headers: { authorization: 'Bearer some-key' } });
      const res = makeRes();
      const next = vi.fn();

      const middleware = getMiddleware(router, 'post', '/v1/chat/completions', 0);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('calls next() when authentication succeeds', async () => {
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'key-1', flow_id: 'flow-1', enabled: true, key_hash: 'mocked-hash', expires_at: null, label: 'test' }]))
        .mockReturnValueOnce(mockChain([{ flow_id: 'flow-1', enabled: true, model_name: 'gpt-4o', rate_limit: 0 }]));
      db.update.mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) });
      const req = makeReq({ headers: { authorization: 'Bearer valid-key' } });
      const res = makeRes();
      const next = vi.fn();

      const middleware = getMiddleware(router, 'post', '/v1/chat/completions', 0);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.chatFlowId).toBe('flow-1');
    });
  });
});

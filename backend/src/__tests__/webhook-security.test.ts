import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/connection.js', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));

vi.mock('core-agents-shared', () => ({
  flows: { _: { name: 'flows' } },
  apiKeys: { _: { name: 'api_keys' } },
  groupMembers: { _: { name: 'group_members' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
}));

function mockChain(data?: any) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => data !== undefined ? data : chain),
    set: vi.fn(() => chain),
    catch: vi.fn(),
    then: undefined as any,
  };
  if (data !== undefined) {
    chain.then = (onfulfilled: any) => {
      const result = onfulfilled(data);
      return result instanceof Promise ? result : Promise.resolve(result);
    };
  }
  return chain;
}

function webhookFlow(secret?: string) {
  return {
    id: 'flow-1',
    name: 'F',
    nodes: [{ id: 't1', type: 'trigger', data: { type: 'trigger', config: { triggerType: 'webhook', ...(secret ? { webhookSecret: secret } : {}) } } }],
  };
}

describe('webhook-security helpers', () => {
  let db: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    db = (await import('../db/connection.js')).db;
    db.select.mockReturnValue(mockChain([]));
    db.update.mockReturnValue(mockChain());
    const { resetRateLimiters } = await import('../routes/webhook-security.js');
    resetRateLimiters();
  });

  describe('safeEqual', () => {
    it('is timing-safe and length-aware', async () => {
      const { safeEqual } = await import('../routes/webhook-security.js');
      expect(safeEqual('abc', 'abc')).toBe(true);
      expect(safeEqual('abc', 'abd')).toBe(false);
      expect(safeEqual('abc', 'abcd')).toBe(false);
      expect(safeEqual('', '')).toBe(false);
      expect(safeEqual('', 'abc')).toBe(false);
    });
  });

  describe('SlidingWindowLimiter', () => {
    it('allows up to the limit and then returns Retry-After', async () => {
      const { SlidingWindowLimiter } = await import('../routes/webhook-security.js');
      const limiter = new SlidingWindowLimiter(60_000);
      expect(limiter.check('k', 2)).toBeNull();
      expect(limiter.check('k', 2)).toBeNull();
      const retryAfter = limiter.check('k', 2);
      expect(retryAfter).not.toBeNull();
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    });

    it('returns null (unlimited) for limit <= 0', async () => {
      const { SlidingWindowLimiter } = await import('../routes/webhook-security.js');
      const limiter = new SlidingWindowLimiter(60_000);
      expect(limiter.check('k', 0)).toBeNull();
      expect(limiter.check('k', -1)).toBeNull();
    });

    it('keys buckets independently', async () => {
      const { SlidingWindowLimiter } = await import('../routes/webhook-security.js');
      const limiter = new SlidingWindowLimiter(60_000);
      expect(limiter.check('a', 1)).toBeNull();
      expect(limiter.check('b', 1)).toBeNull();
      expect(limiter.check('a', 1)).not.toBeNull();
      expect(limiter.check('b', 1)).not.toBeNull();
    });
  });

  describe('enforceWebhookRateLimit', () => {
    it('uses per-deployment limit as requests per minute', async () => {
      const { enforceWebhookRateLimit } = await import('../routes/webhook-security.js');
      expect(enforceWebhookRateLimit('slug-a', 2)).toBeNull();
      expect(enforceWebhookRateLimit('slug-a', 2)).toBeNull();
      expect(enforceWebhookRateLimit('slug-a', 2)).not.toBeNull();
    });

    it('falls back to the default per-hour limit when rate_limit is unset', async () => {
      const { enforceWebhookRateLimit } = await import('../routes/webhook-security.js');
      for (let i = 0; i < 60; i++) {
        expect(enforceWebhookRateLimit('slug-b', 0)).toBeNull();
      }
      expect(enforceWebhookRateLimit('slug-b', 0)).not.toBeNull();
    });
  });

  describe('authenticateWebhookRequest', () => {
    it('rejects deployments with no secret and no API keys', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select
        .mockReturnValueOnce(mockChain([webhookFlow()])) // flow (no secret)
        .mockReturnValueOnce(mockChain([])); // no keys

      const result = await authenticateWebhookRequest({ headers: {}, query: {} }, 'flow-1');
      expect(result?.status).toBe(401);
      expect(result?.message).toContain('webhook secret or an API key');
    });

    it('accepts a valid API key without loading the flow', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select
        .mockReturnValueOnce(mockChain([{ id: 'key-1', flow_id: 'flow-1', enabled: true }]));

      const result = await authenticateWebhookRequest({ headers: { authorization: 'Bearer wh_key123' }, query: {} }, 'flow-1');
      expect(result).toBeNull();
      expect(db.select).toHaveBeenCalledTimes(1); // no flow load on the fast path
    });

    it('rejects an invalid wh_ API key', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValue(mockChain([]));

      const result = await authenticateWebhookRequest({ headers: { authorization: 'Bearer wh_badkey' }, query: {} }, 'flow-1');
      expect(result?.status).toBe(401);
      expect(result?.message).toBe('Invalid API key');
    });

    it('accepts the secret from the X-Webhook-Secret header', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([webhookFlow('s3cret')]));

      const result = await authenticateWebhookRequest({ headers: { 'x-webhook-secret': 's3cret' }, query: {} }, 'flow-1');
      expect(result).toBeNull();
    });

    it('accepts the secret from a non-wh_ Bearer token', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([webhookFlow('s3cret')]));

      const result = await authenticateWebhookRequest({ headers: { authorization: 'Bearer s3cret' }, query: {} }, 'flow-1');
      expect(result).toBeNull();
    });

    it('still accepts the legacy ?secret= query param', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([webhookFlow('s3cret')]));

      const result = await authenticateWebhookRequest({ headers: {}, query: { secret: 's3cret' } }, 'flow-1');
      expect(result).toBeNull();
    });

    it('prefers the header secret over a mismatched query secret', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([webhookFlow('right')]));

      const result = await authenticateWebhookRequest(
        { headers: { 'x-webhook-secret': 'right' }, query: { secret: 'wrong' } }, 'flow-1',
      );
      expect(result).toBeNull();
    });

    it('rejects a wrong secret with 403', async () => {
      const { authenticateWebhookRequest } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([webhookFlow('right')]));

      const result = await authenticateWebhookRequest({ headers: {}, query: { secret: 'wrong' } }, 'flow-1');
      expect(result?.status).toBe(403);
      expect(result?.message).toBe('Invalid webhook secret');
    });
  });

  describe('resolveFlowAccess', () => {
    it('allows admins on any flow', async () => {
      const { resolveFlowAccess } = await import('../routes/webhook-security.js');
      const result = await resolveFlowAccess(
        { user: { userId: 'a', permissions: ['admin'] } },
        { id: 'f', group_id: 'g' },
      );
      expect(result).toEqual({ role: 'admin' });
    });

    it('allows any editor on ungrouped flows', async () => {
      const { resolveFlowAccess } = await import('../routes/webhook-security.js');
      const result = await resolveFlowAccess(
        { user: { userId: 'u', permissions: ['flow:edit'] } },
        { id: 'f', group_id: null },
      );
      expect(result).toEqual({ role: 'member' });
    });

    it('denies non-members of the flow group', async () => {
      const { resolveFlowAccess } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([]));
      const result = await resolveFlowAccess(
        { user: { userId: 'u', permissions: ['flow:edit'] } },
        { id: 'f', group_id: 'g' },
      );
      expect('status' in result && result.status).toBe(403);
    });

    it('denies non-admin members when requireGroupAdmin is set', async () => {
      const { resolveFlowAccess } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([{ role: 'member' }]));
      const result = await resolveFlowAccess(
        { user: { userId: 'u', permissions: ['flow:edit'] } },
        { id: 'f', group_id: 'g' },
        true,
      );
      expect('status' in result && result.status).toBe(403);
    });

    it('allows group admins when requireGroupAdmin is set', async () => {
      const { resolveFlowAccess } = await import('../routes/webhook-security.js');
      db.select.mockReturnValueOnce(mockChain([{ role: 'admin' }]));
      const result = await resolveFlowAccess(
        { user: { userId: 'u', permissions: ['flow:edit'] } },
        { id: 'f', group_id: 'g' },
        true,
      );
      expect(result).toEqual({ role: 'admin' });
    });
  });
});

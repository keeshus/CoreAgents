import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, apiKeys, groupMembers } from '../db/schema.js';

// Timing-safe string comparison — plain !== is vulnerable to timing attacks.
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// In-memory sliding-window rate limiter, keyed per deployment slug / API key id.
// NOTE: in-memory state is per-process. If the backend is ever scaled to
// multiple instances, this must be backed by Redis — no Redis client exists
// in the backend today, so a single-instance limiter is used.
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  constructor(private readonly windowMs: number) {}

  // Returns null when the request is allowed, or the number of seconds until
  // the request may be retried (Retry-After) when the limit is exceeded.
  check(key: string, limit: number): number | null {
    if (limit <= 0) return null;
    const now = Date.now();
    if (now - this.lastSweep > this.windowMs) this.sweep(now);
    const cutoff = now - this.windowMs;
    const times = (this.hits.get(key) || []).filter(t => t > cutoff);
    if (times.length >= limit) {
      this.hits.set(key, times);
      return Math.max(1, Math.ceil((times[0] + this.windowMs - now) / 1000));
    }
    times.push(now);
    this.hits.set(key, times);
    return null;
  }

  reset(): void {
    this.hits.clear();
    this.lastSweep = Date.now();
  }

  private sweep(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const remaining = times.filter(t => t > cutoff);
      if (remaining.length === 0) this.hits.delete(key);
      else this.hits.set(key, remaining);
    }
  }
}

// A per-deployment rate_limit > 0 is interpreted as requests per minute
// (see docs/plan-openapi-webhook-flows.md). When unset (0 = unlimited),
// a default per-hour cap is applied so unconfigured deployments cannot be
// hammered for free.
export const DEFAULT_WEBHOOK_RATE_LIMIT = 60; // requests per hour
export const DEFAULT_CHAT_RATE_LIMIT = 100; // requests per minute per API key

export const webhookMinuteLimiter = new SlidingWindowLimiter(60_000);
export const webhookHourLimiter = new SlidingWindowLimiter(3_600_000);
export const chatMinuteLimiter = new SlidingWindowLimiter(60_000);

export function enforceWebhookRateLimit(slug: string, rateLimit: number): number | null {
  if (rateLimit > 0) {
    return webhookMinuteLimiter.check(slug, rateLimit);
  }
  const defaultLimit = parseInt(process.env.WEBHOOK_RATE_LIMIT_DEFAULT || String(DEFAULT_WEBHOOK_RATE_LIMIT), 10);
  return webhookHourLimiter.check(slug, defaultLimit);
}

export function enforceChatRateLimit(keyId: string, rateLimit: number): number | null {
  if (rateLimit > 0) {
    return chatMinuteLimiter.check(keyId, rateLimit);
  }
  const defaultLimit = parseInt(process.env.CHAT_RATE_LIMIT_MAX || String(DEFAULT_CHAT_RATE_LIMIT), 10);
  return chatMinuteLimiter.check(keyId, defaultLimit);
}

export function resetRateLimiters(): void {
  webhookMinuteLimiter.reset();
  webhookHourLimiter.reset();
  chatMinuteLimiter.reset();
}

export interface WebhookAuthResult {
  status: number;
  message: string;
}

function getConfiguredSecret(flow: any): string | undefined {
  const nodes = (flow?.nodes || []) as any[];
  const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
  return triggerNode?.data?.config?.webhookSecret;
}

// Shared auth for the public webhook endpoints (both slug-based and the
// legacy flowId-based route). A request is valid if EITHER a personal API key
// (Authorization: Bearer wh_...) OR the webhook secret matches. The secret is
// accepted via the X-Webhook-Secret header (preferred), a non-wh_ Bearer
// token, or the legacy ?secret= query param (kept for backward compatibility
// with existing integrations; the header is preferred to avoid leaking the
// secret into logs/history).
export async function authenticateWebhookRequest(
  req: any,
  flowId: string,
  preloadedFlow?: any,
): Promise<WebhookAuthResult | null> {
  let apiKeyValid = false;
  let secretValid = false;

  const authHeader = req.headers.authorization as string | undefined;
  let bearerToken = '';
  if (authHeader?.startsWith('Bearer ')) {
    bearerToken = authHeader.slice(7).trim();
    if (bearerToken.startsWith('wh_')) {
      const keyHash = crypto.createHash('sha256').update(bearerToken).digest('hex');
      const [keyRecord] = await db.select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key_hash, keyHash), eq(apiKeys.flow_id, flowId))).limit(1);
      if (keyRecord?.enabled) {
        apiKeyValid = true;
        db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, keyRecord.id)).catch(() => {});
      }
    }
  }

  const headerSecret = (req.headers['x-webhook-secret'] as string | undefined) || '';
  const querySecret = (req.query.secret as string) || '';
  const bearerAsSecret = bearerToken && !bearerToken.startsWith('wh_') ? bearerToken : '';
  const secretCandidates = [headerSecret, bearerAsSecret, querySecret].filter(Boolean);
  const attemptedSecret = secretCandidates.length > 0;

  // Fast path: a valid API key with no secret attempt does not need the flow
  if (apiKeyValid && !attemptedSecret) return null;

  const flow = preloadedFlow ?? await loadFlow(flowId);
  const configuredSecret = getConfiguredSecret(flow);
  if (configuredSecret) {
    secretValid = secretCandidates.some(candidate => safeEqual(candidate, configuredSecret));
  }

  if (!authHeader && !attemptedSecret) {
    if (!configuredSecret) {
      const [anyKey] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.flow_id, flowId)).limit(1);
      if (!anyKey) {
        // No credentials configured at all — never allow public triggering.
        return {
          status: 401,
          message: 'Authentication required. Configure a webhook secret or an API key for this deployment before it can be triggered.',
        };
      }
    }
    return {
      status: 401,
      message: 'Authentication required. Provide an API key (Authorization: Bearer wh_...) or a webhook secret (X-Webhook-Secret: ... or ?secret=...).',
    };
  }

  if (apiKeyValid || secretValid) return null;

  if (bearerToken.startsWith('wh_')) {
    return { status: 401, message: 'Invalid API key' };
  }
  if (attemptedSecret) {
    return { status: 403, message: 'Invalid webhook secret' };
  }
  return {
    status: 401,
    message: 'Authentication required. Provide an API key (Authorization: Bearer wh_...) or a webhook secret (X-Webhook-Secret: ... or ?secret=...).',
  };
}

async function loadFlow(flowId: string): Promise<any> {
  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId)).limit(1);
  return flow;
}

// Group-membership scoping for deployment/key management routes. Mirrors the
// pattern used by mcp-servers.ts / vector-stores.ts: admins bypass, ungrouped
// flows are manageable by any flow:edit user, grouped flows require group
// membership (and group-admin role when requireGroupAdmin is set).
export async function resolveFlowAccess(
  req: any,
  flow: { id: string; group_id: string | null } | undefined,
  requireGroupAdmin = false,
): Promise<{ role: string } | { status: number; error: string }> {
  if (req.user!.permissions.includes('admin')) return { role: 'admin' };
  if (!flow) return { status: 404, error: 'Flow not found' };
  if (!flow.group_id) return { role: 'member' };
  const [membership] = await db.select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.group_id, flow.group_id), eq(groupMembers.user_id, req.user!.userId))).limit(1);
  if (!membership) {
    return { status: 403, error: 'You are not a member of this flow\'s group' };
  }
  if (requireGroupAdmin && membership.role !== 'admin') {
    return { status: 403, error: 'Only group admins can change the deployment slug' };
  }
  return { role: membership.role };
}

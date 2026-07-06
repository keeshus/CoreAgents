/**
 * Built-in tool definitions and direct execution.
 * Tools: store, now, uuid, log
 * These are auto-injected into every LLM Agent node and executed directly
 * (no MCP transport needed).
 *
 * The `bash` tool is defined separately in ./bash.ts.
 */
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const STORE_MAX_VALUE_SIZE = 1024 * 100; // 100KB max per stored value

// In-memory store — automatically cleaned up when the process exits
const store = new Map<string, { value: unknown; updatedAt: string }>();

function storeKey(runId: string | undefined, key: string): string {
  return runId ? `${runId}:${key}` : key;
}

// ── Interfaces ──────────────────────────────────────────────────────────────────

export interface BuiltInToolInfo {
  name: string;
  description: string;
}

// ── Tool list (used by engine.ts for auto-injection into LLM agents) ──────────

export const BUILT_IN_TOOLS: BuiltInToolInfo[] = [
  { name: 'store_get', description: 'Read a persisted value by key from the agent store' },
  { name: 'store_set', description: 'Persist a value by key (upserts) in the agent store' },
  { name: 'store_delete', description: 'Remove a persisted value by key from the agent store' },
  { name: 'store_list', description: 'List all stored keys in the agent store' },
  { name: 'now', description: 'Get the current date and time. Optionally specify a timezone (e.g. "Europe/Amsterdam", "America/New_York") or locale (e.g. "nl-NL", "ja-JP").' },
  { name: 'uuid', description: 'Generate a version 4 UUID' },
  { name: 'log', description: 'Write a log entry (info/warn/error)' },
];

// ── Tool input schemas (used by engine.ts for auto-injection) ─────────────────

const TOOL_SCHEMAS: Record<string, { type: string; properties: Record<string, unknown>; required?: string[] }> = {
  'store_get': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to look up' } },
    required: ['key'],
  },
  'store_set': {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The key to store under' },
      value: { type: 'string', description: 'Any JSON-serializable value to persist' },
    },
    required: ['key', 'value'],
  },
  'store_delete': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to remove' } },
    required: ['key'],
  },
  'store_list': {
    type: 'object',
    properties: {},
  },
  'now': {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: 'IANA timezone, e.g. "Europe/Amsterdam", "America/New_York". Defaults to UTC.' },
      locale: { type: 'string', description: 'Locale for formatting, e.g. "nl-NL", "ja-JP", "en-US". Defaults to "en-US".' },
    },
  },
  'uuid': { type: 'object', properties: {} },
  'log': {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Log severity level' },
      message: { type: 'string', description: 'The log message' },
    },
    required: ['message'],
  },
};

// ── Direct tool execution (in-process, no MCP transport needed) ────────────────

export async function callBuiltInTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'now': {
      const d = new Date();
      const timezone = (args?.timezone as string) || 'UTC';
      const locale = (args?.locale as string) || 'en-US';
      const formatted = new Intl.DateTimeFormat(locale, {
        dateStyle: 'full', timeStyle: 'long', timeZone: timezone,
      }).format(d);
      return JSON.stringify({
        iso: d.toISOString(),
        unix: d.getTime(),
        formatted,
        timezone,
      });
    }
    case 'uuid': {
      return JSON.stringify({ uuid: randomUUID() });
    }
    case 'log': {
      const level = (args?.level as string) || 'info';
      const message = (args?.message as string) || '';
      return `[log:${level}] ${message}`;
    }
    case 'store_get': {
      const runId = args?._runId as string | undefined;
      const key = args?.key as string;
      if (!key) throw new Error('Key is required');
      const entry = store.get(storeKey(runId, key));
      if (!entry) return JSON.stringify({ found: false });
      return JSON.stringify({ found: true, value: entry.value, updatedAt: entry.updatedAt });
    }
    case 'store_set': {
      const runId = args?._runId as string | undefined;
      const key = args?.key as string;
      const value = args?.value;
      if (!key) throw new Error('Key is required');
      const parsed = typeof value === 'string' ? maybeParse(value) : value;
      const serialized = JSON.stringify(parsed);
      if (serialized.length > STORE_MAX_VALUE_SIZE) {
        throw new Error(`Value exceeds maximum size of ${STORE_MAX_VALUE_SIZE / 1024}KB`);
      }
      store.set(storeKey(runId, key), { value: parsed, updatedAt: new Date().toISOString() });
      return JSON.stringify({ stored: true, key });
    }
    case 'store_delete': {
      const runId = args?._runId as string | undefined;
      const key = args?.key as string;
      if (!key) throw new Error('Key is required');
      store.delete(storeKey(runId, key));
      return JSON.stringify({ deleted: true, key });
    }
    case 'store_list': {
      const runId = args?._runId as string | undefined;
      const prefix = runId ? `${runId}:` : '';
      const keys = Array.from(store.entries())
        .filter(([k]) => !prefix || k.startsWith(prefix))
        .map(([k, v]) => ({ key: prefix ? k.slice(prefix.length) : k, updatedAt: v.updatedAt }));
      return JSON.stringify({ keys });
    }
    default:
      throw new Error(`Unknown built-in tool "${name}"`);
  }
}

// ── Path safety helper (used by file tools) ────────────────────────────────────
// @deprecated — no longer used by any built-in tool, but preserved for potential
// future internal use.

export function resolveSafePath(basePath: string, userPath: string): string {
  const requested = resolve(basePath, userPath);
  if (!requested.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }
  return requested;
}

// ── JSON parse helper ──────────────────────────────────────────────────────────

function maybeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

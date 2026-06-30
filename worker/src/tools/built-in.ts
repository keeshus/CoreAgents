/**
 * Built-in tool definitions and direct execution.
 * Tools: store, file, now, uuid, log, fetch
 * These are auto-injected into every LLM Agent node and executed directly
 * (no MCP transport needed).
 */
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import pg from 'pg';

const { Pool } = pg;

const STORE_MAX_VALUE_SIZE = 1024 * 100; // 100KB max per stored value
const FILE_MAX_SIZE = 1024 * 1024 * 5;   // 5MB max per file read/write
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || resolve(process.cwd(), 'workspace');

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
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
  { name: 'file_read', description: 'Read a file from the shared workspace' },
  { name: 'file_write', description: 'Write content to a file in the shared workspace' },
  { name: 'file_list', description: 'List directory contents in the shared workspace' },
  { name: 'now', description: 'Get the current date and time. Optionally specify a timezone (e.g. "Europe/Amsterdam", "America/New_York") or locale (e.g. "nl-NL", "ja-JP").' },
  { name: 'uuid', description: 'Generate a version 4 UUID' },
  { name: 'log', description: 'Write a log entry (info/warn/error)' },
  { name: 'fetch', description: 'Perform an HTTP GET request' },
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
  'file_read': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
    },
    required: ['path'],
  },
  'file_write': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
      content: { type: 'string', description: 'Text content to write' },
    },
    required: ['path', 'content'],
  },
  'file_list': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative directory path (defaults to root)' },
    },
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
  'fetch': {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
    },
    required: ['url'],
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
      console.log(`[builtin-log:${level}] ${message}`);
      return JSON.stringify({ logged: true, level, message });
    }
    case 'fetch': {
      const url = args?.url as string;
      if (!url?.startsWith('http://') && !url?.startsWith('https://')) {
        throw new Error('Only HTTP(S) URLs are allowed');
      }
      const response = await fetch(url);
      const text = await response.text();
      return JSON.stringify({ status: response.status, body: text });
    }
    case 'store_get': {
      const key = args?.key as string;
      if (!key) throw new Error('Key is required');
      const result = await getPool().query('SELECT value FROM agent_store WHERE key = $1', [key]);
      if (result.rows.length === 0) return JSON.stringify({ found: false });
      return JSON.stringify({ found: true, value: result.rows[0].value });
    }
    case 'store_set': {
      const key = args?.key as string;
      const value = args?.value;
      if (!key) throw new Error('Key is required');
      const parsed = typeof value === 'string' ? maybeParse(value) : value;
      const serialized = JSON.stringify(parsed);
      if (serialized.length > STORE_MAX_VALUE_SIZE) {
        throw new Error(`Value exceeds maximum size of ${STORE_MAX_VALUE_SIZE / 1024}KB`);
      }
      await getPool().query(
        'INSERT INTO agent_store (key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()',
        [key, JSON.stringify(parsed)]
      );
      return JSON.stringify({ stored: true, key });
    }
    case 'store_delete': {
      const key = args?.key as string;
      if (!key) throw new Error('Key is required');
      await getPool().query('DELETE FROM agent_store WHERE key = $1', [key]);
      return JSON.stringify({ deleted: true, key });
    }
    case 'store_list': {
      const result = await getPool().query('SELECT key, updated_at FROM agent_store ORDER BY key');
      return JSON.stringify({ keys: result.rows.map(r => ({ key: r.key, updatedAt: r.updated_at })) });
    }
    case 'file_read': {
      const path = args?.path as string;
      if (!path) throw new Error('Path is required');
      const safe = resolveSafePath(WORKSPACE_DIR, path);
      const stats = await stat(safe);
      if (stats.size > FILE_MAX_SIZE) throw new Error(`File exceeds maximum size of ${FILE_MAX_SIZE / 1024 / 1024}MB`);
      const content = await readFile(safe, 'utf-8');
      return JSON.stringify({ path, content, size: stats.size });
    }
    case 'file_write': {
      const path = args?.path as string;
      const content = args?.content as string;
      if (!path) throw new Error('Path is required');
      if (content === undefined) throw new Error('Content is required');
      if (content.length > FILE_MAX_SIZE) throw new Error(`Content exceeds maximum size of ${FILE_MAX_SIZE / 1024 / 1024}MB`);
      const safe = resolveSafePath(WORKSPACE_DIR, path);
      await mkdir(dirname(safe), { recursive: true });
      await writeFile(safe, content, 'utf-8');
      return JSON.stringify({ written: true, path });
    }
    case 'file_list': {
      const dir = (args?.path as string) || '.';
      const safe = resolveSafePath(WORKSPACE_DIR, dir);
      if (!existsSync(safe)) throw new Error(`Directory "${dir}" does not exist`);
      const entries = await readdir(safe, { withFileTypes: true });
      return JSON.stringify({
        path: dir,
        entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
      });
    }
    default:
      throw new Error(`Unknown built-in tool "${name}"`);
  }
}

// ── Path safety helper (used by file tools) ────────────────────────────────────

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

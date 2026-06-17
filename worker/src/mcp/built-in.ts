/**
 * Built-in MCP server that runs inside the worker process.
 * Exposes general-purpose tools: store, file, uuid, now, log, fetch.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type express from 'express';
import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// ── Interfaces ──────────────────────────────────────────────────────────────────

export interface BuiltInMCPServerOptions {
  /** Drizzle ORM database instance (or any duck-typed db with .execute()) */
  db: any;
  /** Absolute path to the shared workspace (used for file tools) */
  workspacePath: string;
  /** Port number to listen on */
  port: number;
}

export interface BuiltInMCPServerHandle {
  port: number;
  stop: () => Promise<void>;
}

// ── Tool metadata (used by the engine for auto-injection) ─────────────────────────

export interface BuiltInToolInfo {
  name: string;
  description: string;
}

export const BUILT_IN_TOOLS: BuiltInToolInfo[] = [
  { name: 'store_get', description: 'Read a persisted value by key from the agent store' },
  { name: 'store_set', description: 'Persist a value by key (upserts)' },
  { name: 'store_delete', description: 'Remove a persisted value by key' },
  { name: 'store_list', description: 'List all stored keys' },
  { name: 'file_read', description: 'Read a file from the shared workspace' },
  { name: 'file_write', description: 'Write content to a file in the shared workspace' },
  { name: 'file_list', description: 'List directory contents in the shared workspace' },
  { name: 'now', description: 'Get the current UTC date and time' },
  { name: 'uuid', description: 'Generate a version 4 UUID' },
  { name: 'log', description: 'Write a log entry (info/warn/error)' },
  { name: 'fetch', description: 'Perform an HTTP GET request' },
];

// ── Tool input schemas (used for both MCP registration and engine injection) ─────

const TOOL_SCHEMAS: Record<string, { type: string; properties: Record<string, unknown>; required?: string[] }> = {
  'store.get': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to look up' } },
    required: ['key'],
  },
  'store.set': {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The key to store under' },
      value: { type: 'string', description: 'Any JSON-serializable value to persist' },
    },
    required: ['key', 'value'],
  },
  'store.delete': {
    type: 'object',
    properties: { key: { type: 'string', description: 'The key to remove' } },
    required: ['key'],
  },
  'store.list': {
    type: 'object',
    properties: {},
  },
  'file.read': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
    },
    required: ['path'],
  },
  'file.write': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the shared workspace' },
      content: { type: 'string', description: 'Text content to write' },
    },
    required: ['path', 'content'],
  },
  'file.list': {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative directory path (defaults to root)' },
    },
  },
  'now': {
    type: 'object',
    properties: {},
  },
  'uuid': {
    type: 'object',
    properties: {},
  },
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
      url: { type: 'string', description: 'The URL to send a GET request to' },
    },
    required: ['url'],
  },
};

// ── Server bootstrap ─────────────────────────────────────────────────────────────

export async function startBuiltInMCPServer(options: BuiltInMCPServerOptions): Promise<BuiltInMCPServerHandle> {
  const { db, workspacePath, port } = options;

  const server = new Server(
    { name: 'core-agents-builtin', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── Tools/list handler ────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: BUILT_IN_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: TOOL_SCHEMAS[t.name],
      })),
    };
  });

  // ── Tools/call handler ────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // ── Store tools ─────────────────────────────────────────────────────
        case 'store_get': {
          const result = await db.execute(`SELECT value FROM agent_store WHERE key = $1`, [args?.key]);
          const row = result.rows?.[0] ?? result[0]; // handle both drizzle + raw pg
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ value: row?.value ? maybeParse(row.value) : null }) }],
          };
        }

        case 'store_set': {
          await db.execute(
            `INSERT INTO agent_store (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [args?.key, JSON.stringify(args?.value)],
          );
          return { content: [{ type: 'text' as const, text: JSON.stringify({ stored: true }) }] };
        }

        case 'store_delete': {
          await db.execute(`DELETE FROM agent_store WHERE key = $1`, [args?.key]);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true }) }] };
        }

        case 'store_list': {
          const result = await db.execute(`SELECT key FROM agent_store ORDER BY key`);
          const rows = result.rows ?? result;
          const keys = Array.isArray(rows) ? rows.map((r: any) => r.key) : [];
          return { content: [{ type: 'text' as const, text: JSON.stringify({ keys }) }] };
        }

        // ── File tools ─────────────────────────────────────────────────────
        case 'file_read': {
          const safePath = resolveSafePath(workspacePath, args?.path ?? '');
          const content = await readFile(safePath, 'utf-8');
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ content, size: content.length }) }],
          };
        }

        case 'file_write': {
          const safePath = resolveSafePath(workspacePath, args?.path ?? '');
          await mkdir(dirname(safePath), { recursive: true });
          await writeFile(safePath, args?.content ?? '', 'utf-8');
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ path: args?.path, size: (args?.content ?? '').length }) }],
          };
        }

        case 'file_list': {
          const safePath = resolveSafePath(workspacePath, args?.path ?? '');
          const entries = await readdir(safePath, { withFileTypes: true });
          const mapped = entries.map((e) => ({
            name: e.name,
            isDir: e.isDirectory(),
          }));
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ path: args?.path ?? '/', entries: mapped }) }],
          };
        }

        // ── Utility tools ──────────────────────────────────────────────────
        case 'now': {
          const now = new Date();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ iso: now.toISOString(), unix: now.getTime() }) }],
          };
        }

        case 'uuid': {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ uuid: randomUUID() }) }] };
        }

        case 'log': {
          const level: string = args?.level ?? 'info';
          const message: string = args?.message ?? '';
          console.log(`[builtin-log:${level}] ${message}`);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ logged: true, level, message }) }] };
        }

        case 'fetch': {
          const url: string = args?.url ?? '';
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Only HTTP(S) URLs are allowed' }) }],
              isError: true,
            };
          }
          const response = await fetch(url);
          const text = await response.text();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ status: response.status, body: text }) }],
          };
        }

        default:
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  // ── SSE transport ──────────────────────────────────────────────────────────────
  const { default: createApp } = await import('express');
  const app: express.Express = createApp();
  let transport: SSEServerTransport | undefined;

  app.get('/sse', (req, res) => {
    transport = new SSEServerTransport('/messages', res);
    server.connect(transport).catch((err) => {
      console.error('Built-in MCP: failed to connect server to transport:', err);
    });
  });

  app.post('/messages', (req, res) => {
    if (transport) {
      transport.handlePostMessage(req, res);
    } else {
      res.status(400).json({ error: 'No active SSE connection' });
    }
  });

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(port, () => {
      console.log(`Built-in MCP server listening on port ${port}`);
      resolve({
        port,
        stop: async () => {
          try {
            await server.close();
          } catch { /* ignore if already closed */ }
          httpServer.close();
        },
      });
    });
    httpServer.once('error', (err: Error) => {
      reject(err);
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function resolveSafePath(base: string, userPath: string): string {
  const resolved = resolve(base, userPath);
  const baseResolved = resolve(base);
  if (!resolved.startsWith(baseResolved)) {
    throw new Error(`Path traversal detected: '${userPath}' escapes the workspace`);
  }
  return resolved;
}

function maybeParse(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

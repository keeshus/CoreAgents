// ── Mock MCP Server for E2E testing ──────────────────────────────
// Implements the MCP SSE transport protocol:
//   GET /sse → SSE stream
//   POST /messages?sessionId=... → JSON-RPC tool calls
//
// Run: npx tsx test/mock-mcp/server.ts
// Listens on port 3003 by default

import http from 'node:http';
import url from 'node:url';

const PORT = parseInt(process.env.PORT || '3003', 10);

interface SSESession {
  id: string;
  res: http.ServerResponse;
}

const sessions = new Map<string, SSESession>();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url || '', true);
  const path = parsed.pathname || '';

  // GET /health
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-mcp' }));
    return;
  }

  // GET /sse — SSE transport endpoint
  if (req.method === 'GET' && path === '/sse') {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send endpoint event with session ID
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

    sessions.set(sessionId, { id: sessionId, res });

    // Keep alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sessions.delete(sessionId);
    });

    return;
  }

  // POST /messages — receive JSON-RPC messages
  if (req.method === 'POST' && path === '/messages') {
    const sessionId = parsed.query.sessionId as string;
    const session = sessions.get(sessionId);

    let body = '';
    for await (const chunk of req) body += chunk;

    let msg: any;
    try { msg = JSON.parse(body); } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Handle JSON-RPC methods
    if (msg.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-mcp', version: '1.0.0' },
        },
      };
      if (session) {
        session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }
      res.writeHead(202);
      res.end();
      return;
    }

    if (msg.method === 'notifications/initialized') {
      res.writeHead(202);
      res.end();
      return;
    }

    if (msg.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'echo',
              description: 'Echo back the input arguments',
              inputSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'Message to echo' },
                },
                required: ['message'],
              },
            },
          ],
        },
      };
      // Send response via SSE
      if (session) {
        session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted' }));
      return;
    }

    if (msg.method === 'tools/call') {
      const toolName = msg.params?.name;
      const args = msg.params?.arguments || {};

      let result: any;
      if (toolName === 'echo') {
        result = { content: [{ type: 'text', text: `Echo: ${args.message || '(no message)'}` }] };
      } else {
        result = { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }

      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result,
      };

      if (session) {
        session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted' }));
      return;
    }

    res.writeHead(400);
    res.end(JSON.stringify({ error: `Unknown method: ${msg.method}` }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock MCP server listening on http://0.0.0.0:${PORT}`);
});

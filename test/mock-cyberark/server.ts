/**
 * Mock CyberArk Conjur API — implements the Conjur REST API spec.
 *
 * Auth:   POST /api/authn/{account}/{login}/authenticate
 *           Body: raw API key, Response: base64 token
 * Secret: GET  /api/secrets/{account}/variable/{identifier}
 *           Authorization: Token token="<token>"
 *           Response: raw secret value (text/plain)
 */

import http from 'http';
import crypto from 'crypto';

const PORT = 3005;

// ── Pre-configured users (login → apiKey) ──────────────────────────
const USERS: Record<string, { apiKey: string; hostId: string }> = {
  'admin':          { apiKey: 'admin-api-key-123',       hostId: 'admin' },
  'host%2Fmyapp':   { apiKey: 'myapp-api-key-456',       hostId: 'myapp' },
  'host%2Fci-user': { apiKey: 'ci-api-key-789',          hostId: 'ci-user' },
};

// ── Pre-configured secrets (variable path → value) ─────────────────
const SECRETS: Record<string, string> = {
  'prod/db/password':       'sup3r-s3cr3t-db-pass!',
  'prod/api/key':           'sk-prod-abc123def456',
  'staging/api/key':        'sk-staging-xyz789',
  'common/tls/cert':        '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
};

// ── Issued tokens (token → { account, login }) ─────────────────────
const validTokens = new Map<string, { account: string; login: string }>();
let tokenCounter = 0;

function issueToken(account: string, login: string): string {
  const token = Buffer.from(
    JSON.stringify({ iat: Date.now(), sub: `${account}:${login}`, tid: ++tokenCounter })
  ).toString('base64');
  validTokens.set(token, { account, login });
  return token;
}

// ── Helpers ────────────────────────────────────────────────────────
function parsePath(url: string): { path: string; rest: string } {
  const idx = url.indexOf('?');
  return {
    path: idx >= 0 ? url.slice(0, idx) : url,
    rest: idx >= 0 ? url.slice(idx) : '',
  };
}

const server = http.createServer(async (req, res) => {
  const fullUrl = req.url || '/';
  const method = req.method || 'GET';
  const { path } = parsePath(fullUrl);

  const json = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  };

  const text = (status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  };

  // ── Auth endpoint ──────────────────────────────────────────────
  // POST /api/authn/{account}/{login}/authenticate
  //
  // Path params: account, login (URL-encoded, e.g. host%2Fmyapp)
  // Body: raw API key (text/plain)
  // Response: base64 access token (text/plain)
  const authMatch = path.match(/^\/api\/authn\/([^/]+)\/([^/]+)\/authenticate$/);
  if (method === 'POST' && authMatch) {
    const account = decodeURIComponent(authMatch[1]);
    const login = authMatch[2]; // keep URL-encoded form
    const decodedLogin = decodeURIComponent(login);

    // Read raw body (the API key)
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const apiKey = Buffer.concat(chunks).toString('utf-8');

    // Verify credentials — match by raw or URL-encoded login
    const user = USERS[login] || USERS[decodedLogin];
    if (!user || user.apiKey !== apiKey) {
      text(401, 'Unauthorized');
      return;
    }

    const token = issueToken(account, login);
    text(200, token);
    return;
  }

  // ── Self-hosted auth (no /api prefix) ─────────────────────────
  // POST /authn/{account}/{login}/authenticate
  const shAuthMatch = path.match(/^\/authn\/([^/]+)\/([^/]+)\/authenticate$/);
  if (method === 'POST' && shAuthMatch) {
    const account = decodeURIComponent(shAuthMatch[1]);
    const login = shAuthMatch[2];

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const apiKey = Buffer.concat(chunks).toString('utf-8');

    const user = USERS[login];
    if (!user || user.apiKey !== apiKey) {
      text(401, 'Unauthorized');
      return;
    }

    const token = issueToken(account, login);
    text(200, token);
    return;
  }

  // ── Secret retrieval ──────────────────────────────────────────
  // GET /api/secrets/{account}/variable/{identifier}
  //
  // Authorization: Token token="<base64-token>"
  // Response: raw secret value (text/plain)
  const secretMatch = path.match(/^\/api\/secrets\/([^/]+)\/variable\/(.+)$/);
  if (method === 'GET' && secretMatch) {
    const account = decodeURIComponent(secretMatch[1]);
    const variableId = decodeURIComponent(secretMatch[2]);

    // Validate token
    const auth = req.headers['authorization'] || '';
    const tokenMatch = auth.match(/^Token token="(.+)"$/);
    if (!tokenMatch) {
      text(401, 'Unauthorized');
      return;
    }
    const token = tokenMatch[1];
    const tokenData = validTokens.get(token);
    if (!tokenData) {
      text(401, 'Unauthorized');
      return;
    }

    // Check token age (8 min TTL per spec)
    let tokenAge = Infinity;
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      tokenAge = Date.now() - (decoded.iat || 0);
    } catch {}
    if (tokenAge > 8 * 60 * 1000) {
      validTokens.delete(token);
      text(401, 'Token expired');
      return;
    }

    const value = SECRETS[variableId];
    if (value === undefined) {
      text(404, `Secret '${variableId}' not found`);
      return;
    }

    text(200, value);
    return;
  }

  // ── Self-hosted secret retrieval (no /api prefix) ─────────────
  const shSecretMatch = path.match(/^\/secrets\/([^/]+)\/variable\/(.+)$/);
  if (method === 'GET' && shSecretMatch) {
    const account = decodeURIComponent(shSecretMatch[1]);
    const variableId = decodeURIComponent(shSecretMatch[2]);

    const auth = req.headers['authorization'] || '';
    const tokenMatch = auth.match(/^Token token="(.+)"$/);
    if (!tokenMatch) {
      text(401, 'Unauthorized');
      return;
    }

    const value = SECRETS[variableId];
    if (value === undefined) {
      text(404, `Secret '${variableId}' not found`);
      return;
    }

    text(200, value);
    return;
  }

  json(404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`Mock Conjur API listening on http://0.0.0.0:${PORT}`);
});

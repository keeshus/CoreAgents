/**
 * Mock CyberArk API — implements the token and secret endpoints
 * that the real CyberArk Conjur/REST API would serve.
 *
 * Simulates:
 *   POST /oauth2/token  — client credentials → access_token
 *   GET  /secrets/:path — fetch a stored secret
 */

import http from 'http';
import crypto from 'crypto';

const PORT = 3005;

const STORE = new Map<string, string>();
STORE.set('db-password', 'sup3r-s3cr3t-db-pass!');
STORE.set('api-key-prod', 'sk-prod-abc123def456');
STORE.set('api-key-staging', 'sk-staging-xyz789');

const CLIENTS = new Map<string, string>();
CLIENTS.set('core-agents', 'e2e-test-secret');

let tokenCounter = 0;
function issueToken(): string {
  return `mock-cyberark-token-${++tokenCounter}-${Date.now()}`;
}

const validTokens = new Set<string>();

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const path = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;

  const json = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  };

  // ── Token endpoint ───────────────────────────────────────────────
  // POST /oauth2/token  (form-encoded body: grant_type, client_id, client_secret)
  if (method === 'POST' && path === '/oauth2/token') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const form = Object.fromEntries(new URLSearchParams(body));

    if (form.grant_type !== 'client_credentials') {
      json(400, { error: 'unsupported_grant_type' });
      return;
    }

    const expectedSecret = CLIENTS.get(form.client_id);
    if (!expectedSecret || expectedSecret !== form.client_secret) {
      json(401, { error: 'invalid_client' });
      return;
    }

    const accessToken = issueToken();
    validTokens.add(accessToken);
    json(200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
    return;
  }

  // ── Secret retrieval ─────────────────────────────────────────────
  // GET /secrets/:path  (Bearer token in Authorization header)
  const secretMatch = path.match(/^\/secrets\/(.+)$/);
  if (method === 'GET' && secretMatch) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!validTokens.has(token)) {
      json(401, { error: 'unauthorized' });
      return;
    }

    const secretPath = decodeURIComponent(secretMatch[1]);
    const value = STORE.get(secretPath);
    if (value === undefined) {
      json(404, { error: `Secret '${secretPath}' not found` });
      return;
    }

    // Touch the token to prevent expiry during test
    json(200, { value });
    return;
  }

  json(404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`Mock CyberArk API listening on port ${PORT}`);
});

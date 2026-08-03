import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = process.env.PLAYWRIGHT_AUTH_FILE
  ? resolve(process.cwd(), process.env.PLAYWRIGHT_AUTH_FILE)
  : resolve(__dirname, '../.auth/user.json');

/**
 * Path to the saved admin auth state (the user registered by the setup spec).
 * Use with `request.newContext({ storageState: getAdminAuthFile() })` whenever
 * a test needs admin privileges AFTER logging in as a non-admin user — the
 * shared `request` fixture picks up the last login's cookies, so admin-only
 * calls (e.g. DELETE /api/users/:id) would silently 403.
 */
export function getAdminAuthFile(): string {
  return AUTH_FILE;
}

/**
 * Read the auth token cookie from the saved storage state.
 * This avoids needing page.context which may not work in all environments.
 */
export function getAuthCookie(): string | null {
  try {
    const data = JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
    const token = data.cookies?.find((c: any) => c.name === 'token');
    return token ? `${token.name}=${token.value}` : null;
  } catch {
    return null;
  }
}

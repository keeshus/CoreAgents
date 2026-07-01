import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = resolve(__dirname, '../.auth/user.json');

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

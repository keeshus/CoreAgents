// The allowlist of env vars that are safe to pass to the sandbox
export const ALLOWLISTED_ENV_VARS = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'TMPDIR',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'GIT_CONFIG_GLOBAL',
  'GIT_SSH_COMMAND',
]);

// Pattern for user-injected env var names (alphanumeric + underscore, start with letter)
export const USER_ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

// Regex patterns for known secrets that should NEVER be passed to the sandbox
export const BLOCKED_ENV_PATTERNS = [
  /^DATABASE_URL$/i,
  /^.*SECRET.*$/i,
  /^.*API_KEY.*$/i,
  /^.*PASSWORD.*$/i,
  /^.*TOKEN.*$/i,
  /^JWT_SECRET$/i,
  /^ENCRYPTION_KEY$/i,
  /^VALKEY.*$/i,
  /^REDIS.*$/i,
  /^QDRANT.*$/i,
  /^SESSION_SECRET$/i,
  /^NODE_ENV$/i,
];

// App-level secrets that should NEVER be passed (also blocked by pattern above but explicit)
export const BLOCKED_ENV_NAMES = new Set([
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'SESSION_SECRET',
  'NODE_ENV',
  'VALKEY_HOST',
  'VALKEY_PASSWORD',
  'VALKEY_TLS',
  'REDIS_URL',
  'QDRANT_URL',
  'QDRANT_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LITELLM_API_KEY',
]);

/**
 * Sanitize an env var map — keep only safe vars.
 * - Keeps allowlisted vars
 * - Keeps user-injected vars that match the pattern and are NOT in the blocked list
 * - Strips everything else
 */
export function sanitizeEnvVars(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Always keep allowlisted vars
    if (ALLOWLISTED_ENV_VARS.has(key)) {
      result[key] = value;
      continue;
    }

    // Skip blocked patterns
    if (BLOCKED_ENV_NAMES.has(key)) continue;
    if (BLOCKED_ENV_PATTERNS.some(p => p.test(key))) continue;

    // Only pass user-injected vars that match the safe pattern
    if (USER_ENV_VAR_PATTERN.test(key)) {
      result[key] = value;
    }
  }

  return result;
}

// Keys that must never be merged from untrusted parsed JSON (prototype pollution)
const UNSAFE_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strip prototype-polluting keys (`__proto__`, `constructor`, `prototype`)
 * from untrusted parsed JSON before merging it into internal objects.
 * Mutates in place; leaves non-plain objects (class instances, Maps, ...) untouched.
 */
export function sanitizeUntrustedKeys<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = sanitizeUntrustedKeys(value[i]);
    }
    return value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNSAFE_MERGE_KEYS.has(key)) {
      delete record[key];
      continue;
    }
    record[key] = sanitizeUntrustedKeys(record[key]);
  }
  return value;
}

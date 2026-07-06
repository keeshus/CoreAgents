import { describe, it, expect } from 'vitest';
import {
  sanitizeEnvVars,
  ALLOWLISTED_ENV_VARS,
  BLOCKED_ENV_NAMES,
  BLOCKED_ENV_PATTERNS,
  USER_ENV_VAR_PATTERN,
} from '../tools/sanitize.js';

describe('sanitizeEnvVars', () => {
  it('passes through allowlisted vars', () => {
    const result = sanitizeEnvVars({ PATH: '/usr/bin', HOME: '/root', USER: 'kees' });
    expect(result).toEqual({ PATH: '/usr/bin', HOME: '/root', USER: 'kees' });
  });

  it('passes through user-injected vars matching the safe pattern', () => {
    const result = sanitizeEnvVars({
      MY_CUSTOM_VAR: 'safe-value',
      CI_JOB_ID: '42',
      BUILD_TAG: 'v1.0',
    });
    expect(result).toEqual({
      MY_CUSTOM_VAR: 'safe-value',
      CI_JOB_ID: '42',
      BUILD_TAG: 'v1.0',
    });
  });

  it('strips blocked vars by exact name (DATABASE_URL)', () => {
    const result = sanitizeEnvVars({ DATABASE_URL: 'postgres://localhost' });
    expect(result).toEqual({});
  });

  it('strips blocked vars by pattern (JWT_SECRET)', () => {
    const result = sanitizeEnvVars({ JWT_SECRET: 's3cret' });
    expect(result).toEqual({});
  });

  it('strips blocked vars by pattern (API_KEY)', () => {
    const result = sanitizeEnvVars({ SOME_API_KEY: 'abc123' });
    expect(result).toEqual({});
  });

  it('strips vars with special characters', () => {
    const result = sanitizeEnvVars({ 'MY-VAR': 'value', 'VAR$NAME': 'bad' });
    expect(result).toEqual({});
  });

  it('returns empty object for empty env map', () => {
    const result = sanitizeEnvVars({});
    expect(result).toEqual({});
  });

  it('passes through only allowed vars in a mixed map', () => {
    const result = sanitizeEnvVars({
      PATH: '/usr/bin',
      HOME: '/root',
      DATABASE_URL: 'postgres://localhost',
      JWT_SECRET: 's3cret',
      MY_CUSTOM_VAR: 'safe',
      GH_TOKEN: 'ghp_xxx',
    });
    expect(result).toEqual({
      PATH: '/usr/bin',
      HOME: '/root',
      MY_CUSTOM_VAR: 'safe',
    });
  });

  it('passes through SSH_PRIVATE_KEY when it matches the user-injected pattern (not blocked)', () => {
    const result = sanitizeEnvVars({ SSH_PRIVATE_KEY: 'ssh-rsa AAA...' });
    expect(result).toEqual({ SSH_PRIVATE_KEY: 'ssh-rsa AAA...' });
  });

  it('keeps all allowlisted vars', () => {
    const allowlisted: Record<string, string> = {};
    for (const name of ALLOWLISTED_ENV_VARS) {
      allowlisted[name] = `value-${name}`;
    }
    const result = sanitizeEnvVars(allowlisted);
    expect(Object.keys(result).sort()).toEqual([...ALLOWLISTED_ENV_VARS].sort());
  });

  it('blocks vars matching BLOCKED_ENV_NAMES exactly', () => {
    const blocked: Record<string, string> = {};
    for (const name of BLOCKED_ENV_NAMES) {
      blocked[name] = `secret-${name}`;
    }
    const result = sanitizeEnvVars(blocked);
    for (const name of BLOCKED_ENV_NAMES) {
      expect(result).not.toHaveProperty(name);
    }
  });

  it('blocks vars matching BLOCKED_ENV_PATTERNS', () => {
    const patterns = BLOCKED_ENV_PATTERNS;
    const result = sanitizeEnvVars({
      MY_SECRET_KEY: 'abc',
      DATABASE_URL: 'db',
      super_secret: 'x',
      REDIS_HOST: 'x',
      VALKEY_PORT: 'x',
      QDRANT_URL: 'x',
      SESSION_SECRET: 'x',
      NODE_ENV: 'production',
    });
    expect(result).toEqual({});
  });
});

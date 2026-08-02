import { describe, it, expect, vi } from 'vitest';
import { resolveTemplateSync, resolveTemplate } from '../executor/engine.js';

describe('resolveTemplateSync', () => {
  it('resolves {{input.var}} from data', () => {
    const result = resolveTemplateSync('Hello {{input.name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('resolves nested paths like {{input.obj.key}}', () => {
    const result = resolveTemplateSync('{{input.user.profile.name}}', { user: { profile: { name: 'Alice' } } });
    expect(result).toBe('Alice');
  });

  it('resolves {{secrets.core.name}} via lookupSecret', () => {
    const lookup = vi.fn((name: string) => name === 'api_key' ? 'sk-123' : null);
    const result = resolveTemplateSync('Bearer {{secrets.core.api_key}}', {}, lookup);
    expect(result).toBe('Bearer sk-123');
    expect(lookup).toHaveBeenCalledWith('api_key', undefined);
  });

  it('returns empty string for unresolved {{secrets.core.xxx}}', () => {
    const lookup = vi.fn(() => null);
    const result = resolveTemplateSync('{{secrets.core.missing}}', {}, lookup);
    expect(result).toBe('');
  });

  it('handles missing input variables (returns empty string)', () => {
    const result = resolveTemplateSync('{{input.missing}}', {});
    expect(result).toBe('');
  });

  it('handles empty string input', () => {
    expect(resolveTemplateSync('', {})).toBe('');
  });

  it('handles no template markers', () => {
    expect(resolveTemplateSync('plain text', {})).toBe('plain text');
  });

  it('resolves array index via bracket notation', () => {
    const data = { items: [{ name: 'first' }, { name: 'second' }] };
    const result = resolveTemplateSync('{{input.items[0].name}}', data);
    expect(result).toBe('first');
  });

  it('resolves multiple variables in one template', () => {
    const data = { a: 'Hello', b: 'World' };
    const result = resolveTemplateSync('{{input.a}} {{input.b}}', data);
    expect(result).toBe('Hello World');
  });

  it('returns JSON string for object values', () => {
    const data = { obj: { x: 1, y: 2 } };
    const result = resolveTemplateSync('{{input.obj}}', data);
    expect(result).toBe(JSON.stringify({ x: 1, y: 2 }));
  });

  it('resolves {{secrets.core.group:name}} with group scope', () => {
    const lookup = vi.fn((_name: string, scope?: 'app' | 'group' | 'flow') => {
      return scope === 'group' ? 'group-val' : null;
    });
    const result = resolveTemplateSync('{{secrets.core.group:my_secret}}', {}, lookup);
    expect(result).toBe('group-val');
    expect(lookup).toHaveBeenCalledWith('my_secret', 'group');
  });

  it('resolves {{secrets.core.app:name}} with app scope', () => {
    const lookup = vi.fn((_name: string, scope?: 'app' | 'group' | 'flow') => {
      return scope === 'app' ? 'app-val' : null;
    });
    const result = resolveTemplateSync('{{secrets.core.app:my_secret}}', {}, lookup);
    expect(result).toBe('app-val');
    expect(lookup).toHaveBeenCalledWith('my_secret', 'app');
  });
});

describe('resolveTemplate', () => {
  it('resolves {{input.var}} from data', async () => {
    const result = await resolveTemplate('Hello {{input.name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('resolves nested paths', async () => {
    const result = await resolveTemplate('{{input.user.name}}', { user: { name: 'Alice' } });
    expect(result).toBe('Alice');
  });

  it('resolves {{env.VAR_NAME}} using context.sandboxEnv', async () => {
    const context = { sandboxEnv: { MY_VAR: 'env-value' } } as any;
    const result = await resolveTemplate('{{env.MY_VAR}}', {}, context);
    expect(result).toBe('env-value');
  });

  it('returns empty string for missing env var', async () => {
    const context = { sandboxEnv: {} } as any;
    const result = await resolveTemplate('{{env.MISSING}}', {}, context);
    expect(result).toBe('');
  });

  it('resolves {{secrets.core.name}} via context.getSecret', async () => {
    const getSecret = vi.fn().mockResolvedValue('sk-123');
    const context = { getSecret } as any;
    const result = await resolveTemplate('{{secrets.core.api_key}}', {}, context);
    expect(result).toBe('sk-123');
    expect(getSecret).toHaveBeenCalledWith('api_key', undefined);
  });

  it('returns empty string for unresolved secret', async () => {
    const getSecret = vi.fn().mockResolvedValue(null);
    const context = { getSecret } as any;
    const result = await resolveTemplate('{{secrets.core.missing}}', {}, context);
    expect(result).toBe('');
  });

  it('resolves {{secrets.cyberark.PATH}} via context.getCyberArkSecret', async () => {
    const getCyberArkSecret = vi.fn().mockResolvedValue('cyberark-value');
    const context = { getCyberArkSecret } as any;
    const result = await resolveTemplate('{{secrets.cyberark.some/path}}', {}, context);
    expect(result).toBe('cyberark-value');
    expect(getCyberArkSecret).toHaveBeenCalledWith('some/path');
  });

  it('returns empty string for unresolved cyberark secret', async () => {
    const getCyberArkSecret = vi.fn().mockResolvedValue(null);
    const context = { getCyberArkSecret } as any;
    const result = await resolveTemplate('{{secrets.cyberark.missing/path}}', {}, context);
    expect(result).toBe('');
  });

  it('handles no context (undefined)', async () => {
    const result = await resolveTemplate('Hello {{input.name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('handles empty string', async () => {
    const result = await resolveTemplate('', {});
    expect(result).toBe('');
  });

  it('handles no template markers', async () => {
    const result = await resolveTemplate('plain text', {});
    expect(result).toBe('plain text');
  });

  it('resolves multiple variable types in one template', async () => {
    const getSecret = vi.fn().mockResolvedValue('sk-456');
    const context = {
      getSecret,
      sandboxEnv: { DB_HOST: 'localhost' },
    } as any;
    const result = await resolveTemplate(
      '{{env.DB_HOST}}:{{secrets.core.api_key}}:{{input.name}}',
      { name: 'test' },
      context,
    );
    expect(result).toBe('localhost:sk-456:test');
  });
});

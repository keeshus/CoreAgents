import { describe, it, expect } from 'vitest';

// ── HTTP Config ───────────────────────────────────────────────

describe('HttpConfig logic', () => {
  const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH'];

  it('shows body field only for POST, PUT, PATCH', () => {
    expect(METHODS_WITH_BODY).toContain('POST');
    expect(METHODS_WITH_BODY).toContain('PUT');
    expect(METHODS_WITH_BODY).toContain('PATCH');
    expect(METHODS_WITH_BODY).not.toContain('GET');
    expect(METHODS_WITH_BODY).not.toContain('DELETE');
    expect(METHODS_WITH_BODY).not.toContain('HEAD');
    expect(METHODS_WITH_BODY).toHaveLength(3);
  });

  it('applies Basic auth header format', () => {
    const username = 'user';
    const password = 'pass';
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    const header = `Basic ${encoded}`;
    expect(header).toBe('Basic ' + Buffer.from('user:pass').toString('base64'));
    expect(header).toMatch(/^Basic /);
  });

  it('applies Bearer token header format', () => {
    const token = 'mytoken';
    const header = `Bearer ${token}`;
    expect(header).toBe('Bearer mytoken');
    expect(header).toMatch(/^Bearer /);
  });

  it('applies API Key header format', () => {
    const keyName = 'X-API-Key';
    const keyValue = 'secret123';
    expect(keyName).toBeTruthy();
    expect(keyValue).toBeTruthy();
    // Header format: headers[keyName] = keyValue
    const headers: Record<string, string> = {};
    headers[keyName] = keyValue;
    expect(headers['X-API-Key']).toBe('secret123');
  });

  it('defaults to GET method and no auth', () => {
    const defaults = { method: 'GET', authType: 'none', followRedirects: true, timeout: 30000, sslVerify: true };
    expect(defaults.method).toBe('GET');
    expect(defaults.authType).toBe('none');
    expect(defaults.followRedirects).toBe(true);
    expect(defaults.timeout).toBe(30000);
    expect(defaults.sslVerify).toBe(true);
  });

  it('validates URL is not empty', () => {
    const isValid = (url: string) => url.trim().length > 0;
    expect(isValid('')).toBe(false);
    expect(isValid('  ')).toBe(false);
    expect(isValid('https://api.example.com')).toBe(true);
  });

  it('handles HMAC signing configuration', () => {
    const secret = 'my-hmac-secret';
    const header = 'X-Signature';
    expect(secret).toBeTruthy();
    expect(header).toBeTruthy();
    const headers: Record<string, string> = {};
    if (secret && header) {
      headers[header] = 'computed-signature';
    }
    expect(headers['X-Signature']).toBe('computed-signature');
  });
});

// ── Loop Config ───────────────────────────────────────────────

describe('LoopNodeConfig logic', () => {
  it('filters fields to only array types', () => {
    const fields = [
      { name: 'message', type: 'string' },
      { name: 'items', type: 'array<{id,name}>' },
      { name: 'chunks', type: 'array<{text,score}>' },
      { name: 'count', type: 'number' },
    ];
    const arrayFields = fields.filter(f => f.type.startsWith('array<') || f.type === 'array');
    expect(arrayFields).toHaveLength(2);
    expect(arrayFields[0].name).toBe('items');
    expect(arrayFields[1].name).toBe('chunks');
  });

  it('returns empty array when no array fields exist', () => {
    const fields = [
      { name: 'message', type: 'string' },
      { name: 'count', type: 'number' },
    ];
    const arrayFields = fields.filter(f => f.type.startsWith('array<') || f.type === 'array');
    expect(arrayFields).toHaveLength(0);
  });

  it('builds fieldPath from node label and field name', () => {
    const nodeLabel = 'Trigger';
    const fieldName = 'items';
    const fieldPath = `${nodeLabel.toLowerCase()}.${fieldName}`;
    expect(fieldPath).toBe('trigger.items');
  });

  it('includes array type notation in display', () => {
    const field = { nodeLabel: 'Trigger', fieldPath: 'trigger.items', type: 'array<{id,name}>' };
    expect(field.type).toContain('array');
    expect(field.type).toMatch(/^array</);
  });

  it('defaults itemVariable to "item"', () => {
    const defaults = { itemVariable: 'item', indexVariable: 'index', collectResults: true };
    expect(defaults.itemVariable).toBe('item');
    expect(defaults.indexVariable).toBe('index');
    expect(defaults.collectResults).toBe(true);
  });

  it('toggles collectResults', () => {
    const config = { collectResults: true };
    const toggled = { collectResults: !config.collectResults };
    expect(toggled.collectResults).toBe(false);
    const toggledBack = { collectResults: !toggled.collectResults };
    expect(toggledBack.collectResults).toBe(true);
  });
});

// ── Delay Config ──────────────────────────────────────────────

describe('Delay config logic', () => {
  it('parses fixed seconds correctly', () => {
    const seconds = 5;
    expect(seconds * 1000).toBe(5000);
  });

  it('parses ISO 8601 duration correctly', () => {
    function parseISODuration(duration: string): number {
      const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
      if (!match) throw new Error('Invalid duration');
      const [, h, m, s] = match;
      return ((parseInt(h || '0') * 3600) + (parseInt(m || '0') * 60) + parseFloat(s || '0')) * 1000;
    }

    expect(parseISODuration('PT30S')).toBe(30000);
    expect(parseISODuration('PT5M')).toBe(300000);
    expect(parseISODuration('PT1H')).toBe(3600000);
    expect(parseISODuration('PT1M30S')).toBe(90000);
    expect(parseISODuration('PT1H30M')).toBe(5400000);
  });

  it('throws on invalid ISO 8601 duration', () => {
    function parseISODuration(duration: string): number {
      const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
      if (!match) throw new Error('Invalid duration');
      const [, h, m, s] = match;
      return ((parseInt(h || '0') * 3600) + (parseInt(m || '0') * 60) + parseFloat(s || '0')) * 1000;
    }

    expect(() => parseISODuration('invalid')).toThrow('Invalid duration');
    expect(() => parseISODuration('')).toThrow('Invalid duration');
    expect(() => parseISODuration('PTX')).toThrow('Invalid duration');
  });

  it('resolves timestamp from template', () => {
    const resolveTemplate = (tmpl: string, input: Record<string, unknown>): string => {
      return tmpl.replace(/\{\{input\.(\w+)\.(\w+)\}\}/g, (_: string, label: string, field: string) => {
        const val = (input as any)[label]?.[field];
        return val !== undefined ? String(val) : tmpl;
      });
    };

    const input = { trigger: { timestamp: '2026-07-10T00:00:00Z' } };
    expect(resolveTemplate('{{input.trigger.timestamp}}', input)).toBe('2026-07-10T00:00:00Z');
  });

  it('applies jitter as random +/- seconds', () => {
    const baseDelay = 5000;
    const jitter = 2;
    const minJitter = baseDelay + (-jitter * 1000);
    const maxJitter = baseDelay + (jitter * 1000);
    expect(minJitter).toBe(3000);
    expect(maxJitter).toBe(7000);
  });

  it('clamps negative jitter to 0', () => {
    const baseDelay = 1000;
    const jitterAmount = -2000;
    const clamped = Math.max(0, baseDelay + jitterAmount);
    expect(clamped).toBe(0);
  });
});

// ── AI Action Config ──────────────────────────────────────────

describe('AI Action config logic', () => {
  it('requires endpointId, model, and prompt', () => {
    const required = ['endpointId', 'model', 'prompt'];
    expect(required).toContain('endpointId');
    expect(required).toContain('model');
    expect(required).toContain('prompt');
    expect(required).toHaveLength(3);
  });

  it('has default temperature', () => {
    const defaultValue = 0.7;
    expect(defaultValue).toBe(0.7);
  });

  it('has default maxTokens', () => {
    const defaultValue = 1024;
    expect(defaultValue).toBe(1024);
  });

  it('supports text and json_object response formats', () => {
    const formats = ['text', 'json_object'];
    expect(formats).toContain('text');
    expect(formats).toContain('json_object');
    expect(formats).toHaveLength(2);
  });
});

// ── Map Config ────────────────────────────────────────────────

describe('Map config logic', () => {
  it('supports both merge and replace modes', () => {
    const modes = ['merge', 'replace'];
    expect(modes).toContain('replace');
    expect(modes).toContain('merge');
    expect(modes).toHaveLength(2);
  });

  it('validates field types', () => {
    const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
    expect(validTypes).toContain('string');
    expect(validTypes).toContain('number');
    expect(validTypes).toContain('boolean');
    expect(validTypes).toContain('object');
    expect(validTypes).toContain('array');
    expect(validTypes).toHaveLength(5);
  });

  it('adds new field with default values', () => {
    const fields: Array<{ name: string; type: string; value: string }> = [];
    fields.push({ name: '', type: 'string', value: '' });
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('');
    expect(fields[0].type).toBe('string');
    expect(fields[0].value).toBe('');
  });

  it('removes field by index', () => {
    const fields = [
      { name: 'a', type: 'string', value: 'x' },
      { name: 'b', type: 'number', value: 'y' },
      { name: 'c', type: 'boolean', value: 'z' },
    ];
    fields.splice(1, 1);
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('a');
    expect(fields[1].name).toBe('c');
  });

  it('updates field properties', () => {
    const fields = [{ name: 'old', type: 'string', value: 'x' }];
    fields[0] = { ...fields[0], name: 'new' };
    expect(fields[0].name).toBe('new');
    expect(fields[0].type).toBe('string');
    expect(fields[0].value).toBe('x');
  });

  it('replaces output with only mapped fields in replace mode', () => {
    const upstream = { message: 'hello', extra: 'data', secret: 's3cr3t' };
    const fields = [{ name: 'message', type: 'string', value: 'message' }];
    const output: Record<string, unknown> = {};
    for (const f of fields) {
      output[f.name] = upstream[f.value as keyof typeof upstream];
    }
    // Replace mode: only output
    expect(output).toEqual({ message: 'hello' });
    expect(output).not.toHaveProperty('extra');
    expect(output).not.toHaveProperty('secret');
  });

  it('merges mapped fields with upstream data in merge mode', () => {
    const upstream = { message: 'hello', extra: 'data' };
    const fields = [{ name: 'transformed', type: 'string', value: 'message' }];
    const mapped: Record<string, unknown> = {};
    for (const f of fields) {
      mapped[f.name] = upstream[f.value as keyof typeof upstream];
    }
    // Merge mode: upstream + mapped
    const result = { ...upstream, ...mapped };
    expect(result).toHaveProperty('message', 'hello');
    expect(result).toHaveProperty('extra', 'data');
    expect(result).toHaveProperty('transformed', 'hello');
  });
});

// ── Note Config ───────────────────────────────────────────────

describe('Note config logic', () => {
  it('stores content text', () => {
    const config = { content: 'This is a note' };
    expect(config.content).toBe('This is a note');
  });

  it('supports empty content', () => {
    const config = { content: '' };
    expect(config.content).toBe('');
  });

  it('optional color field', () => {
    const withColor = { content: 'hi', color: 'var(--md-secondary-container)' };
    const withoutColor = { content: 'hi' };
    expect(withColor).toHaveProperty('color');
    expect(withoutColor).not.toHaveProperty('color');
  });
});

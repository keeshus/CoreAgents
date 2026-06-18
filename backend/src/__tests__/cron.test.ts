import { describe, it, expect } from 'vitest';

// ── Helpers ─────────────────────────────────────────────────
// These mirror the schema parsing logic used by webhook.ts and scheduler-run.ts

/**
 * Parse an inputSchema JSON string into a field → type map.
 * Returns null when the string is empty, not valid JSON, or
 * does not represent a flat string→string object.
 */
function parseSchema(schema: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(schema);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    for (const value of Object.values(parsed)) {
      if (typeof value !== 'string') return null;
    }
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * Validate a body against a field→type schema.
 * Returns an array of error messages (empty = valid).
 */
function validateInput(
  body: Record<string, unknown>,
  schema: Record<string, string>,
): string[] {
  const errors: string[] = [];

  for (const [field, expectedType] of Object.entries(schema)) {
    const value = body[field];

    if (value === undefined || value === null) {
      errors.push(`Missing required field: "${field}" (expected ${expectedType})`);
      continue;
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      errors.push(`Field "${field}": expected ${expectedType}, got ${actualType}`);
    }
  }

  return errors;
}

/**
 * Parse a inputMessage JSON string, merging with a default payload.
 * Returns the merged input object.
 */
function parseScheduleInput(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) {
    return { triggerType: 'schedule', timestamp: expect.any(String) };
  }
  try {
    const parsed = JSON.parse(raw);
    return { triggerType: 'schedule', timestamp: expect.any(String), ...parsed };
  } catch {
    return { triggerType: 'schedule', timestamp: expect.any(String), message: raw };
  }
}

// ── Schema parsing tests ─────────────────────────────────────

describe('parseSchema (JSON input schema parser)', () => {
  it('parses a simple field→type schema correctly', () => {
    const schema = '{"message":"string","count":"number"}';
    const result = parseSchema(schema);

    expect(result).not.toBeNull();
    expect(result).toEqual({ message: 'string', count: 'number' });
  });

  it('parses a schema with additional field types', () => {
    const schema = '{"name":"string","age":"number","active":"boolean","tags":"array","meta":"object"}';
    const result = parseSchema(schema);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('string');
    expect(result!.age).toBe('number');
    expect(result!.active).toBe('boolean');
    expect(result!.tags).toBe('array');
    expect(result!.meta).toBe('object');
  });

  it('returns an empty object for an empty JSON object', () => {
    const result = parseSchema('{}');

    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it('returns null for an empty string', () => {
    expect(parseSchema('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseSchema('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSchema('not-json')).toBeNull();
    expect(parseSchema('{invalid}')).toBeNull();
    expect(parseSchema('{"unclosed": "object"')).toBeNull();
  });

  it('returns null for JSON that is not a plain object', () => {
    expect(parseSchema('"just-a-string"')).toBeNull();
    expect(parseSchema('42')).toBeNull();
    expect(parseSchema('["a", "b"]')).toBeNull();
    expect(parseSchema('true')).toBeNull();
  });

  it('returns null when a value is not a string', () => {
    expect(parseSchema('{"count": 5}')).toBeNull();
    expect(parseSchema('{"items": ["a"]}')).toBeNull();
    expect(parseSchema('{"active": true}')).toBeNull();
  });
});

// ── Input validation tests ───────────────────────────────────

describe('validateInput (field→type validation)', () => {
  it('passes when all required fields match their expected types', () => {
    const schema = { message: 'string', count: 'number' };
    const body = { message: 'hello', count: 42 };

    const errors = validateInput(body, schema);
    expect(errors).toHaveLength(0);
  });

  it('reports missing required fields', () => {
    const schema = { message: 'string', count: 'number' };
    const body = { message: 'hello' };

    const errors = validateInput(body, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"count"');
    expect(errors[0]).toContain('Missing required field');
  });

  it('reports type mismatches', () => {
    const schema = { message: 'string', count: 'number' };
    const body = { message: 'hello', count: 'not-a-number' };

    const errors = validateInput(body, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('count');
    expect(errors[0]).toContain('expected number');
    expect(errors[0]).toContain('got string');
  });

  it('reports multiple validation errors at once', () => {
    const schema = { a: 'string', b: 'number', c: 'boolean' };
    const body = { a: 123, c: 'yes' };

    const errors = validateInput(body, schema);
    // 'a' has wrong type, 'b' is missing, 'c' has wrong type
    expect(errors).toHaveLength(3);
  });

  it('passes with extra fields not in schema', () => {
    const schema = { name: 'string' };
    const body = { name: 'Alice', age: 30, extra: 'ignored' };

    const errors = validateInput(body, schema);
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for an empty schema regardless of body', () => {
    expect(validateInput({}, {})).toHaveLength(0);
    expect(validateInput({ anything: 'goes' }, {})).toHaveLength(0);
  });

  it('handles null values as missing', () => {
    const schema = { name: 'string' };
    const body = { name: null };

    const errors = validateInput(body, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Missing required field');
  });

  it('validates array type correctly', () => {
    const schema = { tags: 'array' };
    expect(validateInput({ tags: ['a', 'b'] }, schema)).toHaveLength(0);
    expect(validateInput({ tags: 'not-array' }, schema)).toHaveLength(1);
  });
});

// ── inputMessage parsing tests ──────────────────────────────

describe('parseScheduleInput (schedule payload parser)', () => {
  it('returns default payload when inputMessage is empty', () => {
    const result = parseScheduleInput(undefined);
    expect(result.triggerType).toBe('schedule');
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('returns default payload when inputMessage is whitespace', () => {
    const result = parseScheduleInput('   ');
    expect(result.triggerType).toBe('schedule');
  });

  it('merges parsed JSON with default payload', () => {
    const result = parseScheduleInput('{"message":"hello","count":5}');
    expect(result.triggerType).toBe('schedule');
    expect(result.message).toBe('hello');
    expect(result.count).toBe(5);
  });

  it('wraps non-JSON inputMessage as a message field', () => {
    const result = parseScheduleInput('plain text input');
    expect(result.triggerType).toBe('schedule');
    expect(result.message).toBe('plain text input');
  });
});

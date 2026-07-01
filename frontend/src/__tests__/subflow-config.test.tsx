import { describe, it, expect } from 'vitest';

function parseSchema(schemaStr: string): { properties: Record<string, any>; required: string[] } {
  try {
    const schema = JSON.parse(schemaStr);
    return {
      properties: schema.properties || {},
      required: Array.isArray(schema.required) ? schema.required : [],
    };
  } catch {
    return { properties: {}, required: [] };
  }
}

function getSubflowInputSchema(subflow: any): { properties: Record<string, any>; required: string[]; inputMessage?: string } {
  const nodes = subflow.nodes || [];
  const triggerNode = nodes.find((n: any) => n.data?.type === 'trigger');
  if (!triggerNode) return { properties: {}, required: [] };
  const triggerConfig = triggerNode.data?.config || {};
  const schemaStr = triggerConfig.inputSchema || '';
  return { ...parseSchema(schemaStr), inputMessage: triggerConfig.inputMessage || '' };
}

describe('parseSchema', () => {
  it('parses a valid JSON schema with properties and required', () => {
    const result = parseSchema('{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"number"}},"required":["name"]}');
    expect(result.properties).toHaveProperty('name');
    expect(result.properties).toHaveProperty('age');
    expect(result.required).toEqual(['name']);
  });

  it('returns empty properties and required for empty schema', () => {
    const result = parseSchema('');
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });

  it('returns empty for invalid JSON', () => {
    const result = parseSchema('not-json');
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });

  it('handles schema with no required field', () => {
    const result = parseSchema('{"type":"object","properties":{"opt":{"type":"string"}}}');
    expect(result.properties).toHaveProperty('opt');
    expect(result.required).toEqual([]);
  });

  it('handles schema with no properties', () => {
    const result = parseSchema('{"type":"object"}');
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });
});

describe('getSubflowInputSchema', () => {
  it('extracts schema from subflow trigger node', () => {
    const sf = {
      nodes: [
        {
          data: {
            type: 'trigger',
            config: {
              triggerType: 'subflow',
              inputSchema: '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}',
              inputMessage: 'Enter your search query',
            },
          },
        },
      ],
    };
    const result = getSubflowInputSchema(sf);
    expect(result.properties).toHaveProperty('query');
    expect(result.required).toEqual(['query']);
    expect(result.inputMessage).toBe('Enter your search query');
  });

  it('returns empty when no trigger node exists', () => {
    const sf = { nodes: [] };
    const result = getSubflowInputSchema(sf);
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });

  it('returns empty when trigger is not a subflow trigger', () => {
    const sf = {
      nodes: [
        {
          data: {
            type: 'trigger',
            config: { triggerType: 'manual', inputSchema: '' },
          },
        },
      ],
    };
    const result = getSubflowInputSchema(sf);
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });

  it('returns empty when nodes is undefined', () => {
    const sf = {};
    const result = getSubflowInputSchema(sf);
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });

  it('returns inputMessage even when no schema is defined', () => {
    const sf = {
      nodes: [
        {
          data: {
            type: 'trigger',
            config: {
              triggerType: 'subflow',
              inputMessage: 'Just a simple text input',
            },
          },
        },
      ],
    };
    const result = getSubflowInputSchema(sf);
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
    expect(result.inputMessage).toBe('Just a simple text input');
  });
});

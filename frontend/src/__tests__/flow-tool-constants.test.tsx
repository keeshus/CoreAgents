import { describe, it, expect } from 'vitest';

const NODE_ICONS: Record<string, string> = {
  trigger: 'arrow_forward',
  'llm-agent': 'smart_toy',
  'mcp-tool': 'build',
  'flow-tool': 'integration_instructions',
  retriever: 'search',
  condition: 'call_split',
  code: 'code',
  parallel: 'view_column',
  hitl: 'schedule',
  output: 'check_circle',
  subflow: 'account_tree',
  http: 'http_post',
  loop: 'loop',
  delay: 'timer',
  'ai-action': 'auto_awesome',
  map: 'data_object',
  note: 'sticky_note_2',
};

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  'flow-tool': 'Flow Tool',
  retriever: 'Retriever',
  condition: 'Condition',
  code: 'Code',
  output: 'Output',
  parallel: 'Parallel Agents',
  hitl: 'Human in the Loop',
  subflow: 'Subflow',
  http: 'HTTP Request',
  loop: 'Loop',
  delay: 'Delay',
  'ai-action': 'AI Action',
  map: 'Map',
  note: 'Note',
};

describe('flow-tool NODE_ICONS', () => {
  it('includes flow-tool icon', () => {
    expect(NODE_ICONS).toHaveProperty('flow-tool');
    expect(NODE_ICONS['flow-tool']).toBe('integration_instructions');
  });

  it('has unique icons across all types', () => {
    const values = Object.values(NODE_ICONS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('flow-tool NODE_LABELS', () => {
  it('includes flow-tool label', () => {
    expect(NODE_LABELS).toHaveProperty('flow-tool');
    expect(NODE_LABELS['flow-tool']).toBe('Flow Tool');
  });

  it('includes http icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('http');
    expect(NODE_LABELS).toHaveProperty('http');
    expect(NODE_ICONS.http).toBe('http_post');
    expect(NODE_LABELS.http).toBe('HTTP Request');
  });

  it('includes loop icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('loop');
    expect(NODE_LABELS).toHaveProperty('loop');
    expect(NODE_ICONS.loop).toBe('loop');
    expect(NODE_LABELS.loop).toBe('Loop');
  });

  it('includes delay icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('delay');
    expect(NODE_LABELS).toHaveProperty('delay');
    expect(NODE_ICONS.delay).toBe('timer');
    expect(NODE_LABELS.delay).toBe('Delay');
  });

  it('includes ai-action icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('ai-action');
    expect(NODE_LABELS).toHaveProperty('ai-action');
    expect(NODE_ICONS['ai-action']).toBe('auto_awesome');
    expect(NODE_LABELS['ai-action']).toBe('AI Action');
  });

  it('includes map icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('map');
    expect(NODE_LABELS).toHaveProperty('map');
    expect(NODE_ICONS.map).toBe('data_object');
    expect(NODE_LABELS.map).toBe('Map');
  });

  it('includes note icon and label', () => {
    expect(NODE_ICONS).toHaveProperty('note');
    expect(NODE_LABELS).toHaveProperty('note');
    expect(NODE_ICONS.note).toBe('sticky_note_2');
    expect(NODE_LABELS.note).toBe('Note');
  });

  it('has labels for all icon types', () => {
    for (const key of Object.keys(NODE_ICONS)) {
      expect(NODE_LABELS).toHaveProperty(key);
    }
  });
});
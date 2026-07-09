import { describe, it, expect } from 'vitest';

const NODE_ICONS: Record<string, string> = {
  trigger: 'arrow_forward',
  'llm-agent': 'smart_toy',
  'mcp-tool': 'build',
  retriever: 'search',
  condition: 'call_split',
  code: 'code',
  parallel: 'view_column',
  hitl: 'schedule',
  output: 'check_circle',
  subflow: 'account_tree',
  switch: 'alt_route',
};

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  condition: 'Condition',
  code: 'Code',
  output: 'Output',
  parallel: 'Parallel',
  hitl: 'Human in the Loop',
  subflow: 'Subflow',
  switch: 'Switch',
};

describe('subflow NODE_ICONS', () => {
  it('includes subflow icon', () => {
    expect(NODE_ICONS).toHaveProperty('subflow');
    expect(NODE_ICONS.subflow).toBe('account_tree');
  });
});

describe('subflow NODE_LABELS', () => {
  it('includes subflow label', () => {
    expect(NODE_LABELS).toHaveProperty('subflow');
    expect(NODE_LABELS.subflow).toBe('Subflow');
  });
});

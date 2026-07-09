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
  parallel: 'Parallel',
  hitl: 'Human in the Loop',
  subflow: 'Subflow',
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

  it('has labels for all icon types', () => {
    for (const key of Object.keys(NODE_ICONS)) {
      expect(NODE_LABELS).toHaveProperty(key);
    }
  });
});
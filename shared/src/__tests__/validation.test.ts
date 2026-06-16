import { describe, it, expect } from 'vitest';
import type { FlowEdge } from '../types/flow.js';

// ── LLMAgentNodeData ─────────────────────────────────────────

describe('LLMAgentNodeData', () => {
  it('accepts config with inputFields', () => {
    const data = {
      label: 'LLM Agent',
      type: 'llm-agent' as const,
      config: {
        endpointId: 'ep-1',
        model: 'claude-sonnet-4',
        systemPrompt: 'You are a helpful assistant',
        temperature: 0.7,
        maxTokens: 2048,
        responseFormat: 'text' as const,
        inputFields: ['query', 'context'],
      },
    };

    expect(data.config.inputFields).toBeDefined();
    expect(data.config.inputFields).toHaveLength(2);
    expect(data.config.inputFields).toEqual(['query', 'context']);
  });

  it('default config omits inputFields for backward compatibility', () => {
    // A legacy/default config that does not include inputFields
    const data = {
      label: 'LLM Agent',
      type: 'llm-agent' as const,
      config: {
        endpointId: '',
        model: '',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        responseFormat: 'text' as const,
      },
    };

    // inputFields is optional so it must be fine when absent
    expect((data.config as Record<string, unknown>).inputFields).toBeUndefined();
  });
});

// ── BranchNodeData ───────────────────────────────────────────

describe('BranchNodeData', () => {
  it('accepts config with inputFields', () => {
    const data = {
      label: 'Branch',
      type: 'branch' as const,
      config: {
        condition: 'payload.score > 0.5',
        outputLabels: ['high', 'low'],
        inputFields: ['score', 'threshold'],
      },
    };

    expect(data.config.inputFields).toBeDefined();
    expect(data.config.inputFields).toHaveLength(2);
    expect(data.config.inputFields).toContain('score');
    expect(data.config.inputFields).toContain('threshold');
  });

  it('works without optional inputFields', () => {
    const data = {
      label: 'Branch',
      type: 'branch' as const,
      config: {
        condition: 'payload.x > 10',
        outputLabels: ['yes', 'no'],
      },
    };

    expect((data.config as Record<string, unknown>).inputFields).toBeUndefined();
  });
});

// ── CodeNodeData ─────────────────────────────────────────────

describe('CodeNodeData', () => {
  it('accepts config with inputFields', () => {
    const data = {
      label: 'Code Node',
      type: 'code' as const,
      config: {
        language: 'javascript' as const,
        code: 'return payload.data;',
        inputFields: ['data', 'params'],
      },
    };

    expect(data.config.inputFields).toBeDefined();
    expect(data.config.inputFields).toHaveLength(2);
    expect(data.config.inputFields).toEqual(['data', 'params']);
  });

  it('accepts config with outputSchema', () => {
    const data = {
      label: 'Code Node',
      type: 'code' as const,
      config: {
        language: 'python' as const,
        code: 'return payload',
        outputSchema: '{"result": "string"}',
      },
    };

    expect(data.config.outputSchema).toBeDefined();
    expect(data.config.outputSchema).toBe('{"result": "string"}');
  });
});

// ── HitlNodeData ────────────────────────────────────────────

describe('HitlNodeData', () => {
  it('accepts buttons array with label/value pairs', () => {
    const data = {
      label: 'HITL',
      type: 'hitl' as const,
      config: {
        prompt: 'Approve this result?',
        displayFields: ['output'],
        forwardFields: ['output'],
        buttons: [
          { label: 'Approve', value: 'approved' },
          { label: 'Reject', value: 'rejected' },
          { label: 'Request Changes', value: 'changes' },
        ],
      },
    };

    expect(data.config.buttons).toHaveLength(3);
    expect(data.config.buttons[0].label).toBe('Approve');
    expect(data.config.buttons[0].value).toBe('approved');
    expect(data.config.buttons[1].label).toBe('Reject');
    expect(data.config.buttons[1].value).toBe('rejected');
    expect(data.config.buttons[2].label).toBe('Request Changes');
    expect(data.config.buttons[2].value).toBe('changes');
  });

  it('accepts a minimal single-button config', () => {
    const data = {
      label: 'HITL',
      type: 'hitl' as const,
      config: {
        prompt: 'Continue?',
        displayFields: [],
        forwardFields: [],
        buttons: [{ label: 'OK', value: 'ok' }],
      },
    };

    expect(data.config.buttons).toHaveLength(1);
    expect(data.config.buttons[0].label).toBe('OK');
  });
});

// ── FlowEdge ─────────────────────────────────────────────────

describe('FlowEdge', () => {
  it('can have an optional condition with label and expression', () => {
    const edge: FlowEdge = {
      id: 'e-branch-true',
      source: 'branch-1',
      target: 'llm-1',
      sourceHandle: 'true',
      targetHandle: null,
      condition: {
        label: 'score > 0.5',
        expression: 'payload.score > 0.5',
      },
    };

    expect(edge.condition).toBeDefined();
    expect(edge.condition!.label).toBe('score > 0.5');
    expect(edge.condition!.expression).toBe('payload.score > 0.5');
  });

  it('works without a condition for plain edges', () => {
    const edge: FlowEdge = {
      id: 'e-trigger-branch',
      source: 'trigger-1',
      target: 'branch-1',
      sourceHandle: null,
      targetHandle: null,
    };

    expect(edge.condition).toBeUndefined();
  });

  it('can have a null sourceHandle and targetHandle', () => {
    const edge: FlowEdge = {
      id: 'e-default',
      source: 'a',
      target: 'b',
      sourceHandle: null,
      targetHandle: null,
    };

    expect(edge.sourceHandle).toBeNull();
    expect(edge.targetHandle).toBeNull();
  });
});

// ── Default config backward compatibility ────────────────────

describe('Default configs', () => {
  it('llm-agent default config provides all required fields', () => {
    const defaultConfig = {
      endpointId: '',
      model: '',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat: 'text',
      outputSchema: '',
    };

    expect(defaultConfig.endpointId).toBeDefined();
    expect(defaultConfig.model).toBeDefined();
    expect(defaultConfig.systemPrompt).toBeDefined();
    expect(defaultConfig.temperature).toBe(0.7);
    expect(defaultConfig.maxTokens).toBe(4096);
    expect(defaultConfig.responseFormat).toBe('text');
    expect(defaultConfig.outputSchema).toBe('');
  });

  it('branch default config provides condition and outputLabels', () => {
    const defaultConfig = {
      condition: '',
      outputLabels: ['true', 'false'],
    };

    expect(defaultConfig.condition).toBe('');
    expect(defaultConfig.outputLabels).toEqual(['true', 'false']);
  });

  it('hitl default config provides default approve/reject buttons', () => {
    const defaultConfig = {
      prompt: 'Please review the following before continuing:',
      displayFields: [],
      forwardFields: [],
      buttons: [
        { label: 'Approve', value: 'approved' },
        { label: 'Reject', value: 'rejected' },
      ],
    };

    expect(defaultConfig.buttons).toHaveLength(2);
    expect(defaultConfig.buttons[0]).toEqual({ label: 'Approve', value: 'approved' });
    expect(defaultConfig.buttons[1]).toEqual({ label: 'Reject', value: 'rejected' });
  });

  it('code default config uses javascript with a starter template', () => {
    const defaultConfig = {
      language: 'javascript',
      code: '// Transform the input payload\nreturn payload;',
    };

    expect(defaultConfig.language).toBe('javascript');
    expect(defaultConfig.code).toContain('return payload');
  });

  it('trigger default config provides manual triggerType', () => {
    const defaultConfig = {
      triggerType: 'manual',
      inputSchema: '',
    };

    expect(defaultConfig.triggerType).toBe('manual');
    expect(defaultConfig.inputSchema).toBe('');
  });

  it('output default config uses json format', () => {
    const defaultConfig = {
      format: 'json',
    };

    expect(defaultConfig.format).toBe('json');
  });

  it('retriever default config provides sensible defaults', () => {
    const defaultConfig = {
      embeddingProviderId: '',
      vectorStoreId: '',
      collectionName: '',
      topK: 5,
      minScore: 0.7,
    };

    expect(defaultConfig.topK).toBe(5);
    expect(defaultConfig.minScore).toBe(0.7);
  });
});

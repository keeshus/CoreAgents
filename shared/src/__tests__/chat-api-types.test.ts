import { describe, it, expect } from 'vitest';
import type {
  ChatApiDeployment,
  ChatApiKey,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIChatCompletionChunk,
} from '../types/chat-api.js';

describe('ChatApiDeployment type', () => {
  it('has the correct shape', () => {
    const deployment: ChatApiDeployment = {
      id: 'dep-1',
      flow_id: 'flow-1',
      enabled: true,
      model_name: 'gpt-4o',
      rate_limit: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(deployment.id).toBe('dep-1');
    expect(deployment.enabled).toBe(true);
    expect(deployment.model_name).toBe('gpt-4o');
  });

  it('allows disabled state', () => {
    const deployment: ChatApiDeployment = {
      id: 'dep-1',
      flow_id: 'flow-1',
      enabled: false,
      model_name: '',
      rate_limit: 0,
      created_at: '',
      updated_at: '',
    };
    expect(deployment.enabled).toBe(false);
  });
});

describe('ChatApiKey type', () => {
  it('has the correct shape', () => {
    const key: ChatApiKey = {
      id: 'key-1',
      flow_id: 'flow-1',
      label: 'My Key',
      key_prefix: 'ca_abc',
      enabled: true,
      last_used_at: null,
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      expires_at: null,
    };
    expect(key.key_prefix).toBe('ca_abc');
    expect(key.enabled).toBe(true);
  });

  it('allows optional fields to be null', () => {
    const key: ChatApiKey = {
      id: 'key-1',
      flow_id: 'flow-1',
      label: 'Default',
      key_prefix: 'ca_',
      enabled: true,
      last_used_at: null,
      created_by: null,
      created_at: '',
      expires_at: null,
    };
    expect(key.last_used_at).toBeNull();
    expect(key.created_by).toBeNull();
    expect(key.expires_at).toBeNull();
  });
});

describe('OpenAIChatCompletionRequest type', () => {
  it('accepts a minimal request', () => {
    const req: OpenAIChatCompletionRequest = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(req.messages.length).toBe(1);
    expect(req.model).toBe('gpt-4o');
  });

  it('accepts all optional fields', () => {
    const req: OpenAIChatCompletionRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi', name: 'user123' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'tool', content: 'Result', name: 'search' },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 0.9,
      stop: ['\n', '###'],
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    };
    expect(req.stream).toBe(true);
    expect(req.temperature).toBe(0.7);
    expect(req.stop).toEqual(['\n', '###']);
    expect(req.messages[3].role).toBe('tool');
  });
});

describe('OpenAIChatCompletionResponse type', () => {
  it('has the correct shape', () => {
    const response: OpenAIChatCompletionResponse = {
      id: 'chatcmpl-abc123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
    expect(response.object).toBe('chat.completion');
    expect(response.choices[0].message.content).toBe('Hello!');
    expect(response.usage.total_tokens).toBe(15);
  });

  it('supports length finish_reason', () => {
    const response: OpenAIChatCompletionResponse = {
      id: 'chatcmpl-xyz',
      object: 'chat.completion',
      created: 0,
      model: 'test',
      choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    expect(response.choices[0].finish_reason).toBe('length');
  });
});

describe('OpenAIChatCompletionChunk type', () => {
  it('has the correct shape for streaming', () => {
    const chunk: OpenAIChatCompletionChunk = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: 'Hello' },
        finish_reason: null,
      }],
    };
    expect(chunk.object).toBe('chat.completion.chunk');
    expect(chunk.choices[0].delta.content).toBe('Hello');
  });

  it('supports streaming final chunk', () => {
    const chunk: OpenAIChatCompletionChunk = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
    expect(chunk.choices[0].finish_reason).toBe('stop');
    expect(chunk.choices[0].delta.content).toBeUndefined();
  });
});

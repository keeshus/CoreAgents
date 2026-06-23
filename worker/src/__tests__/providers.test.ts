import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../providers/provider.js', () => ({
  callLLMGeneric: vi.fn(),
}));

import { callLLM } from '../providers/index.js';
import { callLLMGeneric } from '../providers/provider.js';
import type { LLMCallParams, ResolvedEndpoint } from '../providers/index.js';

const baseParams: LLMCallParams = {
  endpointId: 'ep1',
  model: 'claude-3-sonnet-20241022',
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
  maxTokens: 1024,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callLLMGeneric).mockResolvedValue({ text: 'generic response' });
});

describe('callLLM', () => {
  it('routes to anthropic provider', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'anthropic', apiKey: 'sk-ant-xxx', baseUrl: null };
    const result = await callLLM(baseParams, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-ant-xxx' }), 'anthropic');
    expect(result.text).toBe('generic response');
  });

  it('routes to openai provider', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'openai', apiKey: 'sk-openai-xxx', baseUrl: 'https://api.openai.com/v1' };
    await callLLM(baseParams, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-openai-xxx', baseUrl: 'https://api.openai.com/v1' }), 'openai');
  });

  it('routes to litellm provider', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'litellm', apiKey: 'sk-litellm-xxx', baseUrl: 'https://litellm.example.com/v1' };
    await callLLM(baseParams, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.any(Object), 'litellm');
  });

  it('passes through tools', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'anthropic', apiKey: 'sk-ant-xxx', baseUrl: null };
    const tools = [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object', properties: {} } }];
    await callLLM({ ...baseParams, tools }, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.objectContaining({ tools }), 'anthropic');
  });

  it('passes through onToken', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'anthropic', apiKey: 'sk-ant-xxx', baseUrl: null };
    const onToken = vi.fn();
    await callLLM({ ...baseParams, onToken }, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.objectContaining({ onToken }), 'anthropic');
  });

  it('passes through AbortSignal', async () => {
    const endpoint: ResolvedEndpoint = { providerType: 'openai', apiKey: 'sk-openai-xxx', baseUrl: null };
    const controller = new AbortController();
    await callLLM({ ...baseParams, signal: controller.signal }, endpoint);
    expect(callLLMGeneric).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }), 'openai');
  });
});

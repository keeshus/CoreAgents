import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the actual SDK calls so we only test routing logic
vi.mock('../providers/anthropic.js', () => ({
  callAnthropic: vi.fn(),
}));

vi.mock('../providers/openai-compatible.js', () => ({
  callOpenAICompatible: vi.fn(),
}));

import { callLLM } from '../providers/index.js';
import { callAnthropic } from '../providers/anthropic.js';
import { callOpenAICompatible } from '../providers/openai-compatible.js';
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
  vi.mocked(callAnthropic).mockResolvedValue({ text: 'anthropic response' });
  vi.mocked(callOpenAICompatible).mockResolvedValue({ text: 'openai response' });
});

describe('callLLM', () => {
  it('routes to anthropic provider when providerType is anthropic', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'anthropic',
      apiKey: 'sk-ant-xxx',
      baseUrl: null,
    };

    const result = await callLLM(baseParams, endpoint);

    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-ant-xxx',
        model: baseParams.model,
        systemPrompt: baseParams.systemPrompt,
      }),
    );
    expect(callOpenAICompatible).not.toHaveBeenCalled();
    expect(result.text).toBe('anthropic response');
  });

  it('routes to openai-compatible when providerType is openai', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'openai',
      apiKey: 'sk-openai-xxx',
      baseUrl: 'https://api.openai.com/v1',
    };

    const result = await callLLM(baseParams, endpoint);

    expect(callOpenAICompatible).toHaveBeenCalledTimes(1);
    expect(callOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-openai-xxx',
        baseUrl: 'https://api.openai.com/v1',
        model: baseParams.model,
      }),
    );
    expect(callAnthropic).not.toHaveBeenCalled();
    expect(result.text).toBe('openai response');
  });

  it('routes to litellm provider (same code path as openai-compatible)', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'litellm',
      apiKey: 'sk-litellm-xxx',
      baseUrl: 'https://litellm.example.com/v1',
    };

    await callLLM(baseParams, endpoint);

    // litellm uses the same openai-compatible path
    expect(callOpenAICompatible).toHaveBeenCalledTimes(1);
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it('passes through tools properly', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'anthropic',
      apiKey: 'sk-ant-xxx',
      baseUrl: null,
    };

    const tools = [
      { name: 'get_weather', description: 'Get the current weather', input_schema: { type: 'object', properties: { location: { type: 'string' } } } },
    ];

    const params: LLMCallParams = {
      ...baseParams,
      tools,
    };

    await callLLM(params, endpoint);

    expect(callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
      }),
    );
  });

  it('passes through onToken callback', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'anthropic',
      apiKey: 'sk-ant-xxx',
      baseUrl: null,
    };

    const onToken = vi.fn();
    const params: LLMCallParams = {
      ...baseParams,
      onToken,
    };

    await callLLM(params, endpoint);

    expect(callAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        onToken,
      }),
    );
  });

  it('passes through AbortSignal', async () => {
    const endpoint: ResolvedEndpoint = {
      providerType: 'openai',
      apiKey: 'sk-openai-xxx',
      baseUrl: null,
    };

    const controller = new AbortController();
    const params: LLMCallParams = {
      ...baseParams,
      signal: controller.signal,
    };

    await callLLM(params, endpoint);

    expect(callOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});

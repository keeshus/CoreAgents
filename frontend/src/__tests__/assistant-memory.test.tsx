import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveConversation, loadConversation, clearConversationKey, MAX_MESSAGES_PER_PAGE } from '@/components/assistant/useConversationMemory';

const mockStorage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  get length() { return Object.keys(mockStorage).length; },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
});

describe('useConversationMemory storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it('saves and loads conversations per key', () => {
    saveConversation('flow:abc', [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }]);
    saveConversation('flow:def', [{ id: '2', role: 'user', content: 'world', timestamp: 2 }]);
    expect(loadConversation('flow:abc')).toHaveLength(1);
    expect(loadConversation('flow:abc')[0].content).toBe('hello');
    expect(loadConversation('flow:def')[0].content).toBe('world');
  });

  it('trims messages beyond the per-page max', () => {
    const msgs = Array.from({ length: MAX_MESSAGES_PER_PAGE + 5 }, (_, i) => ({ id: String(i), role: 'user' as const, content: String(i), timestamp: i }));
    saveConversation('test', msgs);
    const loaded = loadConversation('test');
    expect(loaded).toHaveLength(MAX_MESSAGES_PER_PAGE);
    expect(loaded[0].content).toBe(String(5));
  });

  it('clears a key', () => {
    saveConversation('test', [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }]);
    clearConversationKey('test');
    expect(loadConversation('test')).toHaveLength(0);
  });

  it('returns empty array for unknown key', () => {
    expect(loadConversation('unknown')).toEqual([]);
  });

  it('persists across reads through localStorage', () => {
    saveConversation('persist', [{ id: '1', role: 'user', content: 'kept', timestamp: 1 }]);
    expect(loadConversation('persist')[0].content).toBe('kept');
    // Raw localStorage holds the data under the copilot:history key
    expect(localStorage.getItem('copilot:history')).toContain('persist');
  });
});

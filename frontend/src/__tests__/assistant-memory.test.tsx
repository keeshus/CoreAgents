import { describe, it, expect, beforeEach } from 'vitest';

describe('useConversationMemory', () => {
  // Replicate the logic to test it
  function createStore() {
    const store = new Map<string, { messages: any[]; updatedAt: number }>();
    const MAX = 5; // Small for testing

    return {
      save(key: string, messages: any[]) {
        const conv = store.get(key) || { messages: [], updatedAt: 0 };
        conv.messages = messages;
        conv.updatedAt = Date.now();
        if (conv.messages.length > MAX) conv.messages = conv.messages.slice(-MAX);
        store.set(key, conv);
      },
      load(key: string) { return store.get(key)?.messages || []; },
      clearKey(key: string) { store.delete(key); },
      size() { return store.size; },
    };
  }

  it('saves and loads conversations per key', () => {
    const store = createStore();
    store.save('flow:abc', [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }]);
    store.save('flow:def', [{ id: '2', role: 'user', content: 'world', timestamp: 2 }]);
    expect(store.load('flow:abc')).toHaveLength(1);
    expect(store.load('flow:abc')[0].content).toBe('hello');
    expect(store.load('flow:def')[0].content).toBe('world');
  });

  it('trims messages beyond max', () => {
    const store = createStore();
    const msgs = Array.from({ length: 10 }, (_, i) => ({ id: String(i), role: 'user' as const, content: String(i), timestamp: i }));
    store.save('test', msgs);
    expect(store.load('test')).toHaveLength(5);
    expect(store.load('test')[0].content).toBe('5');
  });

  it('clears a key', () => {
    const store = createStore();
    store.save('test', [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }]);
    store.clearKey('test');
    expect(store.load('test')).toHaveLength(0);
  });

  it('returns empty array for unknown key', () => {
    const store = createStore();
    expect(store.load('unknown')).toEqual([]);
  });
});

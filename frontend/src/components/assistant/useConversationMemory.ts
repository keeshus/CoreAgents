import { useRef, useCallback } from 'react';
import type { AssistantMessage } from './AssistantContext';

const MAX_MESSAGES_PER_PAGE = 30;
const MAX_TOTAL_CONVERSATIONS = 50;

interface StoredConversation {
  messages: AssistantMessage[];
  updatedAt: number;
}

export function useConversationMemory() {
  const store = useRef<Map<string, StoredConversation>>(new Map());

  const save = useCallback((key: string, messages: AssistantMessage[]) => {
    if (!key) return;
    let conv = store.current.get(key);
    if (!conv) {
      conv = { messages: [], updatedAt: Date.now() };
    }
    conv.messages = messages;
    conv.updatedAt = Date.now();

    // Trim to max
    if (conv.messages.length > MAX_MESSAGES_PER_PAGE) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_PAGE);
    }

    store.current.set(key, conv);

    // Evict oldest
    if (store.current.size > MAX_TOTAL_CONVERSATIONS) {
      const oldest = [...store.current.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (oldest) store.current.delete(oldest[0]);
    }
  }, []);

  const load = useCallback((key: string): AssistantMessage[] => {
    return store.current.get(key)?.messages || [];
  }, []);

  const clearKey = useCallback((key: string) => {
    store.current.delete(key);
  }, []);

  return { save, load, clearKey };
}

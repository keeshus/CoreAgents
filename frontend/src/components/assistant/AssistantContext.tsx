import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getToolsForPage as getTools } from './tools/registry';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AssistantTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<string>;
}

export interface PageContext {
  pageKey: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ── Context type ────────────────────────────────────────────────────────────────

interface AssistantContextType {
  /** Current page context */
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;

  /** Active tools for the current page */
  activeTools: AssistantTool[];
  setActiveTools: (tools: AssistantTool[]) => void;

  /** Conversation messages */
  messages: Message[];
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  /** Whether the assistant panel is open */
  isOpen: boolean;
  setOpen: (open: boolean) => void;

  /** Load tools for a given page */
  getToolsForPage: (pageKey: string, nodeType?: string) => AssistantTool[];
}

// ── Context ─────────────────────────────────────────────────────────────────────

const AssistantContext = createContext<AssistantContextType | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────────

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [activeTools, setActiveTools] = useState<AssistantTool[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    }]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const value: AssistantContextType = {
    pageContext,
    setPageContext,
    activeTools,
    setActiveTools,
    messages,
    addMessage,
    clearMessages,
    isOpen,
    setOpen: setIsOpen,
    getToolsForPage: getTools,
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useAssistant(): AssistantContextType {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return ctx;
}

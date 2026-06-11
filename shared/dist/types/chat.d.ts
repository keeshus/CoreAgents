export interface ChatSession {
    id: string;
    flowId: string;
    title: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
export interface ChatMessage {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
}
export interface ChatSessionWithMessages extends ChatSession {
    messages: ChatMessage[];
}
//# sourceMappingURL=chat.d.ts.map
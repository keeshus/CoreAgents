import { useState, useRef, useEffect } from 'react';
import { useAssistant } from './AssistantContext';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'],
  attributes: {
    ...defaultSchema.attributes,
    th: ['align', 'scope', 'colspan', 'rowspan'],
    td: ['align', 'colspan', 'rowspan'],
    table: ['class'],
  },
};

export function AssistantPanel() {
  const {
    open, messages, streaming, streamingContent, error,
    sendMessage, stopAssistant, clearConversation, defaultEndpointId, pageContext,
  } = useAssistant();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages, streamingContent]);

  // Auto-resize textarea on input (must be before early return)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="fixed bottom-24 right-6 z-50 w-[480px] max-h-[720px] bg-surface rounded-xl shadow-m3-4 border border-outline-variant flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-surface-container rounded-t-xl shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">Co-Pilot</span>
          {pageContext && (
            <Tooltip content={pageContext.description}>
              <span className="text-[9px] text-on-surface-variant ml-1 max-w-[120px] truncate">
                · {pageContext.description}
              </span>
            </Tooltip>
          )}
          {!defaultEndpointId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-error-container text-error">No endpoint</span>
          )}
        </div>
        <Tooltip content="Clear conversation">
          <button onClick={clearConversation} className="flex items-center gap-1 p-1 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors">
            <Icon name="delete" className="text-sm" /> Clear
          </button>
        </Tooltip>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[520px]">
        {!hasMessages && (
          <div className="text-center text-on-surface-variant text-xs py-8">
            Ask me anything about building flows, managing settings, or writing code.
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-primary text-on-primary'
                : m.role === 'tool'
                  ? 'bg-surface-container-high text-on-surface-variant text-[11px] font-mono'
                  : 'bg-surface-container-high text-on-surface'
            }`}>
              {m.role === 'tool' ? (
                <div>
                  <span className="font-semibold">🔧 {m.name}: </span>
                  {m.content.slice(0, 200)}{m.content.length > 200 ? '...' : ''}
                </div>
              ) : m.role === 'user' ? (
                m.content
              ) : (
                <div className="prose prose-sm max-w-none prose-code:bg-surface-container-high prose-code:px-1 prose-code:rounded overflow-x-auto [&_table]:text-left [&_th]:border [&_th]:border-outline [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-outline [&_td]:px-2 [&_td]:py-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming content */}
        {streaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-surface-container-high text-on-surface">
              <div className="prose prose-sm max-w-none overflow-x-auto [&_table]:text-left [&_th]:border [&_th]:border-outline [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-outline [&_td]:px-2 [&_td]:py-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}>{streamingContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {streaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-surface-container-high">
              <Icon name="sync" className="text-base animate-spin text-on-surface-variant" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-error bg-error-container rounded p-2">
            <Icon name="warning" className="text-xs shrink-0" /> {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3 shrink-0 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="Ask anything..."
          rows={1}
          className="flex-1 text-sm border border-outline rounded-lg px-3 py-2 resize-none overflow-y-auto focus:outline-none focus:ring-1 focus:ring-on-surface-variant"
          disabled={streaming}
        />
        <button
          type={streaming ? 'button' : 'submit'}
          onClick={streaming ? stopAssistant : undefined}
          disabled={!streaming && !input.trim()}
          className="m3-button disabled:opacity-50 shrink-0 self-end flex items-center gap-1"
        >
          {streaming ? <><Icon name="stop" className="text-base" /> Stop</> : <Icon name="send" className="text-base" />}
        </button>
      </form>
    </div>
  );
}

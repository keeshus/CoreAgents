import { useEffect, useState, useRef, useCallback } from 'react';
import {
  X, Play, Loader2, CheckCircle, XCircle, Clock, Square,
  ChevronDown, ChevronUp, AlertTriangle, Bot, Wrench, GitBranch, Code, ArrowRight, Plus, Trash2, MessageSquare, Webhook, Calendar, Terminal
} from 'lucide-react';

interface DebugOverlayProps {
  flowId: string;
  onClose: () => void;
  nodes?: any[];
  edges?: any[];
}

interface StepEvent {
  type: string;
  executionId?: string;
  nodeId?: string;
  data: Record<string, any>;
  timestamp: string;
}

interface StepInfo {
  nodeId: string;
  nodeType: string;
  nodeLabel?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output: any;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  tokens: string[];
  children?: Array<{ nodeId: string; type: string; output?: any; error?: string; status: string }>;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

const NODE_ICONS: Record<string, any> = {
  trigger: ArrowRight,
  'llm-agent': Bot,
  'mcp-tool': Wrench,
  branch: GitBranch,
  code: Code,
  output: CheckCircle,
  retriever: Clock,
};

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
  parallel: 'Parallel',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const TRIGGER_CONFIG: Record<string, { label: string; icon: any; description: string }> = {
  manual: { label: 'Manual', icon: Terminal, description: 'Send a message to trigger the flow' },
  chat: { label: 'Chat', icon: MessageSquare, description: 'Send a chat message with optional history' },
  webhook: { label: 'Webhook', icon: Webhook, description: 'Provide a JSON payload as the webhook body' },
  schedule: { label: 'Schedule', icon: Calendar, description: 'Trigger the flow with a message (simulates scheduled run)' },
};

export function DebugOverlay({ flowId, onClose, nodes: canvasNodes, edges: canvasEdges }: DebugOverlayProps) {
  const [flow, setFlow] = useState<any>(null);
  const [loadingFlow, setLoadingFlow] = useState(true);
  const [triggerType, setTriggerType] = useState<string>('manual');
  const [chatMessage, setChatMessage] = useState('Hello! This is a debug run.');
  const [chatHistory, setChatHistory] = useState<HistoryEntry[]>([]);
  const [manualMessage, setManualMessage] = useState('');
  const [webhookPayload, setWebhookPayload] = useState('{\n  "event": "test",\n  "data": {}\n}');
  const [webhookPayloadError, setWebhookPayloadError] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finalOutput, setFinalOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hitlPause, setHitlPause] = useState<{ executionId: string; prompt: string; buttons: { label: string; value: string }[]; nodeId: string } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Use canvas nodes if provided, otherwise fetch from API
    const resolveNodes = async () => {
      const nodes = canvasNodes || await fetch(`${API_URL}/flows/${flowId}`).then(res => res.json()).then(f => f.nodes || []).catch(() => []);
      setFlow({ nodes });
      const trigger = nodes.find((n: any) => n.type === 'trigger' || n.data?.type === 'trigger');
      if (trigger) {
        const tt = trigger.data?.config?.triggerType || 'manual';
        setTriggerType(tt);
        if (tt === 'webhook' && trigger.data?.config?.inputSchema) {
          try {
            const schema = JSON.parse(trigger.data.config.inputSchema);
            setWebhookPayload(JSON.stringify(schema, null, 2));
          } catch {}
        }
      }
      setLoadingFlow(false);
    };
    resolveNodes();
  }, [flowId, canvasNodes]);

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('failed');
    setError('Cancelled by user');
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const buildInput = useCallback(() => {
    if (triggerType === 'chat') {
      return { chat_input: { message: chatMessage, history: chatHistory } };
    }
    if (triggerType === 'webhook') {
      try { return JSON.parse(webhookPayload); } catch { return { payload: webhookPayload }; }
    }
    return { message: manualMessage };
  }, [triggerType, chatMessage, chatHistory, manualMessage, webhookPayload]);

  const run = useCallback(async () => {
    setSteps([]);
    setFinalOutput(null);
    setError(null);
    setHitlPause(null);
    setStatus('running');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const input = buildInput();
      const body: any = { input: { _debug: true, ...input } };
      if (canvasNodes) body.nodes = canvasNodes;
      if (canvasEdges) body.edges = canvasEdges;
      const res = await fetch(`${API_URL}/flows/${flowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: StepEvent;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (!event) continue;

          const d = event.data || {};
          const nodeId = event.nodeId || d.nodeId || '';

          if (event.type === 'step.started') {
            setSteps(prev => [...prev, {
              nodeId,
              nodeType: d.nodeType || '',
              nodeLabel: d.nodeLabel || '',
              status: 'running',
              input: d.input,
              output: null,
              error: null,
              startedAt: event.timestamp,
              completedAt: null,
              tokens: [],
            }]);
          } else if (event.type === 'stream.token') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId && s.status === 'running'
                ? { ...s, tokens: [...s.tokens, d.token || ''] }
                : s
            ));
          } else if (event.type === 'step.completed') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId ? { ...s, status: 'completed', output: d.output, completedAt: event.timestamp } : s
            ));
          } else if (event.type === 'step.failed') {
            setSteps(prev => prev.map(s =>
              s.nodeId === nodeId ? { ...s, status: 'failed', error: d.error || null, completedAt: event.timestamp } : s
            ));
          } else if (event.type === 'log' && d.subNodeId) {
            setSteps(prev => prev.map(s => {
              if (s.nodeId !== nodeId || s.nodeType !== 'parallel') return s;
              const existing = s.children || [];
              const child = { nodeId: d.subNodeId, type: d.subNodeType, output: d.output, error: d.error, status: d.status };
              return { ...s, children: [...existing.filter(c => c.nodeId !== d.subNodeId), child] };
            }));
          } else if (event.type === 'execution.completed') {
            setFinalOutput(d.output);
            setStatus('completed');
          } else if (event.type === 'execution.paused') {
            setHitlPause({
              executionId: event.executionId || '',
              prompt: d.prompt || 'Waiting for approval',
              buttons: d.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }],
              nodeId: d.nodeId || '',
            });
            setStatus('completed');
          } else if (event.type === 'execution.failed') {
            setError(d.error || 'Execution failed');
            setStatus('failed');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Execution error');
      setStatus('failed');
    }
  }, [flowId, buildInput]);

  const handleHitlApprove = useCallback(async (decision: string) => {
    if (!hitlPause) return;
    setStatus('running');
    setHitlPause(null);
    try {
      await fetch(`${API_URL}/executions/${hitlPause.executionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, hitlNodeId: hitlPause.nodeId }),
      });
      run();
    } catch (err: any) {
      setError(err.message || 'Approval failed');
      setStatus('failed');
    }
  }, [hitlPause, run]);

  const handleHitlReject = useCallback(async () => {
    if (!hitlPause) return;
    setHitlPause(null);
    try {
      await fetch(`${API_URL}/executions/${hitlPause.executionId}/reject`, {
        method: 'POST',
        credentials: 'include',
      });
      setStatus('failed');
      setError('Execution rejected by user');
    } catch (err: any) {
      setError(err.message || 'Rejection failed');
      setStatus('failed');
    }
  }, [hitlPause]);

  const isValidJson = useCallback((str: string) => {
    try { JSON.parse(str); return true; } catch { return false; }
  }, []);

  const validateWebhookPayload = useCallback((value: string) => {
    if (!value.trim()) { setWebhookPayloadError(null); return; }
    try { JSON.parse(value); setWebhookPayloadError(null); } catch (e: any) { setWebhookPayloadError(e.message); }
  }, []);

  const handleWebhookChange = useCallback((value: string) => {
    setWebhookPayload(value);
    validateWebhookPayload(value);
  }, [validateWebhookPayload]);

  const addHistoryEntry = () => {
    setChatHistory(prev => [...prev, { role: 'user', content: '' }]);
  };

  const updateHistoryEntry = (index: number, field: keyof HistoryEntry, value: string) => {
    setChatHistory(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const removeHistoryEntry = (index: number) => {
    setChatHistory(prev => prev.filter((_, i) => i !== index));
  };

  const formatTime = (t: string) => new Date(t).toLocaleTimeString();

  const TriggerIcon = TRIGGER_CONFIG[triggerType]?.icon || Terminal;

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      {/* Header — clean minimal bar */}
      <div className="h-11 border-b flex items-center justify-between px-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-on-surface">Debug Run</h2>
          {!loadingFlow && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">
              <TriggerIcon className="w-3 h-3" />
              {TRIGGER_CONFIG[triggerType]?.label || triggerType}
            </span>
          )}
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Loader2 className="w-3 h-3 animate-spin" /> Running...
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle className="w-3 h-3" /> Completed
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1 text-xs text-error">
              <XCircle className="w-3 h-3" /> Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <button onClick={stop} className="m3-button text-xs bg-error">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:text-on-surface-variant">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Loading state */}
        {loadingFlow && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">Loading flow...</p>
            </div>
          </div>
        )}

        {!loadingFlow && (
          <div className="max-w-4xl mx-auto py-6 px-6">
            {/* Re-run bar — always visible, the primary input */}
            <div className="bg-surface border rounded-xl p-4 mb-4 space-y-3">
              {triggerType === 'chat' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Message</label>
                    <textarea
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Enter the chat message..."
                      className="w-full text-sm border rounded-lg px-3 py-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      rows={2}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-on-surface-variant">History</label>
                      <button onClick={addHistoryEntry} className="flex items-center gap-1 text-xs text-primary hover:text-primary">
                        <Plus className="w-3 h-3" /> Add entry
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {chatHistory.map((entry, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <select
                            value={entry.role}
                            onChange={(e) => updateHistoryEntry(i, 'role', e.target.value)}
                            className="text-xs border rounded-lg px-2 py-1.5 font-mono bg-surface"
                          >
                            <option value="user">user</option>
                            <option value="assistant">assistant</option>
                          </select>
                          <input
                            type="text"
                            value={entry.content}
                            onChange={(e) => updateHistoryEntry(i, 'content', e.target.value)}
                            placeholder="Message content..."
                            className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                          <button onClick={() => removeHistoryEntry(i)} className="p-1.5 text-error hover:text-error">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {chatHistory.length === 0 && (
                        <p className="text-xs text-on-surface-variant italic">No history — the message above will be sent fresh</p>
                      )}
                    </div>
                  </div>
                </>
              )}
              {(triggerType === 'manual' || triggerType === 'schedule') && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Message</label>
                  <textarea
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    placeholder="Enter the message to send to the flow..."
                    className="w-full text-sm border rounded-lg px-3 py-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    rows={2}
                  />
                </div>
              )}
              {triggerType === 'webhook' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Payload</label>
                  <textarea
                    value={webhookPayload}
                    onChange={(e) => handleWebhookChange(e.target.value)}
                    placeholder='{"event": "test", "data": {}}'
                    className="w-full text-sm border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[120px]"
                    rows={5}
                  />
                  {webhookPayloadError && (
                    <p className="text-[11px] text-error mt-1 font-mono">Invalid JSON: {webhookPayloadError}</p>
                  )}
                </div>
              )}
              <button
                onClick={run}
                disabled={status === 'running' || (triggerType === 'webhook' && webhookPayloadError !== null)}
                className="m3-button text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {status === 'idle' ? 'Start Debug Run' : 'Re-run'}
              </button>
            </div>

            {/* Content area below the input form */}
            {status === 'idle' && steps.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-outline-variant mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">Ready to debug</p>
                <p className="text-sm text-on-surface-variant mt-1">Fill in the input above and click &quot;Start Debug Run&quot;</p>
              </div>
            )}

            {steps.length === 0 && status === 'running' && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">Executing flow...</p>
              </div>
            )}

            {steps.length === 0 && !loadingFlow && status !== 'idle' && status !== 'running' && (
              <div className="bg-surface rounded-lg border p-8 text-center">
                {status === 'completed' ? (
                  <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                ) : (
                  <XCircle className="w-12 h-12 text-error mx-auto mb-3" />
                )}
                <h3 className="text-lg font-semibold text-on-surface mb-1">
                  {status === 'completed' ? 'Execution Completed' : 'Execution Failed'}
                </h3>
                {error && <p className="text-sm text-error font-mono mt-2">{error}</p>}
                {finalOutput && (
                  <pre className="text-xs bg-surface-container p-3 rounded mt-4 text-left overflow-auto max-h-64">{JSON.stringify(finalOutput, null, 2)}</pre>
                )}
                {!error && !finalOutput && <p className="text-sm text-on-surface-variant">No output data was returned.</p>}
              </div>
            )}

            {steps.length > 0 && (
              <div className="space-y-1.5">
                {steps.map((step, i) => {
              const Icon = NODE_ICONS[step.nodeType] || Clock;
              const isExpanded = expanded[step.nodeId + i] || false;
              const isLLM = step.nodeType === 'llm-agent';
              const hasSystemPrompt = step.input?.systemPrompt;
              const hasTokens = step.tokens.length > 0;
              const stepLabel = step.nodeLabel || step.input?._nodeLabel || NODE_LABELS[step.nodeType] || step.nodeType;

              return (
                <div key={step.nodeId + i} className="bg-surface rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggle(step.nodeId + i)}
                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-surface-container transition-colors"
                  >
                    {step.status === 'running' && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
                    {step.status === 'completed' && <CheckCircle className="w-4 h-4 text-success shrink-0" />}
                    {step.status === 'failed' && <XCircle className="w-4 h-4 text-error shrink-0" />}
                    {step.status === 'pending' && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}

                    <div className="flex items-center gap-2 shrink-0 w-4">
                      <Icon className="w-4 h-4 text-on-surface-variant" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-on-surface">{stepLabel}</span>
                        {isLLM && step.input?.model && <span className="text-[10px] text-on-surface-variant font-mono">{step.input.model}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] capitalize ${
                          step.status === 'completed' ? 'text-success' :
                          step.status === 'failed' ? 'text-error' :
                          step.status === 'running' ? 'text-primary' : 'text-on-surface-variant'
                        }`}>
                          {step.status}
                        </span>
                        {step.completedAt && (
                          <span className="text-[10px] text-on-surface-variant">{formatTime(step.startedAt)} → {formatTime(step.completedAt)}</span>
                        )}
                      </div>
                    </div>

                    {isLLM && step.status === 'running' && hasTokens && (
                      <div className="hidden sm:block text-xs text-on-surface-variant italic truncate max-w-[200px]">{step.tokens.join('').slice(-60)}</div>
                    )}
                    {isLLM && step.status === 'completed' && step.output?.content && (
                      <div className="hidden sm:block text-xs text-on-surface-variant truncate max-w-[200px]">{String(step.output.content).slice(0, 60)}</div>
                    )}
                    {step.error && <AlertTriangle className="w-4 h-4 text-error shrink-0" />}

                    {(step.input || step.output || hasTokens || hasSystemPrompt) && (
                      isExpanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant shrink-0" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-surface-container/50 p-4 space-y-3">
                      {hasSystemPrompt && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">System Prompt</h4>
                          <pre className="text-xs bg-surface border rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">{step.input.systemPrompt}</pre>
                        </div>
                      )}
                      {step.nodeType === 'branch' && step.input?.condition && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Condition</h4>
                          <code className="text-xs bg-surface border rounded p-2 block font-mono">{step.input.condition}</code>
                        </div>
                      )}
                      {step.nodeType === 'parallel' && step.children && step.children.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Sub-nodes ({step.children.length})</h4>
                          <div className="space-y-1.5">
                            {step.children.map(child => (
                              <div key={child.nodeId} className={`p-2 rounded border text-xs ${
                                child.status === 'completed' ? 'bg-success-container border-success' :
                                child.status === 'failed' ? 'bg-error-container border-error' : 'bg-surface-container border-outline-variant'
                              }`}>
                                <div className="flex items-center gap-2">
                                  {child.status === 'completed' && <CheckCircle className="w-3 h-3 text-success" />}
                                  {child.status === 'failed' && <XCircle className="w-3 h-3 text-error" />}
                                  <span className="font-medium text-on-surface-variant">{NODE_LABELS[child.type] || child.type}</span>
                                  <span className="text-[10px] text-on-surface-variant">{child.nodeId.slice(0, 8)}</span>
                                </div>
                                {child.error && <p className="text-error mt-1 font-mono">{child.error}</p>}
                                {child.output && (
                                  <pre className="mt-1 text-[10px] bg-surface rounded p-1.5 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap break-all">{JSON.stringify(child.output, null, 2)}</pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.input && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Input</h4>
                          <pre className="text-xs bg-surface border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">{JSON.stringify(step.input, null, 2)}</pre>
                        </div>
                      )}
                      {isLLM && hasTokens && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                            {step.status === 'running' ? 'Streaming Tokens' : 'LLM Response'}
                          </h4>
                          <div className="text-xs bg-surface border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto text-on-surface">
                            {step.tokens.join('')}
                            {step.status === 'running' && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />}
                          </div>
                        </div>
                      )}
                      {step.output && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Output</h4>
                          <pre className="text-xs bg-surface border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">{JSON.stringify(step.output, null, 2)}</pre>
                        </div>
                      )}
                      {step.error && (
                        <div className="flex items-start gap-2 bg-error-container border border-error rounded p-2">
                          <AlertTriangle className="w-3 h-3 text-error mt-0.5 shrink-0" />
                          <span className="text-xs text-error font-mono break-all">{step.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {hitlPause && (
              <div className="mt-4 bg-secondary-container border border-secondary rounded-lg p-4">
                <h3 className="text-sm font-semibold text-on-secondary-container mb-2">Human-in-the-Loop — Approval Required</h3>
                <div className="prose prose-sm max-w-none text-on-secondary-container bg-surface rounded border p-3 max-h-48 overflow-y-auto">{hitlPause.prompt}</div>
                <div className="flex gap-2">
                  {hitlPause.buttons.map(btn => (
                    <button key={btn.value} onClick={() => handleHitlApprove(btn.value)}
                      className="m3-button text-sm bg-secondary text-white">
                      {btn.label}
                    </button>
                  ))}
                  {!hitlPause.buttons.some(b => b.value === 'rejected') && (
                    <button onClick={handleHitlReject}
                      className="m3-button-outlined text-sm">
                      Reject
                    </button>
                  )}
                </div>
              </div>
            )}

            {finalOutput && (
              <div className="mt-4 bg-success-container border border-success rounded-lg p-4">
                <h3 className="text-sm font-semibold text-success mb-2">Final Output</h3>
                <pre className="text-xs whitespace-pre-wrap break-all text-success max-h-48 overflow-y-auto">{JSON.stringify(finalOutput, null, 2)}</pre>
              </div>
            )}

            {error && !steps.some(s => s.error) && (
              <div className="mt-4 bg-error-container border border-error rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-error mb-1">Execution Failed</h3>
                  <p className="text-xs text-error font-mono break-all">{error}</p>
                </div>
              </div>
            )}

            <div ref={logEndRef} />
          </div>
        )}
      </div>
    )}
    </div>
    </div>
  );
}

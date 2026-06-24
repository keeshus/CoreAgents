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
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header — clean minimal bar */}
      <div className="h-11 border-b flex items-center justify-between px-4 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Debug Run</h2>
          {!loadingFlow && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              <TriggerIcon className="w-3 h-3" />
              {TRIGGER_CONFIG[triggerType]?.label || triggerType}
            </span>
          )}
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" /> Running...
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" /> Completed
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <XCircle className="w-3 h-3" /> Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <button onClick={stop} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
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
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading flow...</p>
            </div>
          </div>
        )}

        {!loadingFlow && (
          <div className="max-w-4xl mx-auto py-6 px-6">
            {/* Re-run bar — always visible, the primary input */}
            <div className="bg-white border rounded-xl p-4 mb-4 space-y-3">
              {triggerType === 'chat' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                    <textarea
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Enter the chat message..."
                      className="w-full text-sm border rounded-lg px-3 py-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      rows={2}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">History</label>
                      <button onClick={addHistoryEntry} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <Plus className="w-3 h-3" /> Add entry
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {chatHistory.map((entry, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <select
                            value={entry.role}
                            onChange={(e) => updateHistoryEntry(i, 'role', e.target.value)}
                            className="text-xs border rounded-lg px-2 py-1.5 font-mono bg-white"
                          >
                            <option value="user">user</option>
                            <option value="assistant">assistant</option>
                          </select>
                          <input
                            type="text"
                            value={entry.content}
                            onChange={(e) => updateHistoryEntry(i, 'content', e.target.value)}
                            placeholder="Message content..."
                            className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                          />
                          <button onClick={() => removeHistoryEntry(i)} className="p-1.5 text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {chatHistory.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No history — the message above will be sent fresh</p>
                      )}
                    </div>
                  </div>
                </>
              )}
              {(triggerType === 'manual' || triggerType === 'schedule') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                  <textarea
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    placeholder="Enter the message to send to the flow..."
                    className="w-full text-sm border rounded-lg px-3 py-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    rows={2}
                  />
                </div>
              )}
              {triggerType === 'webhook' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payload</label>
                  <textarea
                    value={webhookPayload}
                    onChange={(e) => handleWebhookChange(e.target.value)}
                    placeholder='{"event": "test", "data": {}}'
                    className="w-full text-sm border rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-h-[120px]"
                    rows={5}
                  />
                  {webhookPayloadError && (
                    <p className="text-[11px] text-red-500 mt-1 font-mono">Invalid JSON: {webhookPayloadError}</p>
                  )}
                </div>
              )}
              <button
                onClick={run}
                disabled={status === 'running' || (triggerType === 'webhook' && webhookPayloadError !== null)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {status === 'idle' ? 'Start Debug Run' : 'Re-run'}
              </button>
            </div>

            {/* Content area below the input form */}
            {status === 'idle' && steps.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Ready to debug</p>
                <p className="text-sm text-gray-400 mt-1">Fill in the input above and click &quot;Start Debug Run&quot;</p>
              </div>
            )}

            {steps.length === 0 && status === 'running' && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Executing flow...</p>
              </div>
            )}

            {steps.length === 0 && !loadingFlow && status !== 'idle' && status !== 'running' && (
              <div className="bg-white rounded-lg border p-8 text-center">
                {status === 'completed' ? (
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                ) : (
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {status === 'completed' ? 'Execution Completed' : 'Execution Failed'}
                </h3>
                {error && <p className="text-sm text-red-600 font-mono mt-2">{error}</p>}
                {finalOutput && (
                  <pre className="text-xs bg-gray-50 p-3 rounded mt-4 text-left overflow-auto max-h-64">{JSON.stringify(finalOutput, null, 2)}</pre>
                )}
                {!error && !finalOutput && <p className="text-sm text-gray-500">No output data was returned.</p>}
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
                <div key={step.nodeId + i} className="bg-white rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggle(step.nodeId + i)}
                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                    {step.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                    {step.status === 'failed' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    {step.status === 'pending' && <Clock className="w-4 h-4 text-yellow-500 shrink-0" />}

                    <div className="flex items-center gap-2 shrink-0 w-4">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{stepLabel}</span>
                        {isLLM && step.input?.model && <span className="text-[10px] text-gray-400 font-mono">{step.input.model}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] capitalize ${
                          step.status === 'completed' ? 'text-green-600' :
                          step.status === 'failed' ? 'text-red-600' :
                          step.status === 'running' ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {step.status}
                        </span>
                        {step.completedAt && (
                          <span className="text-[10px] text-gray-400">{formatTime(step.startedAt)} → {formatTime(step.completedAt)}</span>
                        )}
                      </div>
                    </div>

                    {isLLM && step.status === 'running' && hasTokens && (
                      <div className="hidden sm:block text-xs text-gray-500 italic truncate max-w-[200px]">{step.tokens.join('').slice(-60)}</div>
                    )}
                    {isLLM && step.status === 'completed' && step.output?.content && (
                      <div className="hidden sm:block text-xs text-gray-500 truncate max-w-[200px]">{String(step.output.content).slice(0, 60)}</div>
                    )}
                    {step.error && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}

                    {(step.input || step.output || hasTokens || hasSystemPrompt) && (
                      isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-gray-50/50 p-4 space-y-3">
                      {hasSystemPrompt && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">System Prompt</h4>
                          <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">{step.input.systemPrompt}</pre>
                        </div>
                      )}
                      {step.nodeType === 'branch' && step.input?.condition && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Condition</h4>
                          <code className="text-xs bg-white border rounded p-2 block font-mono">{step.input.condition}</code>
                        </div>
                      )}
                      {step.nodeType === 'parallel' && step.children && step.children.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Sub-nodes ({step.children.length})</h4>
                          <div className="space-y-1.5">
                            {step.children.map(child => (
                              <div key={child.nodeId} className={`p-2 rounded border text-xs ${
                                child.status === 'completed' ? 'bg-green-50 border-green-200' :
                                child.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                              }`}>
                                <div className="flex items-center gap-2">
                                  {child.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
                                  {child.status === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
                                  <span className="font-medium text-gray-700">{NODE_LABELS[child.type] || child.type}</span>
                                  <span className="text-[10px] text-gray-400">{child.nodeId.slice(0, 8)}</span>
                                </div>
                                {child.error && <p className="text-red-600 mt-1 font-mono">{child.error}</p>}
                                {child.output && (
                                  <pre className="mt-1 text-[10px] bg-white rounded p-1.5 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap break-all">{JSON.stringify(child.output, null, 2)}</pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.input && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Input</h4>
                          <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">{JSON.stringify(step.input, null, 2)}</pre>
                        </div>
                      )}
                      {isLLM && hasTokens && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            {step.status === 'running' ? 'Streaming Tokens' : 'LLM Response'}
                          </h4>
                          <div className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto text-gray-800">
                            {step.tokens.join('')}
                            {step.status === 'running' && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />}
                          </div>
                        </div>
                      )}
                      {step.output && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Output</h4>
                          <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">{JSON.stringify(step.output, null, 2)}</pre>
                        </div>
                      )}
                      {step.error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
                          <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                          <span className="text-xs text-red-700 font-mono break-all">{step.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {hitlPause && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">Human-in-the-Loop — Approval Required</h3>
                <div className="prose prose-sm max-w-none text-amber-900 mb-4 bg-white rounded border p-3 max-h-48 overflow-y-auto">{hitlPause.prompt}</div>
                <div className="flex gap-2">
                  {hitlPause.buttons.map(btn => (
                    <button key={btn.value} onClick={() => handleHitlApprove(btn.value)}
                      className="px-4 py-2 rounded text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                      {btn.label}
                    </button>
                  ))}
                  {!hitlPause.buttons.some(b => b.value === 'rejected') && (
                    <button onClick={handleHitlReject}
                      className="px-4 py-2 rounded text-sm font-medium bg-white text-gray-600 border hover:bg-gray-50 transition-colors">
                      Reject
                    </button>
                  )}
                </div>
              </div>
            )}

            {finalOutput && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-800 mb-2">Final Output</h3>
                <pre className="text-xs whitespace-pre-wrap break-all text-green-900 max-h-48 overflow-y-auto">{JSON.stringify(finalOutput, null, 2)}</pre>
              </div>
            )}

            {error && !steps.some(s => s.error) && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-1">Execution Failed</h3>
                  <p className="text-xs text-red-600 font-mono break-all">{error}</p>
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

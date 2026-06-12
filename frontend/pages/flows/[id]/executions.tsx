import React from 'react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Loader2, ChevronRight,
  ChevronDown, ChevronUp, AlertTriangle, Zap, StopCircle
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Execution {
  id: string;
  flow_id: string;
  status: string;
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ExecutionStep {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  status: string;
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  'llm-agent': 'LLM Agent',
  'mcp-tool': 'MCP Tool',
  retriever: 'Retriever',
  branch: 'Condition',
  code: 'Code',
  output: 'Output',
};

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Failed' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Running' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Pending' },
  cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', label: 'Cancelled' },
};

type ViewMode = 'list' | 'detail';

export default function ExecutionHistoryPage() {
  const router = useRouter();
  const { id: flowId } = router.query;
  const [view, setView] = useState<ViewMode>('list');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancelExecution = async (executionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(executionId);
    try {
      await fetch(`${API_URL}/executions/${executionId}/cancel`, { method: 'POST' });
      const res = await fetch(`${API_URL}/flows/${flowId}/executions`);
      setExecutions(await res.json());
    } catch {
      // ignore
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    if (!flowId) return;
    fetch(`${API_URL}/flows/${flowId}/executions`)
      .then(function(r) { return r.json(); })
      .then(setExecutions)
      .catch(function() {})
      .finally(function() { setLoading(false); });
  }, [flowId]);

  const viewDetails = async function(executionId: string) {
    const exec = executions.find(function(e) { return e.id === executionId; });
    if (!exec) return;
    setSelectedExecution(exec);
    setView('detail');
    setExpandedSteps({});
    if (flowId) {
      const res = await fetch(`${API_URL}/flows/${flowId}/executions/${executionId}`);
      const data = await res.json();
      if (data.steps) setSteps(data.steps);
    }
  };

  const goBack = function() {
    setView('list');
    setSelectedExecution(null);
    setSteps([]);
  };

  const toggleStep = function(stepId: string) {
    setExpandedSteps(function(prev) {
      var next: Record<string, boolean> = {};
      var keys = Object.keys(prev);
      for (var i = 0; i < keys.length; i++) {
        next[keys[i]] = prev[keys[i]];
      }
      next[stepId] = !prev[stepId];
      return next;
    });
  };

  const formatTime = function(t: string | null) {
    if (!t) return '—';
    return new Date(t).toLocaleTimeString();
  };

  const formatDuration = function(start: string | null, end: string | null) {
    if (!start || !end) return null;
    var ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  };

  const truncate = function(s: string, n: number) {
    if (s.length > n) return s.slice(0, n) + '...';
    return s;
  };

  const renderContent = function(data: any) {
    if (!data) {
      return React.createElement('span', { className: 'text-gray-300 italic' }, 'empty');
    }
    if (typeof data === 'string') {
      return React.createElement('span', { className: 'text-gray-700 whitespace-pre-wrap' }, truncate(data, 500));
    }
    try {
      var s = JSON.stringify(data, null, 2);
      return React.createElement('pre', { className: 'text-xs whitespace-pre-wrap break-all text-gray-700 max-h-64 overflow-y-auto' }, s);
    } catch (e) {
      return React.createElement('span', { className: 'text-gray-500' }, String(data));
    }
  };

  // ── List View ───────────────────────────────────────────────

  if (view === 'list') {
    return React.createElement('div', { className: 'min-h-screen bg-gray-50' },
      React.createElement('div', { className: 'max-w-4xl mx-auto p-6' },
        React.createElement('div', { className: 'flex items-center gap-3 mb-6' },
          React.createElement(Link, { href: '/', className: 'text-gray-400 hover:text-gray-600' },
            React.createElement(ArrowLeft, { className: 'w-4 h-4' })
          ),
          React.createElement('div', { className: 'flex-1' },
            React.createElement('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Execution History'),
            React.createElement('p', { className: 'text-sm text-gray-500 mt-1' }, 'Debug trace of every flow run')
          )
        ),
        loading
          ? React.createElement('p', { className: 'text-gray-500 text-sm' }, 'Loading...')
          : executions.length === 0
            ? React.createElement('div', { className: 'text-center py-16 bg-white rounded-xl border' },
                React.createElement(Zap, { className: 'w-12 h-12 text-gray-300 mx-auto mb-3' }),
                React.createElement('p', { className: 'text-gray-400 mb-1' }, 'No executions yet'),
                React.createElement('p', { className: 'text-xs text-gray-400' }, 'Run this flow to see debug traces here')
              )
            : React.createElement('div', { className: 'space-y-2' },
                executions.map(function(exec) {
                  var cfg = statusConfig[exec.status] || statusConfig.pending;
                  var StatusIcon = cfg.icon;
                  var dur = formatDuration(exec.started_at, exec.completed_at);
                  return React.createElement('div', {
                    key: exec.id,
                    onClick: function() { viewDetails(exec.id); },
                    className: 'w-full bg-white rounded-lg border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow text-left cursor-pointer'
                  },
                    React.createElement('div', { className: 'p-2 rounded-full ' + cfg.bg },
                      React.createElement(StatusIcon, { className: 'w-5 h-5 ' + cfg.color + (exec.status === 'running' ? ' animate-spin' : '') })
                    ),
                    React.createElement('div', { className: 'flex-1 min-w-0' },
                      React.createElement('div', { className: 'flex items-center gap-2' },
                        React.createElement('span', { className: 'text-xs px-1.5 py-0.5 rounded-full capitalize font-medium ' + cfg.bg + ' ' + cfg.color }, cfg.label),
                        dur ? React.createElement('span', { className: 'text-xs text-gray-400' }, dur) : null
                      ),
                      React.createElement('p', { className: 'text-xs text-gray-400 mt-1' }, formatTime(exec.created_at)),
                      exec.error ? React.createElement('p', { className: 'text-xs text-red-500 mt-1 truncate font-mono' }, truncate(exec.error, 80)) : null
                    ),
                    React.createElement('div', { className: 'flex items-center gap-2' },
                      exec.status === 'running'
                        ? React.createElement('button', {
                            onClick: function(e: any) { cancelExecution(exec.id, e); },
                            disabled: cancelling === exec.id,
                            className: 'flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50 transition-colors shrink-0'
                          },
                            React.createElement(StopCircle, { className: 'w-3 h-3' }),
                            cancelling === exec.id ? '...' : 'Stop'
                          )
                        : null,
                      React.createElement('div', { className: 'hidden sm:block text-[10px] text-gray-400 max-w-[150px] truncate font-mono' }, 'ID: ' + truncate(exec.id, 8)),
                      React.createElement(ChevronRight, { className: 'w-4 h-4 text-gray-300 shrink-0' })
                    )
                  );
                })
              )
      )
    );
  }

  // ── Detail View (Debug Trace) ─────────────────────────────────

  var cfg = selectedExecution ? statusConfig[selectedExecution.status] || statusConfig.pending : statusConfig.pending;
  var StatusIcon = cfg.icon;
  var totalDur = selectedExecution ? formatDuration(selectedExecution.started_at, selectedExecution.completed_at) : null;

  return React.createElement('div', { className: 'min-h-screen bg-gray-50' },
    React.createElement('div', { className: 'max-w-4xl mx-auto p-6' },
      React.createElement('div', { className: 'flex items-center gap-3 mb-6' },
        React.createElement('button', { onClick: goBack, className: 'text-gray-400 hover:text-gray-600' },
          React.createElement(ArrowLeft, { className: 'w-4 h-4' })
        ),
        React.createElement('div', { className: 'flex-1' },
          React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Debug Trace'),
            selectedExecution
              ? React.createElement('span', { className: 'text-xs px-2 py-0.5 rounded-full capitalize font-medium ' + cfg.bg + ' ' + cfg.color }, cfg.label)
              : null
          ),
          selectedExecution
            ? React.createElement('p', { className: 'text-sm text-gray-500 mt-1' },
                formatTime(selectedExecution.created_at),
                totalDur ? React.createElement('span', { className: 'ml-2 text-gray-400' }, '· Duration: ' + totalDur) : null
              )
            : null
        ),
        flowId
          ? React.createElement(Link, { href: '/flows/' + (flowId as string) + '/edit', className: 'text-xs text-blue-600 hover:text-blue-700 font-medium' }, 'Open Flow Editor')
          : null
      ),
      selectedExecution && selectedExecution.error
        ? React.createElement('div', { className: 'bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3' },
            React.createElement(AlertTriangle, { className: 'w-5 h-5 text-red-500 shrink-0 mt-0.5' }),
            React.createElement('div', { className: 'min-w-0' },
              React.createElement('h3', { className: 'text-sm font-semibold text-red-700 mb-1' }, 'Execution Failed'),
              React.createElement('p', { className: 'text-xs text-red-600 font-mono break-all' }, selectedExecution.error)
            )
          )
        : null,
      steps.length === 0 && selectedExecution
        ? React.createElement('div', { className: 'text-center py-12 bg-white rounded-xl border' },
            React.createElement(Clock, { className: 'w-8 h-8 text-gray-300 mx-auto mb-2' }),
            React.createElement('p', { className: 'text-sm text-gray-400' }, 'No step data recorded')
          )
        : steps.length > 0
          ? React.createElement('div', null,
              React.createElement('h2', { className: 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4' }, 'Step Trace (' + steps.length + ' steps)'),
              React.createElement('div', { className: 'space-y-2' },
                steps.map(function(step, i) {
                  var stepCfg = statusConfig[step.status] || statusConfig.pending;
                  var StepIcon = stepCfg.icon;
                  var stepDur = formatDuration(step.started_at, step.completed_at);
                  var nodeLabel = NODE_LABELS[step.node_type] || step.node_type;
                  var isExpanded = expandedSteps[step.id] || false;
                  var hasDetails = step.input || step.output || step.error;
                  var isLLM = step.node_type === 'llm-agent';
                  return React.createElement('div', { key: step.id, className: 'bg-white rounded-lg border overflow-hidden' },
                    React.createElement('button', {
                      onClick: function() { toggleStep(step.id); },
                      className: 'w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors'
                    },
                      step.status === 'running' ? React.createElement(Loader2, { className: 'w-4 h-4 text-blue-500 animate-spin shrink-0' }) : null,
                      step.status === 'completed' ? React.createElement(CheckCircle, { className: 'w-4 h-4 text-green-500 shrink-0' }) : null,
                      step.status === 'failed' ? React.createElement(XCircle, { className: 'w-4 h-4 text-red-500 shrink-0' }) : null,
                      step.status === 'pending' ? React.createElement(Clock, { className: 'w-4 h-4 text-yellow-500 shrink-0' }) : null,
                      React.createElement('div', { className: 'flex-1 min-w-0' },
                        React.createElement('div', { className: 'flex items-center gap-2' },
                          React.createElement('span', { className: 'text-sm font-medium text-gray-900' }, nodeLabel),
                          step.node_id ? React.createElement('span', { className: 'text-[10px] text-gray-400 font-mono' }, truncate(step.node_id, 12)) : null
                        ),
                        React.createElement('div', { className: 'flex items-center gap-2 mt-0.5' },
                          React.createElement('span', { className: 'text-[10px] px-1 rounded capitalize ' + stepCfg.bg + ' ' + stepCfg.color }, stepCfg.label),
                          stepDur ? React.createElement('span', { className: 'text-[10px] text-gray-400' }, stepDur) : null,
                          step.started_at ? React.createElement('span', { className: 'text-[10px] text-gray-400' }, formatTime(step.started_at)) : null
                        )
                      ),
                      step.error ? React.createElement(AlertTriangle, { className: 'w-4 h-4 text-red-500 shrink-0' }) : null,
                      hasDetails
                        ? isExpanded
                          ? React.createElement(ChevronUp, { className: 'w-4 h-4 text-gray-400 shrink-0' })
                          : React.createElement(ChevronDown, { className: 'w-4 h-4 text-gray-400 shrink-0' })
                        : null
                    ),
                    isExpanded && hasDetails
                      ? React.createElement('div', { className: 'border-t bg-gray-50/50 p-4 space-y-3' },
                          step.error
                            ? React.createElement('div', { className: 'flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2' },
                                React.createElement(AlertTriangle, { className: 'w-3 h-3 text-red-500 mt-0.5 shrink-0' }),
                                React.createElement('span', { className: 'text-xs text-red-700 font-mono break-all' }, step.error)
                              )
                            : null,
                          isLLM && step.input && (step.input as any).systemPrompt
                            ? React.createElement('div', null,
                                React.createElement('h4', { className: 'text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1' }, 'System Prompt'),
                                React.createElement('pre', { className: 'text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto' }, (step.input as any).systemPrompt)
                              )
                            : null,
                          step.input && !isLLM
                            ? React.createElement('div', null,
                                React.createElement('h4', { className: 'text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1' }, 'Input'),
                                React.createElement('pre', { className: 'text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto' }, JSON.stringify(step.input, null, 2))
                              )
                            : null,
                          step.output
                            ? React.createElement('div', null,
                                React.createElement('h4', { className: 'text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1' }, isLLM ? 'LLM Response' : 'Output'),
                                isLLM && typeof (step.output as any).content === 'string'
                                  ? React.createElement('div', { className: 'text-xs text-gray-800 whitespace-pre-wrap break-all bg-green-50/50 rounded p-2 border border-green-100' }, (step.output as any).content)
                                  : React.createElement('pre', { className: 'text-xs bg-white border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto' }, JSON.stringify(step.output, null, 2))
                              )
                            : null
                        )
                      : null
                  );
                })
              ),
              selectedExecution && selectedExecution.output
                ? React.createElement('div', { className: 'mt-6 bg-white rounded-lg border p-4' },
                    React.createElement('h3', { className: 'text-sm font-semibold text-gray-900 mb-2' }, 'Final Output'),
                    React.createElement('pre', { className: 'text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all' }, JSON.stringify(selectedExecution.output, null, 2))
                  )
                : null
            )
          : null
    )
  );
}

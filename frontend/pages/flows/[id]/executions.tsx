import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, ChevronRight } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Execution {
  id: string;
  flow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

type ViewMode = 'list' | 'detail';

const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  cancelled: { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

export default function ExecutionHistoryPage() {
  const router = useRouter();
  const { id: flowId } = router.query;
  const [view, setView] = useState<ViewMode>('list');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch execution list
  useEffect(() => {
    if (!flowId) return;
    fetch(`${API_URL}/flows/${flowId}/executions`)
      .then(r => r.json())
      .then(setExecutions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flowId]);

  const viewDetails = async (executionId: string) => {
    const exec = executions.find(e => e.id === executionId);
    if (!exec) return;

    setSelectedExecution(exec);
    setView('detail');

    if (flowId) {
      const res = await fetch(`${API_URL}/flows/${flowId}/executions/${executionId}`);
      const data = await res.json();
      if (data.steps) setSteps(data.steps);
    }
  };

  const goBack = () => {
    setView('list');
    setSelectedExecution(null);
    setSteps([]);
  };

  const formatTime = (t: string | null) => {
    if (!t) return '—';
    return new Date(t).toLocaleString();
  };

  const previewJSON = (data: any) => {
    if (!data) return '—';
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > 120 ? str.slice(0, 120) + '...' : str;
  };

  // ── List View ───────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/flows" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Execution History</h1>
              <p className="text-sm text-gray-500 mt-1">Past runs of this flow</p>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : executions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">No executions yet</p>
              <p className="text-xs text-gray-400">Run this flow to see execution history here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map(exec => {
                const cfg = statusConfig[exec.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                return (
                  <button
                    key={exec.id}
                    onClick={() => viewDetails(exec.id)}
                    className="w-full bg-white rounded-lg border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow text-left"
                  >
                    <div className={`p-2 rounded-full ${cfg.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${cfg.color} ${exec.status === 'running' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize text-gray-900">{exec.status}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${cfg.bg} ${cfg.color}`}>
                          {exec.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Started: {formatTime(exec.started_at)}
                        {exec.completed_at && ` · Completed: ${formatTime(exec.completed_at)}`}
                      </p>
                      {exec.error && (
                        <p className="text-xs text-red-500 mt-1 truncate">{exec.error}</p>
                      )}
                    </div>
                    <div className="hidden sm:block text-xs text-gray-400 max-w-[200px] truncate">
                      Input: {previewJSON(exec.input)}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Detail View ─────────────────────────────────────────────

  const cfg = selectedExecution ? statusConfig[selectedExecution.status] || statusConfig.pending : statusConfig.pending;
  const StatusIcon = cfg.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Execution Details</h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedExecution ? formatTime(selectedExecution.created_at) : ''}
            </p>
          </div>
        </div>

        {selectedExecution && (
          <>
            {/* Status Banner */}
            <div className={`rounded-lg border p-4 mb-6 ${cfg.bg}`}>
              <div className="flex items-center gap-3">
                <StatusIcon className={`w-6 h-6 ${cfg.color} ${selectedExecution.status === 'running' ? 'animate-spin' : ''}`} />
                <div>
                  <p className={`font-semibold capitalize ${cfg.color}`}>{selectedExecution.status}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Started: {formatTime(selectedExecution.started_at)}
                    {selectedExecution.completed_at && ` · Completed: ${formatTime(selectedExecution.completed_at)}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Input / Output */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Input</h3>
                <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
                  {JSON.stringify(selectedExecution.input, null, 2)}
                </pre>
              </div>
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Output</h3>
                <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
                  {selectedExecution.output
                    ? JSON.stringify(selectedExecution.output, null, 2)
                    : selectedExecution.error
                    ? <span className="text-red-500">{selectedExecution.error}</span>
                    : '—'}
                </pre>
              </div>
            </div>

            {/* Error */}
            {selectedExecution.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-red-700 mb-1">Error</h3>
                <p className="text-xs text-red-600 font-mono">{selectedExecution.error}</p>
              </div>
            )}

            {/* Steps */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Steps ({steps.length})
              </h2>
              {steps.length === 0 ? (
                <p className="text-sm text-gray-400">No step data available</p>
              ) : (
                <div className="space-y-2">
                  {steps.map(step => {
                    const stepCfg = statusConfig[step.status] || statusConfig.pending;
                    const StepIcon = stepCfg.icon;
                    return (
                      <div key={step.id} className="bg-white rounded-lg border p-4">
                        <div className="flex items-center gap-3">
                          <StepIcon className={`w-4 h-4 ${stepCfg.color} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{step.node_id}</span>
                              <span className="text-xs text-gray-400">{step.node_type}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${stepCfg.bg} ${stepCfg.color}`}>
                                {step.status}
                              </span>
                            </div>
                            {step.error && (
                              <p className="text-xs text-red-500 mt-1">{step.error}</p>
                            )}
                          </div>
                        </div>
                        {(step.input || step.output) && (
                          <div className="mt-2 ml-7 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {step.input && (
                              <div>
                                <p className="text-[10px] font-medium text-gray-400 mb-1">Input</p>
                                <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-auto max-h-24">
                                  {JSON.stringify(step.input, null, 2)}
                                </pre>
                              </div>
                            )}
                            {step.output && (
                              <div>
                                <p className="text-[10px] font-medium text-gray-400 mb-1">Output</p>
                                <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-auto max-h-24">
                                  {JSON.stringify(step.output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

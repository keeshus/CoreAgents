import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Loader2, AlertCircle,
  ChevronRight, Zap, StopCircle
} from 'lucide-react';

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

const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  cancelled: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
};

export default function GlobalExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/executions`);
      setExecutions(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExecutions(); }, []);

  // Auto-refresh when there are running executions
  useEffect(() => {
    if (!executions.some(e => e.status === 'running')) return;
    const interval = setInterval(fetchExecutions, 3000);
    return () => clearInterval(interval);
  }, [executions]);

  const handleCancel = async (executionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelling(executionId);
    try {
      await fetch(`${API_URL}/executions/${executionId}/cancel`, { method: 'POST' });
      fetchExecutions();
    } catch {} finally {
      setCancelling(null);
    }
  };

  const formatTime = (t: string | null) => t ? new Date(t).toLocaleTimeString() : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/flows" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">All Executions</h1>
            <p className="text-sm text-gray-500 mt-1">Every flow run across all agents</p>
          </div>
          <button onClick={fetchExecutions} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Refresh</button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : executions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No executions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {executions.map(exec => {
              const cfg = statusConfig[exec.status] || statusConfig.pending;
              const Icon = cfg.icon;
              return (
                <div key={exec.id} className={`bg-white rounded-lg border p-4 ${cfg.bg}`}>
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${cfg.color} ${exec.status === 'running' ? 'animate-spin' : ''} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 capitalize">{exec.status}</span>
                        <Link href={`/flows/${exec.flow_id}/edit`} className="text-xs text-blue-600 hover:underline font-mono">
                          {exec.flow_id.slice(0, 8)}...
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                        <span>Started: {formatTime(exec.started_at)}</span>
                        {exec.completed_at && <span>· Done: {formatTime(exec.completed_at)}</span>}
                      </div>
                      {exec.error && (
                        <p className="text-xs text-red-600 mt-1 font-mono truncate">{exec.error}</p>
                      )}
                      {exec.output && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Output</summary>
                          <pre className="text-[10px] bg-gray-50 p-2 rounded mt-1 overflow-auto max-h-32">{JSON.stringify(exec.output, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {exec.status === 'running' && (
                        <button
                          onClick={(e) => handleCancel(exec.id, e)}
                          disabled={cancelling === exec.id}
                          className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          <StopCircle className="w-3 h-3" />
                          {cancelling === exec.id ? '...' : 'Stop'}
                        </button>
                      )}
                      <Link
                        href={`/flows/${exec.flow_id}/executions`}
                        className="p-1.5 text-gray-400 hover:text-gray-600"
                        title="View details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

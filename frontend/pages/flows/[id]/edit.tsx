import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { NodeCatalog } from '@/components/flow/NodeCatalog';
import { ExecutionPanel } from '@/components/flow/ExecutionPanel';
import { Save, ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';

export default function FlowEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const [flow, setFlow] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const addNodeRef = useRef<((type: string, defaultConfig: Record<string, any>) => void) | null>(null);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      api.flows.get(id as string).then((f) => {
        setFlow(f);
        setNodes(f.nodes || []);
        setEdges(f.edges || []);
      }).finally(() => setLoading(false));
    }
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!flow) return;
    setSaving(true);
    try {
      const updated = await api.flows.update(flow.id, {
        ...flow,
        nodes,
        edges,
      });
      setFlow(updated);
    } finally {
      setSaving(false);
    }
  }, [flow, nodes, edges]);

  const handleAddNode = useCallback((type: string, defaultConfig: Record<string, any>) => {
    addNodeRef.current?.(type, defaultConfig);
  }, []);

  const handleRun = async () => {
    setEvents([]);
    setOutput(null);
    setError(null);
    setIsRunning(true);

    try {
      const eventStream = api.flows.executeStream(flow.id, {
        message: 'Hello! This is a test execution.',
      });

      for await (const event of eventStream) {
        setEvents((prev) => [...prev, event]);

        if (event.type === 'execution.completed') {
          setOutput(event.data.output);
        }
        if (event.type === 'execution.failed') {
          setError(event.data.error || 'Execution failed');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Execution error');
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading flow...</div>;
  if (!flow) return <div className="flex items-center justify-center h-screen text-gray-500">Flow not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/flows" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
          <input
            className="text-sm font-semibold border-none outline-none bg-transparent"
            value={flow.name}
            onChange={(e) => setFlow({ ...flow, name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Manage LLM endpoints & MCP servers">
            <Settings className="w-4 h-4" />
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <NodeCatalog onAddNode={handleAddNode} />
        <div className="flex-1">
          <FlowEditor
            initialNodes={nodes}
            initialEdges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            addNodeCallbackRef={addNodeRef}
          />
        </div>
        <ExecutionPanel
          isRunning={isRunning}
          onRun={handleRun}
          events={events}
          output={output}
          error={error}
        />
      </div>
    </div>
  );
}

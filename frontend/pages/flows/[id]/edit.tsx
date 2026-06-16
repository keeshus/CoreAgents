import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { FlowEditor } from '@/components/flow/FlowEditor';
import { NodeCatalog } from '@/components/flow/NodeCatalog';
import { NodeConfigModal } from '@/components/flow/NodeConfigModal';
import { DebugOverlay } from '@/components/flow/DebugOverlay';
import { Save, ArrowLeft, Settings, Bug, History } from 'lucide-react';
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
  const setNodeDataRef = useRef<((nodeId: string, config: Record<string, any>) => void) | null>(null);
  const deleteNodeRef = useRef<((nodeId: string) => void) | null>(null);
  const setNodeLabelRef = useRef<((nodeId: string, label: string) => void) | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Selected node for config editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      api.flows.get(id as string).then((f) => {
        setFlow(f);
        // Sort: parallel nodes first (parent before children)
        const raw = f.nodes || [];
        const ordered = [...raw.filter((n: any) => n.type === 'parallel'), ...raw.filter((n: any) => n.type !== 'parallel')];
        setNodes(ordered);
        setEdges(f.edges || []);
      }).finally(() => setLoading(false));
    }
  }, [id]);

  // Auto-open debug overlay from ?debug=1
  useEffect(() => {
    if (router.query.debug === '1') setShowDebug(true);
  }, [router.query.debug]);

  const handleSave = useCallback(async () => {
    if (!flow) return;
    setSaving(true);
    try {
      // Sync child nodes into parallel node configs, ensure parent nodes come first
      const syncedNodes = nodes.map(n => {
        if (n.type === 'parallel') {
          const children = nodes.filter(c => c.parentId === n.id);
          return { ...n, data: { ...n.data, config: { ...n.data.config, subNodes: children } } };
        }
        return n;
      });
      // Sort: parallel nodes first, then children, then others
      const ordered = [...syncedNodes.filter(n => n.type === 'parallel'), ...syncedNodes.filter(n => n.type !== 'parallel')];

      const updated = await api.flows.update(flow.id, {
        ...flow,
        nodes: ordered,
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

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    deleteNodeRef.current?.(selectedNodeId);
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleConfigChange = useCallback((newConfig: Record<string, any>) => {
    if (!selectedNodeId) return;
    // Apply immediately to FlowEditor via ref
    setNodeDataRef.current?.(selectedNodeId, newConfig);
    // Also update parent state for save
    setNodes((prev) => prev.map((n) =>
      n.id === selectedNodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, ...newConfig } } }
        : n
    ));
  }, [selectedNodeId]);

  const handleLabelChange = useCallback((label: string) => {
    if (!selectedNodeId) return;
    setNodeLabelRef.current?.(selectedNodeId, label);
    setNodes((prev: any[]) => prev.map((n: any) =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, label } } : n
    ));
  }, [selectedNodeId]);

  const abortRef = useRef<AbortController | null>(null);

  const handleRun = async (inputStr: string) => {
    setEvents([]);
    setOutput(null);
    setError(null);
    setSelectedNodeId(null);
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let input: any;
    try { input = JSON.parse(inputStr); } catch { input = { message: inputStr }; }

    try {
      const eventStream = api.flows.executeStream(flow.id, input, controller.signal);

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
      if (err?.name !== 'AbortError') {
        setError(err.message || 'Execution error');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading flow...</div>;
  if (!flow) return <div className="flex items-center justify-center h-screen text-gray-500">Flow not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b bg-white flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <input className="text-sm font-semibold border-none outline-none bg-transparent block" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} placeholder="Flow name" />
            <input className="text-xs text-gray-500 border-none outline-none bg-transparent block mt-0.5 w-64" value={flow.description || ''} onChange={(e) => setFlow({ ...flow, description: e.target.value })} placeholder="Add a description..." />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Manage LLM endpoints & MCP servers">
            <Settings className="w-4 h-4" />
          </Link>
          <Link
            href={`/flows/${flow.id}/executions`}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Execution history & debug traces"
          >
            <History className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setShowDebug(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
            title="Debug run — trace execution step by step"
          >
            <Bug className="w-3 h-3" /> Debug
          </button>
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
            setNodeDataCallbackRef={setNodeDataRef}
            deleteNodeCallbackRef={deleteNodeRef}
            setNodeLabelRef={setNodeLabelRef}
            onNodeClick={handleNodeClick}
          />
        </div>

        {selectedNode && (
          <NodeConfigModal
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            flowId={flow.id}
            onConfigChange={handleConfigChange}
            onLabelChange={handleLabelChange}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Debug overlay */}
      {showDebug && flow && (
        <DebugOverlay flowId={flow.id} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
}

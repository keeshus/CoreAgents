import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type OnConnect,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriggerNode } from './nodes/TriggerNode';
import { LLMAgentNode } from './nodes/LLMAgentNode';
import { MCPToolNode } from './nodes/MCPToolNode';
import { RetrieverNode } from './nodes/RetrieverNode';
import { BranchNode } from './nodes/BranchNode';
import { CodeNode } from './nodes/CodeNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes = {
  trigger: TriggerNode,
  'llm-agent': LLMAgentNode,
  'mcp-tool': MCPToolNode,
  retriever: RetrieverNode,
  branch: BranchNode,
  code: CodeNode,
  output: OutputNode,
};

interface FlowEditorProps {
  initialNodes?: any[];
  initialEdges?: any[];
  onNodesChange?: (nodes: any[]) => void;
  onEdgesChange?: (edges: any[]) => void;
  addNodeCallbackRef?: React.MutableRefObject<((type: string, defaultConfig: Record<string, any>) => void) | null>;
  setNodeDataCallbackRef?: React.MutableRefObject<((nodeId: string, config: Record<string, any>) => void) | null>;
  deleteNodeCallbackRef?: React.MutableRefObject<((nodeId: string) => void) | null>;
  onNodeClick?: (nodeId: string, nodeData: any) => void;
}

export function FlowEditor({ initialNodes = [], initialEdges = [], onNodesChange, onEdgesChange, addNodeCallbackRef, setNodeDataCallbackRef, deleteNodeCallbackRef, onNodeClick }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const onNodesChangeRef = useRef(onNodesChange);
  const onEdgesChangeRef = useRef(onEdgesChange);
  onNodesChangeRef.current = onNodesChange;
  onEdgesChangeRef.current = onEdgesChange;

  // Propagate changes back to parent (debounced via requestAnimationFrame)
  const syncRef = useRef<number | null>(null);
  useEffect(() => {
    if (syncRef.current) cancelAnimationFrame(syncRef.current);
    syncRef.current = requestAnimationFrame(() => {
      onNodesChangeRef.current?.(nodes);
      onEdgesChangeRef.current?.(edges);
    });
  }, [nodes, edges]);

  const addNode = useCallback((type: string, defaultConfig: Record<string, any>) => {
    const newNode: Node = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      position: {
        x: 150 + Math.random() * 300,
        y: 100 + Math.random() * 200,
      },
      data: { label: type, type, config: { ...defaultConfig } },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  // Expose addNode to parent via ref
  useEffect(() => {
    if (addNodeCallbackRef) {
      addNodeCallbackRef.current = addNode;
    }
  }, [addNode, addNodeCallbackRef]);

  // Expose setNodeData to parent via ref — updates a node's config in-place
  const setNodeData = useCallback((nodeId: string, config: Record<string, any>) => {
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
        : n
    ));
  }, [setNodes]);

  useEffect(() => {
    if (setNodeDataCallbackRef) {
      setNodeDataCallbackRef.current = setNodeData;
    }
  }, [setNodeData, setNodeDataCallbackRef]);

  // Expose deleteNode to parent via ref
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (deleteNodeCallbackRef) {
      deleteNodeCallbackRef.current = deleteNode;
    }
  }, [deleteNode, deleteNodeCallbackRef]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <ReactFlowProvider>
      <div className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeInternal}
          onEdgesChange={onEdgesChangeInternal}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeClick={(_event, node) => onNodeClick?.(node.id, node.data)}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

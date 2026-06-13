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
import { ParallelNode } from './nodes/ParallelNode';

const nodeTypes = {
  trigger: TriggerNode,
  'llm-agent': LLMAgentNode,
  'mcp-tool': MCPToolNode,
  retriever: RetrieverNode,
  branch: BranchNode,
  code: CodeNode,
  output: OutputNode,
  parallel: ParallelNode,
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

  // Auto-size parallel nodes + snap children
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map(n => {
        if (n.type === 'parallel') {
          const children = nds.filter(c => c.parentId === n.id);
          if (children.length === 0) return n;
          // Calculate bounding box of children (relative to parent)
          const minX = Math.min(...children.map(c => c.position.x));
          const maxY = Math.max(...children.map(c => c.position.y + (c.measured?.height || 80)));
          const newWidth = Math.max(300, minX + Math.max(...children.map(c => c.position.x + (c.measured?.width || 200))) + 40);
          const newHeight = Math.max(180, maxY + 60);
          if (n.style?.width !== newWidth || n.style?.height !== newHeight) {
            changed = true;
            return { ...n, style: { ...n.style, width: newWidth, height: newHeight } };
          }
        }
        return n;
      });
      return changed ? updated : nds;
    });
  }, [nodes]);

  // Snap children inside parallel nodes — left-aligned, stacked vertically
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((n, _i, all) => {
        if (!n.parentId) return n;
        const siblings = all
          .filter(c => c.parentId === n.parentId && c.id !== n.id)
          .sort((a, b) => a.position.y - b.position.y);
        // Find this node's index among siblings
        const idx = siblings.filter(s => s.position.y < n.position.y).length;
        const targetY = 20 + idx * 100;
        const targetX = 30;
        if (n.position.x !== targetX || Math.abs(n.position.y - targetY) > 80) {
          changed = true;
          return { ...n, position: { x: targetX, y: targetY } };
        }
        return n;
      });
      return changed ? updated : nds;
    });
  }, [nodes]);

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
          onNodeDragStop={(_event, node) => {
            const parallels = nodes.filter(n => n.type === 'parallel' && n.id !== node.id);
            for (const p of parallels) {
              const pw = (p.measured?.width || 300) as number;
              const ph = (p.measured?.height || 200) as number;
              const px = p.position.x;
              const py = p.position.y;
              // Check if the node's CENTER is inside the parallel bounds
              const cx = node.position.x + ((node.measured?.width || 200) as number) / 2;
              const cy = node.position.y + ((node.measured?.height || 80) as number) / 2;
              if (cx >= px && cx <= px + pw && cy >= py && cy <= py + ph) {
                setNodes(nds => {
                  // Ensure parallel nodes come first in array
                  const updated = nds.map(n => n.id === node.id ? { ...n, parentId: p.id, extent: 'parent' as any } : n);
                  const parallels = updated.filter(n => n.type === 'parallel');
                  const children = updated.filter(n => n.type !== 'parallel');
                  return [...parallels, ...children];
                });
                break;
              }
            }
          }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

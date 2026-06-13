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

  // Auto-size parallel nodes based on children
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map(n => {
        if (n.type !== 'parallel') return n;
        const children = nds.filter(c => c.parentId === n.id);
        const hasChildren = children.length > 0;
        // Default size when empty
        if (!hasChildren) {
          if (n.style?.width !== 320 || n.style?.height !== 240) {
            return { ...n, style: { ...n.style, width: 320, height: 240 } };
          }
          return n;
        }
        // Calculate required size from children's relative positions
        const maxRight = Math.max(...children.map(c => {
          const cw = c.measured?.width || c.width || 200;
          return (c.position.x || 0) + Number(cw);
        }));
        const maxBottom = Math.max(...children.map(c => {
          const ch = c.measured?.height || c.height || 80;
          return (c.position.y || 0) + Number(ch);
        }));
        const newW = Math.max(320, maxRight + 80);
        const newH = Math.max(240, maxBottom + 80);
        const oldW = (n.style?.width || n.width) as number || 300;
        const oldH = (n.style?.height || n.height) as number || 200;
        if (Math.abs(Number(oldW) - newW) > 10 || Math.abs(Number(oldH) - newH) > 10) {
          changed = true;
          return { ...n, style: { ...n.style, width: newW, height: newH } };
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
        // Get all siblings including self, sorted by position
        const siblings = all
          .filter(c => c.parentId === n.parentId)
          .sort((a, b) => a.position.y - b.position.y);
        const idx = siblings.findIndex(s => s.id === n.id);
        if (idx < 0) return n;
        const targetY = 50 + idx * 100;
        const targetX = 20;
        if (n.position.x !== targetX || Math.abs(n.position.y - targetY) > 40) {
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
            if (node.parentId) {
              // Check if dragged outside parent bounds — if so, detach
              const parent = nodes.find(n => n.id === node.parentId);
              if (parent) {
                const pw = (parent.style?.width || parent.width || 300) as number;
                const ph = (parent.style?.height || parent.height || 200) as number;
                // Node position is relative to parent, so check against (0,0) to (pw,ph)
                if (node.position.x < -50 || node.position.x > pw + 50 || node.position.y < -50 || node.position.y > ph + 50) {
                  setNodes(nds => nds.map(n => n.id === node.id
                    ? { ...n, parentId: undefined, position: { x: parent.position.x + 50, y: parent.position.y + Number(ph) + 40 } }
                    : n
                  ));
                  return;
                }
              }
            } else {
              // Check if dropped inside a parallel node
              const parallels = nodes.filter(n => n.type === 'parallel' && n.id !== node.id);
              for (const p of parallels) {
                const pw = (p.style?.width || p.width || 300) as number;
                const ph = (p.style?.height || p.height || 200) as number;
                const px = p.position.x;
                const py = p.position.y;
                const cx = node.position.x + ((node.measured?.width || 200) as number) / 2;
                const cy = node.position.y + ((node.measured?.height || 80) as number) / 2;
                if (cx >= px && cx <= px + pw && cy >= py && cy <= py + ph) {
                  setNodes(nds => {
                    const updated = nds.map(n => n.id === node.id ? { ...n, parentId: p.id, position: { x: 20, y: 50 } } : n);
                    const pars = updated.filter(n => n.type === 'parallel');
                    const others = updated.filter(n => n.type !== 'parallel');
                    return [...pars, ...others];
                  });
                  break;
                }
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

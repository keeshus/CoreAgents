import { type NodeProps, useReactFlow, useStore } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

export function ParallelNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  // Count children by parentId from the live node store
  const childCount = useStore((s) =>
    s.nodes.filter((n: any) => n.parentId === props.id).length
  );
  const count = childCount || (config?.subNodes || []).length;
  const w = (props as any).width || (props as any).style?.width || 320;
  const h = (props as any).height || (props as any).style?.height || 240;

  return (
    <div
      style={{ width: Number(w), height: Number(h), overflow: 'visible' }}
      className={`rounded-xl border-2 border-dashed bg-secondary-container/30 flex flex-col ${
        props.selected ? 'border-secondary bg-secondary-container/50 shadow-m3-4' : 'border-secondary-container'
      }`}
    >
      <Handle type="target" position={Position.Left} id="input-0" className="!bg-secondary !z-50" />
      <Handle type="source" position={Position.Right} id="output-0" className="!bg-secondary !z-50" />

      <div className="px-3 py-2 border-b border-secondary-container bg-secondary-container/50 shrink-0">
        <span className="text-sm font-semibold text-on-secondary-container">{(props.data?.label as string) || 'Parallel'}</span>
        <span className="ml-2 text-[10px] text-secondary">
          {count > 0 ? `${count} node${count !== 1 ? 's' : ''}` : 'empty'}
        </span>
      </div>

      <div className="flex-1">
        {count === 0 && (
          <div className="text-center pt-12 px-4">
            <p className="text-xs text-on-secondary-container">Drop LLM Agent nodes here</p>
            <p className="text-[9px] text-secondary mt-1">Only LLM Agent nodes are supported inside Parallel containers</p>
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-secondary-container bg-secondary-container/30 shrink-0">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">
          {'{ merged outputs }'}
        </span>
        <span className="text-[9px] text-on-secondary-container ml-1">→ next node</span>
      </div>
    </div>
  );
}

import { type NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

export function ParallelNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const count = (config?.subNodes || []).length;

  return (
    <div className={`rounded-xl border-2 border-dashed min-w-[280px] min-h-[180px] bg-purple-50/30 ${
      props.selected ? 'border-purple-500 bg-purple-50/50 shadow-lg' : 'border-purple-300'
    }`}>
      {/* Input handle */}
      <Handle type="target" position={Position.Left} id="input-0" className="!bg-purple-500" />
      {/* Output handle */}
      <Handle type="source" position={Position.Right} id="output-0" className="!bg-purple-500" />

      {/* Header */}
      <div className="px-3 py-2 border-b border-purple-200 bg-purple-100/50 rounded-t-xl">
        <span className="text-sm font-semibold text-purple-800">Parallel</span>
        <span className="ml-2 text-[10px] text-purple-500">
          {count > 0 ? `${count} sub-node${count !== 1 ? 's' : ''}` : 'Drop nodes here'}
        </span>
      </div>

      {/* Drop zone */}
      <div className="p-4 min-h-[120px] flex items-center justify-center">
        {count === 0 && (
          <p className="text-xs text-purple-400 text-center">
            Drag nodes from the catalog into this area.<br />
            They will run in parallel with the same input.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-purple-200 bg-purple-100/30 rounded-b-xl">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-200 text-purple-700">
          {'{ merged outputs }'}
        </span>
        <span className="text-[9px] text-purple-400 ml-1">→ next node</span>
      </div>
    </div>
  );
}

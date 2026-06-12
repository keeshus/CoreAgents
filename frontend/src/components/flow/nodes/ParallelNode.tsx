import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function ParallelNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const count = (config?.subNodes || []).length;
  return (
    <BaseNode label="Parallel" nodeType="parallel" category="processing" selected={props.selected || false} inputs={1} outputs={1}>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Runs {count > 0 ? `${count} sub-node${count !== 1 ? 's' : ''}` : 'no sub-nodes'} concurrently</p>
        <p className="text-[10px] text-purple-500">Results merged into output</p>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">{'{ merged outputs }'}</span>
        <span className="text-[9px] text-gray-400 ml-1">→ next node</span>
      </div>
    </BaseNode>
  );
}

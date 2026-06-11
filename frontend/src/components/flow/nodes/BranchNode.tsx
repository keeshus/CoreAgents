import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function BranchNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const outputLabels = config?.outputLabels || ['true', 'false'];
  return (
    <BaseNode label="Branch" nodeType="branch" category="processing" selected={props.selected || false} inputs={1} outputs={outputLabels.length} outputLabels={outputLabels}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Condition:</span></p>
        <code className="block bg-gray-100 p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-16">
          {config?.condition || 'No condition set'}
        </code>
      </div>
    </BaseNode>
  );
}

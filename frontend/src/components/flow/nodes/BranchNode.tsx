import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function BranchNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const outputLabels = config?.outputLabels || ['true', 'false'];
  const condition = config?.condition || '';
  return (
    <BaseNode label={(props.data?.label as string) || 'Branch'} nodeType="Condition" category="processing" selected={props.selected || false} inputs={1} outputs={outputLabels.length} outputLabels={outputLabels} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">{outputLabels.filter(Boolean).join(', ')}</span>
        </div>
        {condition && <p className="text-[9px] text-on-surface-variant truncate font-mono">{condition}</p>}
      </div>
    </BaseNode>
  );
}

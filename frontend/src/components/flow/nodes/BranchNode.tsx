import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function BranchNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const outputLabels = config?.outputLabels || ['true', 'false'];
  const hasCondition = !!config?.condition;
  return (
    <BaseNode label={(props.data?.label as string) || 'Branch'} nodeType="Condition" category="processing" selected={props.selected || false} inputs={1} outputs={outputLabels.length} outputLabels={outputLabels} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasCondition ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasCondition ? 'Condition set' : 'No condition'}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">{outputLabels.filter(Boolean).join(', ')}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className="text-[9px] text-on-surface-variant">→ {outputLabels.filter(Boolean).join('/')} path</span>
      </div>
    </BaseNode>
  );
}

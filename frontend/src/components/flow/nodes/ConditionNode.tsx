import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function ConditionNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const condition = config?.condition || '';
  return (
    <BaseNode label={(props.data?.label as string) || 'Condition'} nodeType="Condition" category="processing" selected={props.selected || false} inputs={1} outputs={2} outputLabels={['true', 'false']} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <p className="text-on-surface-variant">Condition:</p>
        <code className="block bg-surface-container p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-16">
          {condition || 'No condition set'}
        </code>
      </div>
    </BaseNode>
  );
}

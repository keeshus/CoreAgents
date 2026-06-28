import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Tooltip } from '@/components/ui/Tooltip';

export function HITLNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const buttons = config?.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }];
  const labels = buttons.map((b: any) => b.value);
  const maxIter = config?.maxIterations || 0;
  return (
    <BaseNode label={(props.data?.label as string) || 'Human in the Loop'} nodeType="HITL" category="processing" selected={props.selected || false} inputs={1} outputs={labels.length} outputLabels={labels} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="flex flex-wrap gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">pause</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">{labels.length} path{labels.length !== 1 ? 's' : ''}</span>
        {maxIter > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">max {maxIter}</span>}
      </div>
      <Tooltip content="Max iterations reached — exit">
        <Handle
          type="source"
          position={Position.Right}
          id={`output-${labels.length}`}
          style={{ top: '100%', background: 'var(--md-error)' }}
          className="!w-3 !h-3 !border-2 !border-surface"
        />
      </Tooltip>
    </BaseNode>
  );
}

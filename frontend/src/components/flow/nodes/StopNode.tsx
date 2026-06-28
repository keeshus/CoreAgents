import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function StopNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const status = config?.status || 'cancelled';
  const message = config?.message || '';
  return (
    <BaseNode label={(props.data?.label as string) || 'Stop'} nodeType="stop" category="processing" selected={props.selected || false} inputs={1} outputs={0} warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-error-container text-error">{status}</span>
        {message && <p className="text-[9px] text-on-surface-variant truncate">{message}</p>}
      </div>
    </BaseNode>
  );
}

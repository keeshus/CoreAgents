import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';

export function StopNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const message = config?.message || 'Execution stopped';
  const status = config?.status || 'cancelled';
  return (
    <BaseNode label={(props.data?.label as string) || 'Stop'} nodeType="stop" category="processing" selected={props.selected || false} inputs={1} outputs={0} warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        <p className="text-xs text-error font-medium flex items-center gap-1"><Icon name="stop" className="text-xs text-error" /> Terminates execution</p>
        {message && <p className="text-xs text-on-surface-variant italic truncate">{message}</p>}
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant flex items-center gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-error-container text-error">{status}</span>
      </div>
    </BaseNode>
  );
}

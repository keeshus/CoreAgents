import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function FlowToolNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const selectedFlows: Array<{ name: string }> = config?.selectedFlows || [];
  const count = config?.flowIds?.length || 0;
  return (
    <BaseNode label={(props.data?.label as string) || 'Flow Tool'} nodeType="Flow Tool" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        {count === 0 ? (
          <p className="text-warning text-xs">Not configured</p>
        ) : (
          <>
            <p className="text-on-surface-variant text-xs">{count} flow{count > 1 ? 's' : ''} selected</p>
            {selectedFlows.slice(0, 3).map((f, i) => (
              <p key={i} className="text-xs font-mono text-on-surface truncate">{f.name}</p>
            ))}
            {selectedFlows.length > 3 && <p className="text-[10px] text-on-surface-variant">+{selectedFlows.length - 3} more</p>}
          </>
        )}
        <p className="text-[10px] text-secondary mt-1">Connect purple dot to LLM Agent ↓</p>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">webhook</span>
        <span className="text-[9px] text-on-surface-variant ml-1">→ LLM Agent</span>
      </div>
    </BaseNode>
  );
}
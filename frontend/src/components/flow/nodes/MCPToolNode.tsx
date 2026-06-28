import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function MCPToolNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const hasServer = !!config?.serverName;
  const hasTool = !!config?.toolName;
  return (
    <BaseNode label={(props.data?.label as string) || 'MCP Tool'} nodeType="MCP Tool" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="flex flex-wrap gap-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasServer ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasServer ? 'Server' : 'No server'}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasTool ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasTool ? 'Tool' : 'No tool'}</span>
      </div>
    </BaseNode>
  );
}

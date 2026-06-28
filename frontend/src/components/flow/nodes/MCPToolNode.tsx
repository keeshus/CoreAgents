import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function MCPToolNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const serverName = config?.serverName;
  const toolName = config?.toolName;
  return (
    <BaseNode label={(props.data?.label as string) || 'MCP Tool'} nodeType="MCP Tool" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        <p className="text-[9px] text-on-surface-variant truncate">{serverName || 'No server'}</p>
        <p className="text-[9px] text-on-surface-variant truncate">{toolName || 'No tool'}</p>
      </div>
    </BaseNode>
  );
}

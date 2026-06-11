import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function MCPToolNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label="MCP Tool" nodeType="mcp-tool" category="tools" selected={props.selected || false}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Server:</span> {config?.serverName || 'Not set'}</p>
        <p><span className="text-gray-500">Tool:</span> {config?.toolName || 'Not set'}</p>
        {config?.description && <p className="truncate text-gray-400 italic">{config.description.slice(0, 50)}</p>}
      </div>
    </BaseNode>
  );
}

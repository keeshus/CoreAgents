import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function LLMAgentNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label="LLM Agent" nodeType="llm-agent" category="processing" selected={props.selected || false}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Endpoint:</span> {config?.endpointId ? 'Configured' : 'Not set'}</p>
        <p><span className="text-gray-500">Model:</span> {config?.model || 'Default'}</p>
        {config?.systemPrompt && <p className="truncate text-gray-400 italic">{config.systemPrompt.slice(0, 50)}</p>}
      </div>
    </BaseNode>
  );
}

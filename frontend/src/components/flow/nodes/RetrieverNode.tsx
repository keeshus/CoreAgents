import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function RetrieverNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label="Retriever" nodeType="retriever" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput>
      <div className="space-y-1">
        <p><span className="text-gray-500">Collection:</span> {config?.collectionName || 'Not set'}</p>
        <p><span className="text-gray-500">Top-K:</span> {config?.topK ?? 5}</p>
        <p className="text-[10px] text-purple-500 mt-1">Connect purple dot to LLM Agent ↓</p>
      </div>
    </BaseNode>
  );
}

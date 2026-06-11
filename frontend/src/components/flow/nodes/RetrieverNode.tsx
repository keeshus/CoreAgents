import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function RetrieverNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  return (
    <BaseNode label="Retriever" nodeType="retriever" category="tools" selected={props.selected || false}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Collection:</span> {config?.collection || 'Not set'}</p>
        <p><span className="text-gray-500">Top K:</span> {config?.topK ?? 5}</p>
        {config?.query && <p className="truncate text-gray-400 italic">Query: {config.query.slice(0, 50)}</p>}
      </div>
    </BaseNode>
  );
}

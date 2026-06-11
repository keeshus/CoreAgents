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
      <div className="mt-2 pt-2 border-t border-gray-100">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">{'{ chunks[], context }'}</span>
        <span className="text-[9px] text-gray-400 ml-1">→ LLM Agent</span>
      </div>
    </BaseNode>
  );
}

import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function RetrieverNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const hasEmbedding = !!config?.embeddingProviderId;
  const hasCollection = !!config?.collectionName;
  return (
    <BaseNode label={(props.data?.label as string) || 'Retriever'} nodeType="Retriever" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="flex flex-wrap gap-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasEmbedding ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasEmbedding ? 'EP' : 'No EP'}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasCollection ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasCollection ? 'Collection' : 'No collection'}</span>
      </div>
    </BaseNode>
  );
}

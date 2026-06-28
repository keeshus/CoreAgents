import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function RetrieverNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const hasEmbedding = !!config?.embeddingProviderId;
  const collectionName = config?.collectionName;
  return (
    <BaseNode label={(props.data?.label as string) || 'Retriever'} nodeType="Retriever" category="tools" selected={props.selected || false} inputs={0} outputs={0} toolOutput warnings={props.data?._warnings as string[] | undefined}>
      <div className="space-y-1">
        <p className={`text-[9px] ${hasEmbedding ? 'text-on-surface-variant' : 'text-error'}`}>{hasEmbedding ? 'Embedding set' : 'No embedding'}</p>
        <p className="text-[9px] text-on-surface-variant truncate">{collectionName || 'No collection'}</p>
      </div>
    </BaseNode>
  );
}

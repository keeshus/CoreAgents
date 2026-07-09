import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';

export function AIActionNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const model = config?.model || '';
  const promptPreview = config?.prompt
    ? config.prompt.length > 40
      ? config.prompt.slice(0, 40) + '...'
      : config.prompt
    : '';

  return (
    <BaseNode
      label={(props.data?.label as string) || 'AI Action'}
      nodeType="ai-action"
      selected={props.selected}
      inputs={1}
      outputs={1}
    >
      <div className="space-y-1">
        {model && (
          <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">
            <Icon name="auto_awesome" className="text-xs text-primary" />
            <span className="truncate">{model}</span>
          </div>
        )}
        {promptPreview && (
          <p className="text-[10px] text-on-surface-variant italic truncate">{promptPreview}</p>
        )}
        {!model && !promptPreview && (
          <p className="text-[10px] text-outline-variant">Configure prompt and model</p>
        )}
      </div>
    </BaseNode>
  );
}

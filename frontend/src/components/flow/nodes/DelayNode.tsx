import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';

export function DelayNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const delayType = config?.type || 'fixed';
  const seconds = config?.seconds;
  const duration = config?.duration;
  const timestamp = config?.timestamp;

  const delayLabel = delayType === 'fixed' && seconds
    ? `${seconds}s`
    : delayType === 'duration' && duration
      ? duration
      : delayType === 'timestamp' && timestamp
        ? timestamp
        : 'Not configured';

  return (
    <BaseNode
      label={(props.data?.label as string) || 'Delay'}
      nodeType="delay"
      selected={props.selected}
      inputs={1}
      outputs={1}
    >
      <div className="flex items-center gap-2">
        <Icon name="timer" className="text-base text-primary" />
        <span className="text-xs text-on-surface font-mono">{delayLabel}</span>
      </div>
    </BaseNode>
  );
}

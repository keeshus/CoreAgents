import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-primary-container text-primary' },
  chat: { label: 'Chat', color: 'bg-success-container text-success' },
  webhook: { label: 'Webhook', color: 'bg-secondary-container text-on-secondary-container' },
  schedule: { label: 'Schedule', color: 'bg-tertiary-container text-on-tertiary-container' },
};

export function TriggerNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const triggerType = config?.triggerType || 'manual';
  const info = TRIGGER_LABELS[triggerType] || TRIGGER_LABELS.manual;
  return (
    <BaseNode label={(props.data?.label as string) || 'Trigger'} nodeType="Trigger" category="input" selected={props.selected || false} inputs={0} outputs={1} warnings={props.data?._warnings as string[] | undefined}>
      <div className="flex flex-wrap gap-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${info.color}`}>{info.label}</span>
        {triggerType === 'webhook' && config?.inputSchema && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container">Custom schema</span>
        )}
        {triggerType === 'schedule' && config?.cronExpression && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-secondary-container text-on-secondary-container truncate max-w-[160px]">{config.cronExpression}</span>
        )}
        {(triggerType === 'schedule' || triggerType === 'manual') && config?.inputMessage && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">Input</span>
        )}
      </div>
    </BaseNode>
  );
}

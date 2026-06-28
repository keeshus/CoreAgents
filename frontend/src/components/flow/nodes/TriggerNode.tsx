import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const TRIGGER_INFO: Record<string, { label: string; desc: string; color: string }> = {
  manual: { label: 'Manual', desc: 'Run/Debug button', color: 'bg-primary-container text-primary' },
  chat: { label: 'Chat', desc: 'User message + history', color: 'bg-success-container text-success' },
  webhook: { label: 'Webhook', desc: 'POST body → next node', color: 'bg-secondary-container text-on-secondary-container' },
  schedule: { label: 'Schedule', desc: 'Cron-triggered', color: 'bg-tertiary-container text-on-tertiary-container' },
};

export function TriggerNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const triggerType = config?.triggerType || 'manual';
  const info = TRIGGER_INFO[triggerType] || TRIGGER_INFO.manual;
  return (
    <BaseNode label={(props.data?.label as string) || 'Trigger'} nodeType="Trigger" category="input" selected={props.selected || false} inputs={0} outputs={1} warnings={props.data?._warnings as string[] | undefined} bodyMaxH="max-h-[120px]">
      <div className="space-y-1">
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${info.color}`}>{info.label}</span>
        <p className="text-[10px] text-on-surface-variant">{info.desc}</p>
        {triggerType === 'webhook' && (
          <code className="block text-[9px] bg-surface-container p-1 rounded mt-1 break-all">
            POST /api/webhook/...?secret=
          </code>
        )}
        {triggerType === 'schedule' && config?.cronExpression && (
          <code className="block text-[9px] bg-surface-container p-1 rounded mt-1">{config.cronExpression}</code>
        )}
        {(triggerType === 'schedule' || triggerType === 'manual') && config?.inputMessage && (
          <p className="text-[9px] text-on-surface-variant mt-1 truncate">Input: {config.inputMessage.slice(0, 60)}</p>
        )}
        {triggerType === 'webhook' && config?.inputSchema && (
          <code className="block text-[9px] bg-secondary-container border border-secondary-container p-1 rounded mt-1 break-all">{config.inputSchema}</code>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-success-container text-success">{'{ message, ... }'}</span>
        <span className="text-[9px] text-on-surface-variant ml-1">→ next node</span>
      </div>
    </BaseNode>
  );
}

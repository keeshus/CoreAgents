import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function TriggerNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const triggerType = config?.triggerType || 'manual';
  return (
    <BaseNode label="Trigger" nodeType="trigger" category="input" selected={props.selected || false} inputs={0} outputs={1}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Type:</span> {triggerType}</p>
        {config?.cron && <p><span className="text-gray-500">Cron:</span> {config.cron}</p>}
        {config?.webhookPath && <p className="truncate"><span className="text-gray-500">Webhook:</span> {config.webhookPath}</p>}
      </div>
    </BaseNode>
  );
}

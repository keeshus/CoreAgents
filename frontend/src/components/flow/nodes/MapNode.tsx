import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';

export function MapNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const fields = config?.fields || [];
  const mode = config?.mode || 'replace';
  const fieldCount = fields.length;

  return (
    <BaseNode
      label={(props.data?.label as string) || 'Map'}
      nodeType="map"
      selected={props.selected}
      inputs={1}
      outputs={1}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-on-surface-variant">
            {fieldCount > 0 ? `${fieldCount} field${fieldCount !== 1 ? 's' : ''}` : 'No fields'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
            {mode}
          </span>
        </div>
        {fieldCount > 0 && (
          <div className="max-h-12 overflow-hidden">
            {fields.slice(0, 3).map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-1 text-[9px] text-on-surface-variant">
                <span className="font-medium">{f.name}</span>
                <Icon name="arrow_forward" className="text-[8px]" />
                <span className="truncate">{f.value}</span>
              </div>
            ))}
            {fieldCount > 3 && (
              <p className="text-[9px] text-outline-variant">+{fieldCount - 3} more</p>
            )}
          </div>
        )}
      </div>
    </BaseNode>
  );
}

import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const inputFields: string[] = config?.inputFields || [];
  const mode = inputFields.length === 0 ? 'pass-through' : inputFields.length === 1 ? 'single field' : 'combined';
  return (
    <BaseNode label={(props.data?.label as string) || 'Output'} nodeType="Output" category="output" selected={props.selected || false} inputs={1} outputs={0}>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">{mode === 'pass-through' ? 'Returns all accumulated data' : mode === 'single field' ? 'Returns selected field value' : `Returns ${inputFields.length} fields as JSON`}</p>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700">{mode === 'pass-through' ? 'all data' : mode === 'single field' ? 'single value' : 'JSON object'}</span>
        <span className="text-[9px] text-gray-400 ml-auto">→ final</span>
      </div>
    </BaseNode>
  );
}

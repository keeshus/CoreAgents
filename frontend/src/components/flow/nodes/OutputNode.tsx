import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const inputFields: string[] = config?.inputFields || [];
  const mode = inputFields.length === 0 ? 'all' : inputFields.length === 1 ? 'single' : 'combined';
  const modeLabel = mode === 'all' ? 'JSON (all)' : mode === 'single' ? 'single' : `JSON (${inputFields.length})`;
  return (
    <BaseNode label={(props.data?.label as string) || 'Output'} nodeType="Output" category="output" selected={props.selected || false} inputs={1} outputs={0} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="flex flex-wrap gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-tertiary-container text-on-tertiary-container">{modeLabel}</span>
      </div>
    </BaseNode>
  );
}

import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function OutputNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const format = config?.format || 'text';
  return (
    <BaseNode label="Output" nodeType="output" category="output" selected={props.selected || false} inputs={1} outputs={0}>
      <div className="space-y-1">
        <p><span className="text-gray-500">Format:</span> {format}</p>
        {config?.path && <p className="truncate"><span className="text-gray-500">Path:</span> {config.path}</p>}
        {config?.variable && <p className="truncate"><span className="text-gray-500">Variable:</span> {config.variable}</p>}
      </div>
    </BaseNode>
  );
}

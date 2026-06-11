import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function CodeNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const language = config?.language || 'javascript';
  const code = config?.code || '';
  return (
    <BaseNode label="Code" nodeType="code" category="processing" selected={props.selected || false}>
      <div className="space-y-1">
        <p>
          <span className="inline-block bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase">{language}</span>
        </p>
        <code className="block bg-gray-100 p-1.5 rounded text-[11px] font-mono mt-1 overflow-auto max-h-20 whitespace-pre-wrap">
          {code ? code.slice(0, 120) + (code.length > 120 ? '...' : '') : 'No code'}
        </code>
      </div>
    </BaseNode>
  );
}

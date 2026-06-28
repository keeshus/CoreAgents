import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function CodeNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const language = config?.language || 'javascript';
  const code = config?.code || '';
  const hasSchema = !!config?.outputSchema;
  const snippet = code.split('\n')[0]?.slice(0, 40) || '';
  return (
    <BaseNode label={(props.data?.label as string) || 'Code'} nodeType="Code" category="processing" selected={props.selected || false} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          <span className="inline-block bg-surface-container-high text-on-surface text-[9px] px-1.5 py-0.5 rounded font-mono uppercase">{language}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasSchema ? 'bg-surface-container text-on-surface' : 'text-warning'}`}>Schema</span>
        </div>
        {snippet && <p className="text-[9px] text-on-surface-variant truncate font-mono">{snippet}</p>}
      </div>
    </BaseNode>
  );
}

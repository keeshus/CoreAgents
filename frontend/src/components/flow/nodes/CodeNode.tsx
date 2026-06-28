import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

export function CodeNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const language = config?.language || 'javascript';
  const code = config?.code || '';
  return (
    <BaseNode label={(props.data?.label as string) || 'Code'} nodeType="Code" category="processing" selected={props.selected || false} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <p>
          <span className="inline-block bg-surface-container-high text-on-surface text-[10px] px-1.5 py-0.5 rounded font-mono uppercase">{language}</span>
        </p>
        <code className="block bg-surface-container p-1.5 rounded text-[11px] font-mono mt-1 truncate">
          {code ? code.slice(0, 120) + (code.length > 120 ? '...' : '') : 'No code'}
        </code>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant flex items-center gap-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">any</span>
        {!config?.outputSchema && (
          <Tooltip content="No output schema set. Add an Output Structure to help downstream nodes.">
            <span className="text-[9px] text-warning font-medium"><Icon name="warning" className="text-[9px] text-warning" /> no schema</span>
          </Tooltip>
        )}
        <span className="text-[9px] text-on-surface-variant ml-auto">→ return value</span>
      </div>
    </BaseNode>
  );
}

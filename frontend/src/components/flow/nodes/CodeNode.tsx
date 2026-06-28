import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

export function CodeNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const language = config?.language || 'javascript';
  const hasCode = !!config?.code;
  const hasSchema = !!config?.outputSchema;
  return (
    <BaseNode label={(props.data?.label as string) || 'Code'} nodeType="Code" category="processing" selected={props.selected || false} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="flex flex-wrap gap-1">
        <span className="inline-block bg-surface-container-high text-on-surface text-[9px] px-1.5 py-0.5 rounded font-mono uppercase">{language}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasCode ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>{hasCode ? 'Code' : 'No code'}</span>
        {hasSchema && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">Schema</span>}
        {!hasSchema && (
          <Tooltip content="No output schema set.">
            <span className="text-[9px] text-warning font-medium flex items-center gap-0.5"><Icon name="warning" className="text-[9px] text-warning" /> Schema</span>
          </Tooltip>
        )}
      </div>
    </BaseNode>
  );
}

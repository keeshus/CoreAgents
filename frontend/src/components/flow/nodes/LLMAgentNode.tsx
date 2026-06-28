import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function LLMAgentNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const isJson = config?.responseFormat === 'json_object';
  const endpointName = config?.endpointName || (config?.endpointId ? 'Endpoint set' : '');
  const hasModel = config?.model;
  return (
    <BaseNode label={(props.data?.label as string) || 'LLM Agent'} nodeType="LLM Agent" category="processing" selected={props.selected || false} toolInputs={1} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isJson ? 'bg-success-container text-success' : 'bg-primary-container text-primary'}`}>
            {isJson ? '{ json }' : '"text"'}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${endpointName ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>
            {endpointName ? endpointName : 'No EP'}
          </span>
        </div>
        {hasModel && <p className="text-[9px] text-on-surface-variant truncate">{config.model}</p>}
      </div>
    </BaseNode>
  );
}

import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function LLMAgentNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const isJson = config?.responseFormat === 'json_object';
  const hasEndpoint = config?.endpointId || config?.endpointName;
  const hasModel = config?.model;
  return (
    <BaseNode label={(props.data?.label as string) || 'LLM Agent'} nodeType="LLM Agent" category="processing" selected={props.selected || false} toolInputs={1} warnings={props.data?._warnings as string[] | undefined} feedbackInput>
      <div className="space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isJson ? 'bg-success-container text-success' : 'bg-primary-container text-primary'}`}>
            {isJson ? '{ json }' : '"text"'}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${hasEndpoint ? 'bg-surface-container text-on-surface' : 'bg-error-container text-error'}`}>
            {hasEndpoint ? 'Endpoint set' : 'No endpoint'}
          </span>
          {hasModel && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-container text-on-surface">{config.model}</span>}
        </div>
      </div>
    </BaseNode>
  );
}

import { type NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function HttpNode(props: NodeProps) {
  const config = props.data?.config as Record<string, any> | undefined;
  const method = config?.method || 'GET';
  const url = config?.url || '';
  
  const methodColors: Record<string, string> = {
    GET: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
    POST: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
    PUT: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400',
    PATCH: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400',
    DELETE: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    HEAD: 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <BaseNode
      label={(props.data?.label as string) || 'HTTP Request'}
      nodeType="http"
      category="tools"
      selected={props.selected}
      inputs={1}
      outputs={1}
    >
      <div className="space-y-2">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${methodColors[method] || methodColors.GET}`}>
          {method}
        </span>
        <p className="text-[10px] text-on-surface-variant truncate" title={url}>
          {url || 'No URL set'}
        </p>
      </div>
    </BaseNode>
  );
}

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  input: 'border-green-400',
  processing: 'border-blue-400',
  tools: 'border-purple-400',
  output: 'border-orange-400',
};

interface BaseNodeProps {
  children: React.ReactNode;
  label: string;
  nodeType: string;
  category?: string;
  selected: boolean;
  inputs?: number;
  outputs?: number;
  outputLabels?: string[];
  className?: string;
}

export function BaseNode({ children, label, nodeType, category = 'processing', selected, inputs = 1, outputs = 1, outputLabels, className }: BaseNodeProps) {
  const borderColor = CATEGORY_COLORS[category] || 'border-gray-300';

  return (
    <div className={cn(
      'rounded-lg border-2 bg-white shadow-sm min-w-[200px]',
      borderColor,
      selected && 'ring-2 ring-blue-500 shadow-md',
      className
    )}>
      {Array.from({ length: inputs }).map((_, i) => (
        <Handle key={`input-${i}`} type="target" position={Position.Left} id={`input-${i}`} style={{ top: '50%' }} />
      ))}
      <div className="px-3 py-2 border-b bg-gray-50 font-medium text-sm rounded-t-lg flex items-center gap-2">
        <span>{label}</span>
      </div>
      <div className="p-3 text-xs">
        {children}
      </div>
      {outputLabels && outputLabels.length > 0 ? (
        outputLabels.map((lbl, i) => (
          <Handle
            key={`output-${i}`}
            type="source"
            position={Position.Right}
            id={`output-${i}`}
            style={{ top: `${((i + 1) / (outputLabels.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        Array.from({ length: outputs }).map((_, i) => (
          <Handle key={`output-${i}`} type="source" position={Position.Right} id={`output-${i}`} style={{ top: '50%' }} />
        ))
      )}
    </div>
  );
}

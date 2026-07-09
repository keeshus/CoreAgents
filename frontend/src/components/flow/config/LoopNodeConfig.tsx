import { useMemo } from 'react';
import { TextField } from '@/components/ui/TextField';
import { getUpstreamNodeIds, getNodeFields } from './InputPreview';

interface LoopNodeConfigProps {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
  nodeId: string;
  nodes: any[];
  edges: any[];
}

export function LoopNodeConfig({ config, onChange, nodeId, nodes, edges }: LoopNodeConfigProps) {
  const upstreamLabels = useMemo(() => {
    const upstreamIds = getUpstreamNodeIds(nodeId, edges);
    return upstreamIds.map((id: string) => {
      const n = nodes.find((nd: any) => nd.id === id);
      return n ? { id, label: n.data?.label || n.data?.type || id, node: n } : null;
    }).filter(Boolean);
  }, [nodeId, edges, nodes]);

  const arrayFields = useMemo(() => {
    const fields: { nodeLabel: string; fieldPath: string; type: string }[] = [];
    for (const up of upstreamLabels) {
      if (!up) continue;
      const nodeFields = getNodeFields(up.node);
      for (const f of nodeFields) {
        if (f.type.startsWith('array<') || f.type === 'array') {
          fields.push({ nodeLabel: up.label, fieldPath: `${up.label.toLowerCase()}.${f.name}`, type: f.type });
        }
      }
    }
    return fields;
  }, [upstreamLabels]);

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-medium text-on-surface-variant block mb-1">Array Field</span>
        <select
          value={config.itemsField || ''}
          onChange={(e) => onChange({ itemsField: e.target.value })}
          className="w-full rounded border border-outline p-2 text-sm bg-surface"
        >
          <option value="">-- Select an array field --</option>
          {arrayFields.map((f) => (
            <option key={f.fieldPath} value={f.fieldPath}>
              {f.fieldPath} <span className="text-outline-variant">({f.type})</span>
            </option>
          ))}
        </select>
        {arrayFields.length === 0 && (
          <p className="text-[10px] text-on-surface-variant mt-1">No array fields found from upstream nodes.</p>
        )}
      </div>

      <TextField
        label="Item Variable"
        value={config.itemVariable || 'item'}
        onChange={(v) => onChange({ itemVariable: v })}
        placeholder="item"
      />

      <TextField
        label="Index Variable (optional)"
        value={config.indexVariable || ''}
        onChange={(v) => onChange({ indexVariable: v })}
        placeholder="index"
      />

      <label className="flex items-center gap-2 text-xs text-on-surface-variant">
        <input
          type="checkbox"
          checked={config.collectResults !== false}
          onChange={(e) => onChange({ collectResults: e.target.checked })}
          className="w-3 h-3 accent-primary"
        />
        Collect results as array
      </label>
    </div>
  );
}

import { useMemo } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface FieldEntry {
  name: string;
  type: string;
  required: boolean;
}

interface UpstreamNodeShape {
  nodeId: string;
  label: string;
  fields: FieldEntry[];
  raw: string | null;
}

interface InputPreviewProps {
  edges: any[];
  nodes: any[];
  selectedNodeId: string;
  /** When provided, enables checkbox selection mode. The parent owns this list. */
  inputFields?: string[];
  /** The subset of inputFields that are currently filtered/unchecked. */
  filteredFields?: string[];
}

// ─── Upstream node traversal (recursive) ────────────────────────────────────

export function getUpstreamNodeIds(
  nodeId: string,
  edges: any[],
  visited: Set<string> = new Set(),
): string[] {
  if (!nodeId || visited.has(nodeId)) return [];
  visited.add(nodeId);

  const incoming = edges.filter(
    (e: any) => e.target === nodeId && !e.targetHandle?.startsWith('tool-input'),
  );

  const ids: string[] = [];
  for (const e of incoming) {
    ids.push(e.source);
    ids.push(...getUpstreamNodeIds(e.source, edges, visited));
  }
  return ids;
}

// ─── Output shape extraction per node type ──────────────────────────────────

export function getNodeFields(node: any): FieldEntry[] {
  const type = node?.data?.type;
  const config = node?.data?.config || {};

  switch (type) {
    case 'trigger': {
      if (config?.triggerType === 'chat') {
        return [
          { name: 'message', type: 'string', required: true },
          { name: 'history', type: 'array<{role,content}>', required: false },
        ];
      }
      if (config?.triggerType === 'webhook' && config?.inputSchema) {
        try {
          const raw =
            typeof config.inputSchema === 'string'
              ? JSON.parse(config.inputSchema)
              : config.inputSchema;
          if (typeof raw === 'object' && !Array.isArray(raw)) {
            return Object.entries(raw).map(([k, v]) => ({
              name: k,
              type: String(v),
              required: true,
            }));
          }
        } catch {
          /* ignore parse errors */
        }
      }
      return [{ name: 'message', type: 'any', required: true }];
    }

    case 'llm-agent': {
      const fields: FieldEntry[] = [
        { name: 'content', type: 'string', required: true },
      ];
      if (config?.responseFormat === 'json_object' && config?.outputSchema) {
        try {
          const schema =
            typeof config.outputSchema === 'string'
              ? JSON.parse(config.outputSchema)
              : config.outputSchema;
          if (schema?.properties) {
            for (const [key, val] of Object.entries<any>(schema.properties)) {
              fields.push({
                name: key,
                type: val.type || 'any',
                required: schema.required?.includes(key) ?? true,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }
      return fields;
    }

    case 'mcp-tool':
      return [
        { name: 'result', type: 'string', required: true },
        { name: 'toolName', type: 'string', required: true },
        { name: 'serverName', type: 'string', required: true },
      ];

    case 'retriever':
      return [
        { name: 'query', type: 'string', required: true },
        { name: 'chunks', type: 'array<{text,similarity,documentId}>', required: true },
        { name: 'context', type: 'string', required: true },
        { name: 'count', type: 'number', required: true },
      ];

    case 'branch':
      return [
        { name: 'verdict', type: 'boolean', required: true },
        { name: 'label', type: 'string', required: true },
      ];

    case 'code': {
      if (config?.outputSchema) {
        try {
          const schema =
            typeof config.outputSchema === 'string'
              ? JSON.parse(config.outputSchema)
              : config.outputSchema;
          if (schema?.properties) {
            return Object.entries(schema.properties).map(([k, v]: [string, any]) => ({
              name: k,
              type: v.type || 'any',
              required: true,
            }));
          }
        } catch {
          /* ignore */
        }
      }
      return [];
    }

    case 'parallel':
      return [
        { name: 'merged', type: '{ [nodeId]: any }', required: true },
        { name: 'results', type: 'array<{id,type,output}>', required: true },
      ];

    case 'output':
      return [];

    case 'hitl':
      return [
        { name: 'decision', type: 'string', required: true },
        { name: 'feedback', type: 'string', required: true },
        { name: 'reviewedContent', type: 'object', required: true },
      ];

    default:
      return [];
  }
}

/** Returns a plain-text fallback when the node type doesn't produce structured fields. */
function getNodeRawFallback(node: any): string | null {
  const type = node?.data?.type;
  const config = node?.data?.config || {};
  if (type === 'code' && !config?.outputSchema) return 'any (determined by return value)';
  if (type === 'output') return '(pass-through — same as input)';
  return null;
}

// ─── Accumulate upstream shape ──────────────────────────────────────────────

function accumulateUpstream(nodeId: string, edges: any[], nodes: any[]): UpstreamNodeShape[] {
  const upstreamIds = getUpstreamNodeIds(nodeId, edges);

  return upstreamIds.map((id) => {
    const node = nodes.find((n) => n.id === id);
    const label = node?.data?.label || node?.data?.type || id;
    if (!node) return { nodeId: id, label, fields: [], raw: null };
    return {
      nodeId: id,
      label,
      fields: getNodeFields(node),
      raw: getNodeRawFallback(node),
    };
  });
}

// ─── Render helpers ─────────────────────────────────────────────────────────

function fieldsToLines(fields: FieldEntry[]): string {
  const parts = ['{'];
  for (const f of fields) {
    parts.push(`  ${f.name}${f.required ? '' : '?'}: ${f.type},`);
  }
  parts.push('}');
  return parts.join('\n');
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InputPreview({
  edges,
  nodes,
  selectedNodeId,
  inputFields,
  filteredFields,
}: InputPreviewProps) {
  const upstream = useMemo(
    () => accumulateUpstream(selectedNodeId, edges, nodes),
    [selectedNodeId, edges, nodes],
  );

  // Build flat accumulated fields list (deduplicated by field name)
  const accumulatedFields = useMemo(() => {
    const entries: FieldEntry[] = [];
    const seen = new Set<string>();
    for (const up of upstream) {
      for (const f of up.fields) {
        if (!seen.has(f.name)) {
          seen.add(f.name);
          entries.push(f);
        }
      }
    }
    return entries;
  }, [upstream]);

  if (upstream.length === 0) return null;

  const showCheckboxes = Array.isArray(inputFields);

  return (
    <div className="px-3 pb-3 space-y-3">
      <h4 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
        Incoming Data Shape
      </h4>

      {/* ─── Per-source-node sections ─── */}
      <div className="space-y-2">
        {upstream.map((up) => (
          <div key={up.nodeId}>
            <p className="text-[10px] text-on-surface-variant mb-0.5">
              from{' '}
              <span className="font-medium text-on-surface">{up.label}</span>
              <span className="text-on-surface-variant ml-1">({up.nodeId})</span>
            </p>
            {up.raw !== null ? (
              <pre className="text-[10px] bg-primary-container border border-outline-variant rounded p-2 font-mono text-primary whitespace-pre overflow-x-auto">
                {up.raw}
              </pre>
            ) : up.fields.length > 0 ? (
              <pre className="text-[10px] bg-primary-container border border-outline-variant rounded p-2 font-mono text-primary whitespace-pre overflow-x-auto">
                {fieldsToLines(up.fields)}
              </pre>
            ) : (
              <pre className="text-[10px] bg-surface-container border border-outline-variant rounded p-2 font-mono text-on-surface-variant whitespace-pre overflow-x-auto">
                (no structured fields)
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* ─── Accumulated input section ─── */}
      <div>
        <h5 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
          Accumulated Input
        </h5>
        {accumulatedFields.length === 0 ? (
          <pre className="text-[10px] bg-surface-container border border-outline-variant rounded p-2 font-mono text-on-surface-variant whitespace-pre overflow-x-auto">
            (no structured fields from upstream)
          </pre>
        ) : (
          <div className="bg-surface border border-outline-variant rounded p-2 space-y-0.5">
            {accumulatedFields.map((field) => (
              <div key={field.name} className="flex items-center gap-1.5">
                {showCheckboxes && (
                  <input
                    type="checkbox"
                    checked={!filteredFields?.includes(field.name)}
                    readOnly
                    className="w-2.5 h-2.5 accent-primary"
                  />
                )}
                <span className="text-[10px] font-mono text-on-surface">
                  {field.name}
                  <span className="text-on-surface-variant ml-1">:{field.type}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

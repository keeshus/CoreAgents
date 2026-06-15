// Output shapes for each node type — shows the actual data structure
function outputShape(node: any): string[] {
  const type = node?.data?.type;
  const config = node?.data?.config || {};

  switch (type) {
    case 'trigger':
      return ['{', '  message: any,', '  ...triggerInput', '}'];

    case 'llm-agent': {
      const fields = ['{', '  content: string,', '  streamedContent: string'];
      if (config?.responseFormat === 'json_object') {
        if (config?.outputSchema) {
          try {
            const schema = typeof config.outputSchema === 'string'
              ? JSON.parse(config.outputSchema)
              : config.outputSchema;
            if (schema?.properties) {
              for (const [key, val] of Object.entries<any>(schema.properties)) {
                const opt = schema.required?.includes(key) ? '' : '?';
                fields.push(`  ${key}${opt}: ${val.type || 'any'},`);
              }
            }
          } catch { fields.push('  ...json (invalid schema)'); }
        } else {
          fields.push('  ...json (no schema defined)');
        }
      }
      fields.push('}');
      return fields;
    }

    case 'mcp-tool':
      return ['{', '  result: string,', '  toolName: string,', '  serverName: string', '}'];

    case 'retriever':
      return ['{', '  query: string,', '  chunks: [{ text, similarity, documentId }],', '  context: string,', '  count: number', '}'];

    case 'branch':
      return ['{', '  verdict: boolean,', '  label: string', '}'];

    case 'code': {
      if (config?.outputSchema) {
        try {
          const schema = typeof config.outputSchema === 'string'
            ? JSON.parse(config.outputSchema)
            : config.outputSchema;
          if (schema?.properties) {
            const fields = ['{'];
            for (const [key, val] of Object.entries<any>(schema.properties)) {
              fields.push(`  ${key}: ${val.type || 'any'},`);
            }
            fields.push('}');
            return fields;
          }
        } catch {}
      }
      return ['any (determined by return value)'];
    }

    case 'trigger': {
      if (config?.triggerType === 'webhook' && config?.inputSchema) {
        try {
          const schema = typeof config.inputSchema === 'string'
            ? JSON.parse(config.inputSchema)
            : config.inputSchema;
          if (typeof schema === 'object' && !Array.isArray(schema)) {
            const fields = ['{'];
            for (const [key, val] of Object.entries<any>(schema)) {
              fields.push(`  ${key}: ${val},`);
            }
            fields.push('}');
            return fields;
          }
        } catch {}
      }
      return ['{', '  message: any,', '  ...input', '}'];
    }

    case 'parallel':
      return ['{', '  merged: { [nodeId]: any },', '  results: [{ id, type, output }]', '}'];

    case 'output':
      return ['(pass-through — same as input)'];

    case 'hitl':
      return ['{', '  decision: string,', '  feedback: string,', '  reviewedContent: { ...forwarded fields }', '}'];

    default:
      return ['unknown'];
  }
}

interface InputPreviewProps {
  edges: any[];
  nodes: any[];
  selectedNodeId: string;
}

export function InputPreview({ edges, nodes, selectedNodeId }: InputPreviewProps) {
  const incoming = edges.filter((e: any) =>
    e.target === selectedNodeId && !e.targetHandle?.startsWith('tool-input')
  );

  if (incoming.length === 0) return null;

  return (
    <div className="px-3 pb-3">
      <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Incoming Data</h4>
      {incoming.map((e: any) => {
        const src = nodes.find((n: any) => n.id === e.source);
        if (!src) return null;
        const shape = outputShape(src);
        const srcLabel = src.data?.label || src.data?.type || 'unknown';
        return (
          <div key={e.id} className="mb-2">
            <p className="text-[10px] text-gray-500 mb-0.5">
              from <span className="font-medium text-gray-700">{srcLabel}</span>
            </p>
            <pre className="text-[10px] bg-blue-50 border border-blue-100 rounded p-2 font-mono text-blue-800 whitespace-pre overflow-x-auto">
              {shape.join('\n')}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ArrowRight, Bot, Wrench, Search, GitBranch, Code, Columns3, Clock, Square, CheckCircle, X, Puzzle } from 'lucide-react';

const NODE_ICONS: Record<string, any> = {
  trigger: ArrowRight,
  'llm-agent': Bot,
  'mcp-tool': Wrench,
  retriever: Search,
  branch: GitBranch,
  code: Code,
  parallel: Columns3,
  hitl: Clock,
  stop: Square,
  output: CheckCircle,
};

interface NodeCatalogProps {
  onAddNode: (type: string, defaultConfig: Record<string, any>) => void;
  onClose?: () => void;
}

export function NodeCatalog({ onAddNode, onClose }: NodeCatalogProps) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.catalog.list().then(setCatalog).finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const categories = ['input', 'processing', 'tools', 'output'] as const;
  const CATEGORY_LABELS: Record<string, string> = { input: 'Input', processing: 'Processing', tools: 'Tools', output: 'Output' };

  return (
    <div className="bg-surface/95 backdrop-blur border rounded-xl shadow-m3-4 p-3 space-y-3 w-56">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Add Node</h3>
        {onClose && (
          <button onClick={onClose} className="p-0.5 text-outline-variant hover:text-on-surface-variant">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {categories.map((cat) => {
        const items = catalog.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[9px] uppercase tracking-wider text-outline-variant mb-1 px-1">{CATEGORY_LABELS[cat]}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((entry) => {
                const Icon = NODE_ICONS[entry.type] || Puzzle;
                return (
                  <button
                    key={entry.type}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors text-xs text-on-surface-variant font-medium"
                    onClick={() => onAddNode(entry.type, entry.defaultConfig)}
                    title={entry.description}
                  >
                    <Icon className="w-3.5 h-3.5 text-on-surface-variant" />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Puzzle } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  input: 'Input',
  processing: 'Processing',
  tools: 'Tools & Integrations',
  output: 'Output',
};

interface NodeCatalogProps {
  onAddNode: (type: string, defaultConfig: Record<string, any>) => void;
}

export function NodeCatalog({ onAddNode }: NodeCatalogProps) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.catalog.list().then(setCatalog).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading catalog...</div>;

  const categories = ['input', 'processing', 'tools', 'output'] as const;

  return (
    <div className="w-60 border-r bg-white p-3 space-y-3 overflow-y-auto h-full">
      <div className="flex items-center gap-2 px-2 pb-2 border-b">
        <Puzzle className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold">Nodes</h3>
      </div>
      {categories.map((cat) => {
        const items = catalog.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1 px-2">{CATEGORY_LABELS[cat]}</p>
            {items.map((entry) => (
              <button
                key={entry.type}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => onAddNode(entry.type, entry.defaultConfig)}
              >
                <span className="font-medium">{entry.label}</span>
                <span className="block text-[11px] text-gray-500 leading-tight">{entry.description}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

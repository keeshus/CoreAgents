import { useEffect, useState } from 'react';

interface CollectionSelectorProps {
  value: string;
  onChange: (collectionName: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function CollectionSelector({ value, onChange }: CollectionSelectorProps) {
  const [collections, setCollections] = useState<Array<{ collection_name: string; document_count: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/knowledge/collections`)
      .then(r => r.json())
      .then(setCollections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">Knowledge Base Collection</span>
      {loading ? (
        <p className="mt-1 text-xs text-gray-400">Loading collections...</p>
      ) : collections.length === 0 ? (
        <div className="mt-1">
          <select className="block w-full rounded border border-gray-300 p-2 text-sm bg-white" disabled>
            <option>No collections available</option>
          </select>
          <p className="mt-1 text-[10px] text-gray-400">
            Upload documents in <a href="/settings/knowledge" className="text-blue-600 hover:underline" target="_blank">Settings → Knowledge Bases</a>
          </p>
        </div>
      ) : (
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {collections.map(c => (
            <option key={c.collection_name} value={c.collection_name}>
              {c.collection_name} ({c.document_count} doc{c.document_count !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

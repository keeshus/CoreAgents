import { useEffect, useState } from 'react';
import { SelectField } from '@/components/ui/SelectField';

interface CollectionSelectorProps {
  vectorStoreId: string;
  value: string;
  onChange: (collectionName: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export function CollectionSelector({ vectorStoreId, value, onChange }: CollectionSelectorProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!vectorStoreId) { setCollections([]); return; }
    setLoading(true);
    fetch(`${API_URL}/vector-stores/${vectorStoreId}/collections`)
      .then(r => r.json())
      .then(data => setCollections(Array.isArray(data) ? data : []))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [vectorStoreId]);

  if (!vectorStoreId) {
    return (
      <label className="block">
        <span className="text-xs font-medium text-on-surface">Collection Name</span>
        <input className="mt-1 block w-full rounded border border-outline p-2 text-sm bg-surface" value={value} onChange={e => onChange(e.target.value)} placeholder="my-collection" />
        <p className="mt-1 text-[10px] text-on-surface-variant">Select a vector store first to browse collections.</p>
      </label>
    );
  }

  if (loading) return <p className="text-xs text-on-surface-variant">Loading collections...</p>;

  if (custom || collections.length === 0) {
    return (
      <label className="block">
        <span className="text-xs font-medium text-on-surface">Collection Name</span>
        <input className="mt-1 block w-full rounded border border-outline p-2 text-sm bg-surface" value={value} onChange={e => onChange(e.target.value)} placeholder="my-collection" />
        {collections.length > 0 && (
          <button type="button" onClick={() => setCustom(false)} className="text-[10px] text-primary hover:underline mt-1">Browse existing collections</button>
        )}
      </label>
    );
  }

  return (
    <div>
      <SelectField
        label="Collection"
        value={value}
        onChange={(v) => onChange(v)}
        options={[
          { value: '', label: 'Select collection...' },
          ...collections.map(c => ({ value: c, label: c })),
        ]}
      />
      <button type="button" onClick={() => setCustom(true)} className="text-[10px] text-primary hover:underline mt-1">Enter custom name</button>
    </div>
  );
}

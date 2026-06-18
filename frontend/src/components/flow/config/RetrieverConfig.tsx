import { useEffect, useState } from 'react';
import { CollectionSelector } from './CollectionSelector';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface RetrieverConfigProps {
  config: {
    embeddingProviderId?: string;
    vectorStoreId?: string;
    collectionName?: string;
    topK?: number;
    minScore?: number;
  };
  onChange: (config: any) => void;
}

export function RetrieverConfig({ config, onChange }: RetrieverConfigProps) {
  const [embeddingProviders, setEmbeddingProviders] = useState<any[]>([]);
  const [vectorStores, setVectorStores] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/embedding-providers`).then(r => r.json()).then(setEmbeddingProviders).catch(() => {});
    fetch(`${API_URL}/vector-stores`).then(r => r.json()).then(setVectorStores).catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Embedding Provider</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={config.embeddingProviderId || ''}
          onChange={e => onChange({ embeddingProviderId: e.target.value })}
        >
          <option value="">Select provider...</option>
          {embeddingProviders.map((ep: any) => (
            <option key={ep.id} value={ep.id}>{ep.name} ({ep.model})</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Vector Store</span>
        <select
          className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
          value={config.vectorStoreId || ''}
          onChange={e => onChange({ vectorStoreId: e.target.value })}
        >
          <option value="">Select store...</option>
          {vectorStores.map((vs: any) => (
            <option key={vs.id} value={vs.id}>{vs.name} ({vs.url})</option>
          ))}
        </select>
      </label>

      <CollectionSelector
        vectorStoreId={config.vectorStoreId || ''}
        value={config.collectionName || ''}
        onChange={collectionName => onChange({ collectionName })}
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Top-K</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
            value={config.topK ?? 5}
            onChange={e => onChange({ topK: parseInt(e.target.value) || 5 })}
            min={1} max={50}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Min Score</span>
          <input
            type="number" step="0.01"
            className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
            value={config.minScore ?? 0.7}
            onChange={e => onChange({ minScore: parseFloat(e.target.value) || 0.7 })}
            min={0} max={1}
          />
        </label>
      </div>
    </div>
  );
}

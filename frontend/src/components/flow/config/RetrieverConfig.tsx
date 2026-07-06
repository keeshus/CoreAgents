import { useEffect, useState } from 'react';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
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
  flow?: { group_id?: string };
}

export function RetrieverConfig({ config, onChange, flow }: RetrieverConfigProps) {
  const [embeddingProviders, setEmbeddingProviders] = useState<any[]>([]);
  const [vectorStores, setVectorStores] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/embedding-providers`).then(r => r.json()).then(data => setEmbeddingProviders(Array.isArray(data) ? data : [])).catch(() => {});
    fetch(`${API_URL}/vector-stores`).then(r => r.json()).then(data => setVectorStores(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const filteredEmbeddingProviders = flow?.group_id
    ? embeddingProviders.filter((ep: any) => !ep.group_id || ep.group_id === flow.group_id)
    : embeddingProviders;

  const filteredVectorStores = flow?.group_id
    ? vectorStores.filter((vs: any) => !vs.group_id || vs.group_id === flow.group_id)
    : vectorStores;

  return (
    <div className="space-y-3">
      <SelectField
        label="Embedding Provider"
        value={config.embeddingProviderId || ''}
        onChange={(v) => onChange({ embeddingProviderId: v })}
        options={[
          { value: '', label: 'Select provider...' },
          ...filteredEmbeddingProviders.map((ep: any) => ({ value: ep.id, label: `${ep.name} (${ep.model})` })),
        ]}
      />

      <SelectField
        label="Vector Store"
        value={config.vectorStoreId || ''}
        onChange={(v) => onChange({ vectorStoreId: v })}
        options={[
          { value: '', label: 'Select store...' },
          ...filteredVectorStores.map((vs: any) => ({ value: vs.id, label: `${vs.name} (${vs.url})` })),
        ]}
      />

      <CollectionSelector
        vectorStoreId={config.vectorStoreId || ''}
        value={config.collectionName || ''}
        onChange={collectionName => onChange({ collectionName })}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Top-K"
          type="number"
          value={String(config.topK ?? 5)}
          onChange={(v) => onChange({ topK: parseInt(v) || 5 })}
        />
        <TextField
          label="Min Score"
          type="number"
          value={String(config.minScore ?? 0.7)}
          onChange={(v) => onChange({ minScore: parseFloat(v) || 0.7 })}
        />
      </div>
    </div>
  );
}

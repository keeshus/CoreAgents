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
      <SelectField
        label="Embedding Provider"
        value={config.embeddingProviderId || ''}
        onChange={(v) => onChange({ embeddingProviderId: v })}
        options={[
          { value: '', label: 'Select provider...' },
          ...embeddingProviders.map((ep: any) => ({ value: ep.id, label: `${ep.name} (${ep.model})` })),
        ]}
      />

      <SelectField
        label="Vector Store"
        value={config.vectorStoreId || ''}
        onChange={(v) => onChange({ vectorStoreId: v })}
        options={[
          { value: '', label: 'Select store...' },
          ...vectorStores.map((vs: any) => ({ value: vs.id, label: `${vs.name} (${vs.url})` })),
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

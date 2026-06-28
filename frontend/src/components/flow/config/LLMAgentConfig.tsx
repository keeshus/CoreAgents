import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { TemplateAutocomplete } from './TemplateAutocomplete';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  litellm: 'LiteLLM',
};

interface LLMAgentConfigProps {
  config: {
    endpointId: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    responseFormat: 'text' | 'json_object';
    outputSchema?: string;
  };
  onChange: (config: any) => void;
  suggestions?: { upstreamLabels: string[]; nodes: any[]; edges: any[]; nodeId: string };
}

export function LLMAgentConfig({ config, onChange, suggestions }: LLMAgentConfigProps) {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<any>(null);

  useEffect(() => {
    api.llmEndpoints.list().then(setEndpoints).catch(() => {});
  }, []);

  useEffect(() => {
    const ep = endpoints.find((e: any) => e.id === config.endpointId);
    setSelectedEndpoint(ep || null);
  }, [config.endpointId, endpoints]);

  const handleEndpointChange = (endpointId: string) => {
    const ep = endpoints.find((e: any) => e.id === endpointId);
    onChange({ ...config, endpointId, endpointName: ep?.name || '', model: ep?.default_model || '' });
  };

  return (
    <div className="space-y-3">
      <div>
        <SelectField
          label="LLM Endpoint"
          value={config.endpointId}
          onChange={(v) => handleEndpointChange(v)}
          options={[
            { value: '', label: 'Select endpoint...' },
            ...endpoints.map((ep: any) => ({ value: ep.id, label: `${ep.name} (${PROVIDER_LABELS[ep.provider_type] || ep.provider_type})` })),
          ]}
        />
        {selectedEndpoint && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-primary">
            {PROVIDER_LABELS[selectedEndpoint.provider_type]}
          </span>
        )}
      </div>

      {selectedEndpoint && (
        <div>
          {selectedEndpoint.models?.length > 0 ? (
            <SelectField
              label="Model"
              value={config.model}
              onChange={(v) => onChange({ ...config, model: v })}
              options={[
                { value: '', label: 'Select model...' },
                ...selectedEndpoint.models.map((m: string) => ({ value: m, label: m })),
              ]}
            />
          ) : (
            <TextField
              label="Model"
              value={config.model}
              onChange={(v) => onChange({ ...config, model: v })}
              placeholder="e.g. claude-sonnet-4-20250514"
            />
          )}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium text-on-surface-variant">System Prompt</span>
        <TemplateAutocomplete
          value={config.systemPrompt}
          onChange={(v) => onChange({ ...config, systemPrompt: v })}
          placeholder="You are a helpful assistant... Type {{ for field suggestions"
          rows={4}
          nodeId={suggestions?.nodeId}
          nodes={suggestions?.nodes || []}
          edges={suggestions?.edges || []}
          selectedFields={(config as any).inputFields}
        />
        <p className="mt-1 text-[10px] text-on-surface-variant">Use {'{{'}input.Label.field{'}}'} to reference upstream data.</p>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-on-surface-variant">Temperature: {config.temperature}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            className="mt-1 block w-full"
            value={config.temperature}
            onChange={(e) =>
              onChange({ ...config, temperature: parseFloat(e.target.value) })
            }
          />
        </label>
        <TextField
          label="Max Tokens"
          type="number"
          value={String(config.maxTokens)}
          onChange={(v) => onChange({ ...config, maxTokens: parseInt(v) || 4096 })}
        />
      </div>

      <SelectField
        label="Response Format"
        value={config.responseFormat || 'text'}
        onChange={(v) => onChange({ ...config, responseFormat: v })}
        options={[
          { value: 'text', label: 'Plain Text' },
          { value: 'json_object', label: 'JSON' },
        ]}
      />

      {config.responseFormat === 'json_object' && (
        <div>
          <span className="text-xs font-medium text-on-surface-variant block mb-1">
            JSON Schema <span className="text-on-surface-variant">(optional)</span>
          </span>
          <textarea
            value={config.outputSchema || ''}
            onChange={(e) => onChange({ ...config, outputSchema: e.target.value })}
            placeholder='{"type":"object","properties":{"summary":{"type":"string"},"sentiment":{"type":"string"}},"required":["summary","sentiment"]}'
            rows={3}
            className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
          />
          <p className="mt-1 text-[10px] text-on-surface-variant">Describes the expected JSON structure. Used as guidance in the system prompt — tool-calling ensures the output matches the schema across all providers.</p>
        </div>
      )}
    </div>
  );
}

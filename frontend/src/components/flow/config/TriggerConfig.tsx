import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth-context';
import { API_URL } from '@/lib/api-client';
import { useState, useCallback } from 'react';

interface TriggerConfigProps {
  config: any;
  onChange: (updates: Record<string, any>) => void;
  flowId: string;
}

export function TriggerConfig({ config, onChange, flowId }: TriggerConfigProps) {
  const { user } = useAuth();
  const isAdmin = user?.permissions?.includes('admin') ?? false;
  const triggerType = config.triggerType || 'manual';
  const [personalKey, setPersonalKey] = useState<string | null>(null);
  const [personalKeyPrefix, setPersonalKeyPrefix] = useState<string>(
    config.personalApiKeyPrefix || ''
  );
  const [keyCreatedAt, setKeyCreatedAt] = useState<string>(
    config.personalApiKeyCreatedAt || ''
  );
  const [loading, setLoading] = useState(false);

  const handleRenew = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/flows/${flowId}/keys/renew`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to renew key');
      const data = await res.json();
      setPersonalKey(data.rawKey);
      setPersonalKeyPrefix(data.prefix);
      setKeyCreatedAt(data.createdAt);
    } catch (err) {
      console.error('Failed to renew API key:', err);
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  const handleRevoke = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/flows/${flowId}/keys/revoke`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to revoke key');
      setPersonalKey(null);
      setPersonalKeyPrefix('');
      setKeyCreatedAt('');
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  if (triggerType === 'subflow') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-on-surface-variant bg-secondary-container rounded border p-2">
          This flow is a subflow — it will be executed as a sub-routine within other flows.
          Define the input contract below.
        </p>
        <div>
          <p className="text-xs font-medium text-on-surface-variant mb-1">Input Schema</p>
          <textarea
            value={config.inputSchema || ''}
            onChange={(e) => onChange({ inputSchema: e.target.value })}
            placeholder='{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}'
            rows={8}
            className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <p className="mt-1 text-[10px] text-on-surface-variant">
            Define the expected input fields. The parent flow must map these fields.
          </p>
        </div>
        <TextField
          label="Description"
          value={config.inputMessage || ''}
          onChange={(v) => onChange({ inputMessage: v })}
          multiline
          rows={2}
          helpText="Help text shown when selecting this subflow"
        />
      </div>
    );
  }

  const pathSlug = config.pathSlug || '';
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';

  return (
    <div className="space-y-3">
      <SelectField
        label="Trigger Type"
        value={triggerType}
        onChange={(v) => onChange({ triggerType: v })}
        options={[
          { value: 'manual', label: 'Manual' },
          { value: 'chat', label: 'Chat' },
          { value: 'webhook', label: 'Webhook' },
          { value: 'schedule', label: 'Schedule' },
        ]}
      />

      {triggerType === 'webhook' && (
        <>
          {isAdmin && (
            <TextField
              label="Webhook Secret"
              value={config.webhookSecret || ''}
              onChange={(v) => onChange({ webhookSecret: v })}
              helpText="Pass as ?secret=... in the webhook URL. Only admins can set this."
            />
          )}

          <div className="bg-surface-container rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-on-surface-variant">Your Personal API Key</p>

            {personalKey ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface rounded px-2 py-1.5 border border-outline font-mono break-all">
                    {personalKey}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(personalKey)}
                    className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant"
                    title="Copy key"
                  >
                    <Icon name="content_copy" className="text-sm" />
                  </button>
                </div>
                <p className="text-[10px] text-warning">
                  This key is shown once. Copy it now. If you lose it, renew to generate a new one.
                </p>
              </div>
            ) : personalKeyPrefix ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-surface rounded px-2 py-1.5 border border-outline font-mono">
                    {personalKeyPrefix}...
                  </code>
                  <span className="text-[10px] text-on-surface-variant">
                    Created {keyCreatedAt ? new Date(keyCreatedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">
                No personal API key yet. Save the flow to auto-generate one.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleRenew}
                disabled={loading}
                className="text-xs px-2 py-1 rounded bg-primary-container text-primary hover:bg-primary-container/80 disabled:opacity-50"
              >
                {loading ? '...' : 'Renew Key'}
              </button>
              {personalKeyPrefix && (
                <button
                  onClick={handleRevoke}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded bg-error-container text-error hover:bg-error-container/80 disabled:opacity-50"
                >
                  Revoke Key
                </button>
              )}
            </div>

            <p className="text-[10px] text-on-surface-variant">
              Personal to you. Used with <code className="text-[10px] font-mono">Authorization: Bearer wh_...</code>.
              Sharing it allows others to act on your behalf.
            </p>
          </div>

          <div className="bg-surface-container rounded p-2">
            <p className="text-[10px] font-medium text-on-surface-variant mb-1">Webhook URL</p>
            <code className="text-[10px] text-on-surface-variant break-all">
              {baseUrl}/webhook/
              {pathSlug || flowId}
              {config.webhookSecret ? '?secret=••••••••' : ''}
            </code>
            {pathSlug && (
              <p className="text-[10px] text-on-surface-variant mt-1">
                OpenAPI spec: <a href={`${baseUrl}/openapi.json`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{baseUrl}/openapi.json</a>
                {' · '}
                <a href={`${baseUrl}/docs`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Swagger UI</a>
              </p>
            )}
          </div>
        </>
      )}

      {triggerType === 'schedule' && (
        <TextField
          label="Cron Expression"
          value={config.cronExpression || ''}
          onChange={(v) => onChange({ cronExpression: v })}
          helpText="minute hour day-of-month month day-of-week. E.g. &quot;0 9 * * *&quot; = daily at 9am, &quot;*/15 * * * *&quot; = every 15 min"
        />
      )}

      {(triggerType === 'schedule' || triggerType === 'manual') && (
        <TextField
          label="Input Message"
          value={config.inputMessage || ''}
          onChange={(v) => onChange({ inputMessage: v })}
          multiline
          rows={2}
          helpText="Sent to the next node each trigger. Plain text becomes the message, JSON objects are passed as structured input."
        />
      )}

      {triggerType === 'webhook' && (
        <div>
          <p className="text-xs font-medium text-on-surface-variant mb-1">Expected Input Schema</p>
          <textarea
            value={config.inputSchema || ''}
            onChange={(e) => onChange({ inputSchema: e.target.value })}
            placeholder='{"type":"object","properties":{...}}'
            rows={Math.max(3, Math.min(10, (config.inputSchema || '').split('\n').length))}
            className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary max-h-[200px]"
          />
          <p className="mt-1 text-[10px] text-on-surface-variant">Define required fields and types. Incoming POSTs are validated — invalid requests get 400.</p>
        </div>
      )}
    </div>
  );
}

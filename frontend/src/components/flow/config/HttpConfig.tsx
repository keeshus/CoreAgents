import { useCallback } from 'react';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';

interface HttpConfigProps {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

export function HttpConfig({ config, onChange }: HttpConfigProps) {
  const set = useCallback((key: string, value: any) => onChange({ [key]: value }), [onChange]);
  const method = config.method || 'GET';
  const showBody = ['POST', 'PUT', 'PATCH'].includes(method);

  return (
    <div className="space-y-4">
      <SelectField
        label="Method"
        value={method}
        onChange={(v) => onChange({ method: v, body: showBody ? config.body : undefined })}
        options={[
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'HEAD', label: 'HEAD' },
        ]}
      />
      <TextField label="URL" value={config.url || ''} onChange={(v) => set('url', v)} placeholder="https://api.example.com/endpoint" />
      <TextField label="Headers (JSON)" value={config.headers || ''} onChange={(v) => set('headers', v)} multiline rows={3} placeholder='{"Authorization": "Bearer {{input.token}}"}'
        helpText="JSON object of header name → value pairs. Use {{input.Var.field}} for dynamic values." />
      {showBody && (
        <TextField label="Request Body" value={config.body || ''} onChange={(v) => set('body', v)} multiline rows={4} placeholder='{"message": "{{input.trigger.message}}"}'
          helpText="Request body (JSON string with {{input.Var.field}} placeholders)." />
      )}
      <SelectField label="Auth Type" value={config.authType || 'none'} onChange={(v) => set('authType', v)}
        options={[
          { value: 'none', label: 'None' },
          { value: 'basic', label: 'Basic Auth' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'api-key', label: 'API Key' },
        ]} />
      {config.authType === 'basic' && (
        <div className="space-y-2 pl-3 border-l-2 border-outline-variant">
          <TextField label="Username" value={config.authUsername || ''} onChange={(v) => set('authUsername', v)} />
          <TextField label="Password" value={config.authPassword || ''} onChange={(v) => set('authPassword', v)} type="password" />
        </div>
      )}
      {config.authType === 'bearer' && (
        <div className="pl-3 border-l-2 border-outline-variant">
          <TextField label="Token" value={config.authToken || ''} onChange={(v) => set('authToken', v)} type="password" />
        </div>
      )}
      {config.authType === 'api-key' && (
        <div className="space-y-2 pl-3 border-l-2 border-outline-variant">
          <TextField label="Header Name" value={config.authKeyName || ''} onChange={(v) => set('authKeyName', v)} placeholder="X-API-Key" />
          <TextField label="Header Value" value={config.authKeyValue || ''} onChange={(v) => set('authKeyValue', v)} type="password" />
        </div>
      )}
      <div className="border-t border-outline-variant pt-3">
        <p className="text-xs font-medium text-on-surface-variant mb-2">Advanced</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
            <input type="checkbox" checked={config.followRedirects !== false} onChange={(e) => set('followRedirects', e.target.checked)} className="w-3 h-3 accent-primary" />
            Follow redirects
          </label>
          <TextField label="Timeout (ms)" value={String(config.timeout || 30000)} onChange={(v) => set('timeout', parseInt(v) || 30000)} type="number" />
          <TextField label="Retries" value={String(config.retries || 0)} onChange={(v) => set('retries', parseInt(v) || 0)} type="number" />
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={config.sslVerify !== false} onChange={(e) => set('sslVerify', e.target.checked)} className="w-3 h-3 accent-primary" />
            <span className="text-xs text-on-surface-variant">Verify SSL</span>
          </div>
          <TextField label="HMAC Secret" value={config.hmacSecret || ''} onChange={(v) => set('hmacSecret', v)} type="password" placeholder="Optional HMAC signing secret" />
          <TextField label="HMAC Header" value={config.hmacHeader || ''} onChange={(v) => set('hmacHeader', v)} placeholder="X-Signature" />
        </div>
      </div>
    </div>
  );
}

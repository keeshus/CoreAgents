import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';

interface TriggerConfigProps {
  config: any;
  onChange: (updates: Record<string, any>) => void;
  flowId: string;
}

export function TriggerConfig({ config, onChange, flowId }: TriggerConfigProps) {
  const triggerType = config.triggerType || 'manual';

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
          <TextField
            label="Webhook Secret"
            value={config.webhookSecret || ''}
            onChange={(v) => onChange({ webhookSecret: v })}
            helpText="Pass as ?secret=... in the webhook URL"
          />
          <div className="bg-surface-container rounded p-2">
            <p className="text-[10px] font-medium text-on-surface-variant mb-1">Webhook URL</p>
            <code className="text-[10px] text-on-surface-variant break-all">
              {process.env.NEXT_PUBLIC_API_URL || '/api'}/webhook/
              {flowId}
              {config.webhookSecret ? '?secret=••••••••' : ''}
            </code>
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

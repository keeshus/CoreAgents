import { useEffect, useState } from 'react';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { Icon } from '@/components/ui/Icon';
import Link from 'next/link';

export default function GlobalContextPage() {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useAssistantContext({ pageKey: 'settings:global-context', description: 'Editing the global context for all flows' });

  useEffect(() => {
    fetch('/api/settings/global-context', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { value: '' })
      .then(data => setValue(data.value || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/global-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Global context saved.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save global context.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Global Context</h1>
            <p className="text-sm text-on-surface-variant mt-1">Set the global system context for all LLM agents across all flows</p>
          </div>
        </div>

        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : (
          <div className="bg-surface rounded-xl border p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant block mb-1">Global Context</label>
              <textarea
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Describe your organisation, goals, brand voice, or any universal instructions that should apply to all LLM agents across all flows..."
                rows={15}
                className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
              />
              <p className="mt-1 text-[10px] text-on-surface-variant">
                This context is prepended to every LLM Agent call across all flows, before any group, flow, or node-specific context.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="m3-button disabled:opacity-50">
                <Icon name="save" className="text-sm" /> {saving ? 'Saving...' : 'Save'}
              </button>
              {message && (
                <span className={`text-xs ${message.type === 'success' ? 'text-success' : 'text-error'}`}>
                  {message.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

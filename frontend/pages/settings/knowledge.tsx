import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { api } from '@/lib/api-client';
import { useConfirm } from '@/lib/useConfirm';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function KnowledgePage() {
  const { user, userGroups } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const canAdmin = can('admin');

  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (canAdmin) {
      api.groups.list().then(setGroups).catch(() => {});
    } else {
      setGroups(userGroups);
    }
  }, [canAdmin, userGroups]);

  useAssistantContext({ pageKey: 'settings:knowledge', description: 'Managing knowledge bases' });

  const scopeLabel = filterGroupId
    ? groups.find((g) => g.id === filterGroupId)?.name || 'Group'
    : 'App-wide';

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant"><Icon name="arrow_back" className="text-base" /> <span>Back</span></Link>
          <div className="flex-1"><h1 className="text-2xl font-bold text-on-surface">Knowledge Bases</h1><p className="text-sm text-on-surface-variant mt-1">Embedding providers and vector stores for RAG</p></div>
        </div>

        {/* Group filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterGroupId(null)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              filterGroupId === null ? 'bg-primary text-on-primary shadow-m3-1' : 'bg-surface border border-outline text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <Icon name="public" className="text-sm mr-1" /> App-wide
          </button>
          {groups.length > 0 && (
            <SelectField
              label="Group"
              value={filterGroupId || ''}
              onChange={(v) => setFilterGroupId(v || null)}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              className="w-48"
            />
          )}
        </div>

        <EmbeddingProviders filterGroupId={filterGroupId} groups={groups} scopeLabel={scopeLabel} />
        <div className="mt-6"><VectorStores filterGroupId={filterGroupId} groups={groups} scopeLabel={scopeLabel} /></div>
      </div>
    </div>
  );
}

function EmbeddingProviders({ filterGroupId, groups, scopeLabel }: { filterGroupId: string | null; groups: Array<{ id: string; name: string }>; scopeLabel: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', model: 'text-embedding-ada-002', groupId: '' });
  const [saving, setSaving] = useState(false);
  const deleteConfirm = useConfirm({ title: 'Delete embedding provider?', message: 'Delete this embedding provider? This cannot be undone.' });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/embedding-providers${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [filterGroupId]);

  const reset = () => { setForm({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', model: 'text-embedding-ada-002', groupId: '' }); setEditingId(null); setShowForm(false); };

  const filteredItems = filterGroupId
    ? items.filter((ep) => ep.group_id === filterGroupId || !ep.group_id)
    : items;

  return (
    <div className="bg-surface rounded-lg border border-outline-variant p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-on-surface flex items-center gap-2"><Icon name="memory" className="text-base text-primary" /> Embedding Providers</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="m3-button"><Icon name="add" className="text-xs" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          const body: Record<string, unknown> = { ...form, baseUrl: form.baseUrl || null, groupId: form.groupId || null };
          delete body.groupId;
          if (form.groupId) body.group_id = form.groupId;
          if (editingId) { await fetch(`${API_URL}/embedding-providers/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          else { await fetch(`${API_URL}/embedding-providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-surface-container rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({...form, name: v})} />
            <SelectField label="Provider" value={form.providerType} onChange={(v) => setForm({...form, providerType: v})} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'litellm', label: 'LiteLLM' }]} />
            <TextField label="Base URL" value={form.baseUrl} onChange={(v) => setForm({...form, baseUrl: v})} />
            <TextField label="API Key" type="password" value={form.apiKey} onChange={(v) => setForm({...form, apiKey: v})} />
            <TextField label="Model" value={form.model} onChange={(v) => setForm({...form, model: v})} />
            {!editingId && groups.length > 0 && (
              <SelectField
                label="Scope"
                value={form.groupId}
                onChange={(v) => setForm({...form, groupId: v})}
                options={[
                  { value: '', label: 'App-wide' },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-white rounded disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-on-surface-variant">Loading...</p> : filteredItems.length === 0 ? <p className="text-sm text-on-surface-variant">No embedding providers configured</p> : (
        <div className="space-y-2">
          {filteredItems.map((ep: any) => (
            <div key={ep.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{ep.name}</p>
                  {ep.group_id ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-medium">
                      {groups.find((g) => g.id === ep.group_id)?.name || 'Group'}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium">App</span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant">{ep.provider_type} · {ep.model} · {ep.base_url || 'default'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setForm({ name: ep.name, providerType: ep.provider_type, baseUrl: ep.base_url || '', apiKey: '', model: ep.model, groupId: ep.group_id || '' }); setEditingId(ep.id); setShowForm(true); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors"><Icon name="edit" className="text-sm" /> Edit</button>
                <button onClick={async () => { const ok = await deleteConfirm.confirm({ message: 'Delete embedding provider "' + ep.name + '"? This cannot be undone.' }); if (!ok) return; await fetch(`${API_URL}/embedding-providers/${ep.id}`, { method: 'DELETE' }); loadData(); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors"><Icon name="delete" className="text-sm" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {deleteConfirm.dialog}
    </div>
  );
}

function VectorStores({ filterGroupId, groups, scopeLabel }: { filterGroupId: string | null; groups: Array<{ id: string; name: string }>; scopeLabel: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', apiKey: '', storeType: 'qdrant', groupId: '' });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const deleteConfirm = useConfirm({ title: 'Delete vector store?', message: 'Delete this vector store? This cannot be undone.' });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/vector-stores${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [filterGroupId]);

  const handleRefresh = async (id: string) => {
    setRefreshing(id);
    try {
      const res = await fetch(`${API_URL}/vector-stores/${id}/refresh`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setItems(prev => prev.map(v => v.id === id ? updated : v));
      }
    } catch {}
    setRefreshing(null);
  };

  const reset = () => { setForm({ name: '', url: '', apiKey: '', storeType: 'qdrant', groupId: '' }); setShowForm(false); };

  const filteredItems = filterGroupId
    ? items.filter((vs) => vs.group_id === filterGroupId || !vs.group_id)
    : items;

  return (
    <div className="bg-surface rounded-lg border border-outline-variant p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-on-surface flex items-center gap-2"><Icon name="database" className="text-base text-primary" /> Vector Stores</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="m3-button"><Icon name="add" className="text-xs" /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={async e => { e.preventDefault(); setSaving(true);
          const body: Record<string, unknown> = { ...form, groupId: form.groupId || null };
          delete body.groupId;
          if (form.groupId) body.group_id = form.groupId;
          await fetch(`${API_URL}/vector-stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          setSaving(false); reset(); loadData();
        }} className="mb-4 p-4 bg-surface-container rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({...form, name: v})} />
            <SelectField label="Type" value={form.storeType} onChange={(v) => setForm({...form, storeType: v})} options={[{ value: 'qdrant', label: 'Qdrant' }, { value: 'neo4j', label: 'Neo4j' }]} />
            <TextField label="URL" value={form.url} onChange={(v) => setForm({...form, url: v})} />
            <TextField label="API Key" type="password" value={form.apiKey} onChange={(v) => setForm({...form, apiKey: v})} />
            {groups.length > 0 && (
              <SelectField
                label="Scope"
                value={form.groupId}
                onChange={(v) => setForm({...form, groupId: v})}
                options={[
                  { value: '', label: 'App-wide' },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-white rounded disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-sm text-on-surface-variant">Loading...</p> : filteredItems.length === 0 ? <p className="text-sm text-on-surface-variant">No vector stores configured</p> : (
        <div className="space-y-2">
          {filteredItems.map((vs: any) => (
            <div key={vs.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{vs.name}</p>
                  {vs.group_id ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-medium">
                      {groups.find((g) => g.id === vs.group_id)?.name || 'Group'}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium">App</span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant">{vs.store_type} · {vs.url}</p>
                {vs.collections?.length > 0 && (
                  <p className="text-[10px] text-on-surface-variant mt-1">{vs.collections.length} collection{vs.collections.length !== 1 ? 's' : ''}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRefresh(vs.id)}
                  disabled={refreshing === vs.id}
                  className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors disabled:opacity-50"
                >
                  <Icon name="refresh" className={`text-sm ${refreshing === vs.id ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button onClick={async () => { const ok = await deleteConfirm.confirm({ message: 'Delete vector store "' + vs.name + '"? This cannot be undone.' }); if (!ok) return; await fetch(`${API_URL}/vector-stores/${vs.id}`, { method: 'DELETE' }); loadData(); }} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors"><Icon name="delete" className="text-sm" /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {deleteConfirm.dialog}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { API_URL } from '@/lib/api-client';
import { useConfirm } from '@/lib/useConfirm';
import { useAuth } from '@/lib/auth-context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { Tooltip } from '@/components/ui/Tooltip';

interface EnvVarEntry {
  name: string;
  type: 'static' | 'core_secret' | 'cyberark';
  value: string;
}

export default function EnvVarsPage() {
  const { user } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isAdmin = can('admin');
  useAssistantContext({ pageKey: 'settings:env-vars', description: 'Managing environment variables' });

  const [envVars, setEnvVars] = useState<EnvVarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingType, setEditingType] = useState<'static' | 'core_secret' | 'cyberark'>('static');
  const [editingSaving, setEditingSaving] = useState(false);

  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [formGroupId, setFormGroupId] = useState('');

  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<'static' | 'core_secret' | 'cyberark'>('static');
  const [newSaving, setNewSaving] = useState(false);

  const [availableSecrets, setAvailableSecrets] = useState<Array<{ id: string; name: string }>>([]);

  const deleteConfirm = useConfirm({ title: 'Delete environment variable?', message: 'Are you sure you want to delete this environment variable? This cannot be undone.' });

  const fetchEnvVars = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let raw: any;
      if (selectedGroupId) {
        const res = await fetch(`${API_URL}/env-vars/groups/${selectedGroupId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load environment variables');
        raw = await res.json();
      } else {
        const res = await fetch(`${API_URL}/env-vars`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load environment variables');
        raw = await res.json();
      }
      setEnvVars(Array.isArray(raw) ? raw : raw?.envVars || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environment variables');
    } finally { setLoading(false); }
  }, [selectedGroupId]);

  useEffect(() => { fetchEnvVars(); }, [fetchEnvVars]);

  useEffect(() => {
    const g = isAdmin
      ? fetch(`${API_URL}/groups`, { credentials: 'include' }).then(r => r.ok ? r.json() : [])
      : Promise.resolve(user?.groups || []);
    g.then(setGroups).catch(() => {});
  }, [isAdmin, user?.groups]);

  useEffect(() => {
    const scope = formGroupId ? 'group' : 'app';
    const url = formGroupId
      ? `${API_URL}/secrets?scope=${scope}&scopeId=${formGroupId}`
      : `${API_URL}/secrets?scope=app`;
    fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAvailableSecrets(Array.isArray(data) ? data : []))
      .catch(() => setAvailableSecrets([]));
  }, [formGroupId]);

  const saveEnvVars = async (vars: EnvVarEntry[]) => {
    const body = { envVars: vars };
    const url = formGroupId
      ? `${API_URL}/env-vars/groups/${formGroupId}`
      : `${API_URL}/env-vars`;
    const res = await fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: 'Save failed' }));
      throw new Error(errBody.message || errBody.error || 'Save failed');
    }
  };

  const resetForm = () => {
    setNewName(''); setNewValue(''); setNewType('static'); setFormGroupId('');
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!newName || !newValue) {
      setError('Please fill in all required fields.');
      return;
    }
    setNewSaving(true); setError(null);
    try {
      const entry: EnvVarEntry = { name: newName.trim(), type: newType, value: newValue };
      await saveEnvVars([...envVars, entry]);
      resetForm();
      await fetchEnvVars();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setNewSaving(false); }
  };

  const handleDelete = async (name: string) => {
    const confirmed = await deleteConfirm.confirm();
    if (!confirmed) return;
    setDeleting(name);
    try {
      await saveEnvVars(envVars.filter(v => v.name !== name));
      await fetchEnvVars();
    } catch { setError('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleEdit = async (name: string) => {
    if (!editingValue) { setError('Value is required.'); return; }
    setEditingSaving(true); setError(null);
    try {
      const updated = envVars.map(v =>
        v.name === name ? { ...v, type: editingType, value: editingValue } : v
      );
      await saveEnvVars(updated);
      setEditingName(null); setEditingValue('');
      await fetchEnvVars();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setEditingSaving(false); }
  };

  const readOnly = selectedGroupId ? !isAdmin : !isAdmin;

  const typeOptions = [
    { value: 'static', label: 'Static' },
    { value: 'core_secret', label: 'Core Secret' },
    { value: 'cyberark', label: 'CyberArk' },
  ];

  const secretOptions = availableSecrets.map(s => ({ value: s.name, label: s.name }));

  const badge = (type: string) => {
    switch (type) {
      case 'static':
        return <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-surface-container-high text-on-surface-variant">Static</span>;
      case 'core_secret':
        return <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-primary-container text-primary">Core Secret</span>;
      case 'cyberark':
        return <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-secondary-container text-on-surface">CyberArk</span>;
      default:
        return null;
    }
  };

  const renderValueField = (type: string, value: string, onChange: (v: string) => void, label: string) => {
    if (type === 'core_secret') {
      return (
        <SelectField
          label={label}
          value={value}
          onChange={onChange}
          options={[
            { value: '', label: '— Select a secret —' },
            ...secretOptions,
          ]}
        />
      );
    }
    if (type === 'cyberark') {
      return (
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          placeholder="e.g. /apps/myapp/deploy/key"
        />
      );
    }
    return (
      <TextField
        label={label}
        value={value}
        onChange={onChange}
        placeholder="Enter plain text value"
      />
    );
  };

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 data-testid="env-vars-heading" className="text-2xl font-bold text-on-surface">Environment Variables</h1>
            <p className="text-sm text-on-surface-variant mt-1">Manage environment variables for app-wide use and per-group scopes.</p>
          </div>
          {!showForm && (selectedGroupId || isAdmin) && (
            <button data-testid="add-variable-btn" onClick={() => setShowForm(true)} className="m3-button gap-2">
              <Icon name="add" className="text-base" /> Add Variable
            </button>
          )}
        </div>

        {error && <div className="bg-error-container border text-error text-sm rounded p-3 mb-4">{error}</div>}

        {/* Group filter */}
        <div data-testid="group-filter" className="mb-4 max-w-xs">
          <SelectField
            label="Filter by group"
            value={selectedGroupId}
            onChange={(v) => setSelectedGroupId(v)}
            options={[
              { value: '', label: 'App-wide variables' },
              ...groups.map(g => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>

        {/* Add form */}
        {showForm && (
          <div data-testid="add-var-form" className="bg-surface rounded-xl border p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">New Environment Variable</h3>
            </div>
            <SelectField
              label="Group"
              value={formGroupId}
              onChange={(v) => setFormGroupId(v)}
              options={[
                { value: '', label: '— No group (app env var) —' },
                ...groups.map(g => ({ value: g.id, label: g.name })),
              ]}
            />
            <TextField label="Variable name" value={newName} onChange={setNewName} placeholder="e.g. GITLAB_TOKEN" />
            <SelectField
              label="Type"
              value={newType}
              onChange={(v) => { setNewType(v as 'static' | 'core_secret' | 'cyberark'); setNewValue(''); }}
              options={typeOptions}
            />
            {renderValueField(newType, newValue, setNewValue, 'Value')}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                data-testid="cancel-var-btn"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <Tooltip content={(!newName || !newValue) ? 'Fill in all required fields' : ''}>
                <span>
                  <button data-testid="create-var-btn" onClick={handleCreate} disabled={newSaving || !newName || !newValue} className="m3-button disabled:opacity-50 disabled:cursor-not-allowed">{newSaving ? 'Saving...' : 'Create'}</button>
                </span>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Env vars list */}
        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : envVars.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border">
            <Icon name="code" className="text-5xl text-on-surface-variant mx-auto mb-3" />
            <p className="text-on-surface-variant font-medium">
              {selectedGroupId ? 'No environment variables in this group' : 'No environment variables'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {selectedGroupId ? 'Add a variable above.' : isAdmin ? 'Add an app-wide variable or select a group to manage group variables.' : 'Select a group to manage group variables.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {envVars.map(v => {
              const isEditing = editingName === v.name;
              return (
                <div key={v.name} data-testid="env-var-item" className="bg-surface rounded-lg border px-4 py-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-on-surface">{v.name}</span>
                      </div>
                      <SelectField
                        label="Type"
                        value={editingType}
                        onChange={(val) => setEditingType(val as 'static' | 'core_secret' | 'cyberark')}
                        options={typeOptions}
                      />
                      {renderValueField(editingType, editingValue, setEditingValue, 'Value')}
                      <div className="flex items-center gap-2 justify-end">
                        <button type="button" onClick={() => { setEditingName(null); setEditingValue(''); }} className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors">Cancel</button>
                        <Tooltip content={!editingValue ? 'Fill in value' : ''}>
                          <span>
                            <button onClick={() => handleEdit(v.name)} disabled={editingSaving || !editingValue} className="m3-button disabled:opacity-50 disabled:cursor-not-allowed">{editingSaving ? 'Saving...' : 'Save'}</button>
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-on-surface">{v.name}</span>
                        {badge(v.type)}
                        <span className="text-xs font-mono text-on-surface-variant ml-2">{v.value}</span>
                        {readOnly && <span className="text-[10px] text-on-surface-variant ml-1">· read-only</span>}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <Tooltip content="Edit variable">
                            <button data-testid="edit-var-btn" onClick={() => { setEditingName(v.name); setEditingValue(v.value); setEditingType(v.type); }} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded text-xs">
                              <Icon name="edit" className="text-sm" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Delete variable">
                            <button data-testid="delete-var-btn" onClick={() => handleDelete(v.name)} disabled={deleting === v.name} className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded text-xs">
                              <Icon name="delete" className="text-sm" />
                            </button>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {deleteConfirm.dialog}
    </div>
  );
}

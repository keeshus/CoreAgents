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

export default function SecretsPage() {
  const { user } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isAdmin = can('admin');
  useAssistantContext({ pageKey: 'settings:secrets', description: 'Managing secrets' });

  const [secrets, setSecrets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null);
  const [editingSecretValue, setEditingSecretValue] = useState('');
  const [editingSecretSaving, setEditingSecretSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [reEncrypting, setReEncrypting] = useState(false);

  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [newSecretType, setNewSecretType] = useState<'core' | 'cyberark'>('core');
  const [newSecretSaving, setNewSecretSaving] = useState(false);
  const [formGroupId, setFormGroupId] = useState('');
  const [groupHasVault, setGroupHasVault] = useState(false);

  const deleteConfirm = useConfirm({ title: 'Delete secret?', message: 'Are you sure you want to delete this secret? This cannot be undone.' });
  const rotateConfirm = useConfirm({ title: 'Rotate encryption key?', message: 'Rotate the root encryption key used to encrypt all secrets at rest?' });
  const reEncryptConfirm = useConfirm({ title: 'Re-encrypt secrets?', message: 'Re-encrypt all secrets with the current key?' });

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const fetchSecrets = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (selectedGroupId) {
        const res = await fetch(`${API_URL}/secrets?scope=group&scopeId=${selectedGroupId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load secrets');
        const data = await res.json();
        setSecrets(data.map((s: any) => ({ ...s, _scope: 'group', _groupName: selectedGroup?.name })));
      } else {
        const appRes = await fetch(`${API_URL}/secrets?scope=app`, { credentials: 'include' });
        const appData = appRes.ok ? await appRes.json() : [];
        const groupResults = await Promise.all(
          groups.map(g =>
            fetch(`${API_URL}/secrets?scope=group&scopeId=${g.id}`, { credentials: 'include' })
              .then(r => r.ok ? r.json() : [])
              .then(data => data.map((s: any) => ({ ...s, _scope: 'group', _groupName: g.name })))
              .catch(() => [])
          )
        );
        setSecrets([
          ...appData.map((s: any) => ({ ...s, _scope: 'app' })),
          ...groupResults.flat(),
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load secrets');
    } finally { setLoading(false); }
  }, [selectedGroupId, selectedGroup?.name, groups]);

  useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

  useEffect(() => {
    const g = isAdmin
      ? fetch(`${API_URL}/groups`, { credentials: 'include' }).then(r => r.ok ? r.json() : [])
      : Promise.resolve(user?.groups || []);
    g.then(setGroups).catch(() => {});
  }, [isAdmin, user?.groups]);

  useEffect(() => {
    if (!formGroupId) { setGroupHasVault(false); return; }
    fetch(`/api/group-vault-config/${formGroupId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { exists: false })
      .then(data => setGroupHasVault(data.exists === true && data.vaultId != null))
      .catch(() => setGroupHasVault(false));
  }, [formGroupId]);

  const resetForm = () => {
    setNewSecretName(''); setNewSecretValue(''); setNewSecretType('core'); setFormGroupId(''); setGroupHasVault(false);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!newSecretName || (newSecretType === 'core' && !newSecretValue) || (newSecretType === 'cyberark' && !newSecretValue)) {
      setError('Please fill in all required fields.');
      return;
    }
    setNewSecretSaving(true); setError(null);
    try {
      if (formGroupId) {
        const body: Record<string, unknown> = { name: newSecretName, scope: 'group', scopeId: formGroupId, secretType: newSecretType };
        if (newSecretType === 'core') body.value = newSecretValue;
        else body.referencePath = newSecretValue;
        const res = await fetch(`${API_URL}/secrets`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Create failed' }));
          throw new Error(errBody.message || errBody.error || 'Create failed');
        }
      } else {
        const res = await fetch(`${API_URL}/secrets`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ name: newSecretName.trim(), value: newSecretValue, scope: 'app' }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Create failed' }));
          throw new Error(errBody.message || errBody.error || 'Create failed');
        }
      }
      resetForm();
      await fetchSecrets();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setNewSecretSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await deleteConfirm.confirm();
    if (!confirmed) return;
    setDeleting(id);
    try {
      await fetch(`${API_URL}/secrets/${id}`, { method: 'DELETE', credentials: 'include' });
      await fetchSecrets();
    } catch { setError('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleEditSecret = async (id: string) => {
    if (!editingSecretValue) { setError('Value is required.'); return; }
    setEditingSecretSaving(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/secrets/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ value: editingSecretValue }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Update failed' }));
        throw new Error(errBody.message || errBody.error || 'Update failed');
      }
      setEditingSecretId(null); setEditingSecretValue('');
      await fetchSecrets();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setEditingSecretSaving(false); }
  };

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="flex items-center gap-1 leading-none text-on-surface-variant hover:text-on-surface-variant">
            <Icon name="arrow_back" className="text-base" /> <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-on-surface">Secrets</h1>
            <p className="text-sm text-on-surface-variant mt-1">Manage encrypted secrets for app-wide use and per-group scopes.</p>
          </div>
          {!showForm && (selectedGroupId || isAdmin) && (
            <button onClick={() => setShowForm(true)} className="m3-button gap-2">
              <Icon name="add" className="text-base" /> Add Secret
            </button>
          )}
        </div>

        {error && <div className="bg-error-container border text-error text-sm rounded p-3 mb-4">{error}</div>}

        {/* Group filter */}
        <div className="mb-4 max-w-xs">
          <SelectField
            label="Filter by group"
            value={selectedGroupId}
            onChange={(v) => setSelectedGroupId(v)}
            options={[
              { value: '', label: 'All secrets' },
              ...groups.map(g => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>

        {/* Add secret form */}
        {showForm && (
          <div className="bg-surface rounded-xl border p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">New Secret</h3>
            </div>
            {groups.length > 0 && (
              <SelectField
                label="Group"
                value={formGroupId}
                onChange={(v) => setFormGroupId(v)}
                options={[
                  { value: '', label: '— No group (app secret) —' },
                  ...groups.map(g => ({ value: g.id, label: g.name })),
                ]}
              />
            )}
            <TextField label="Secret name" value={newSecretName} onChange={setNewSecretName} />
            {formGroupId && (
              <div className="flex gap-1">
                <button
                  onClick={() => setNewSecretType('core')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    newSecretType === 'core' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >Core</button>
                <button
                  onClick={() => setNewSecretType('cyberark')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    newSecretType === 'cyberark' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >CyberArk</button>
              </div>
            )}
            {formGroupId && newSecretType === 'cyberark' && !groupHasVault && (
              <p className="text-[10px] text-warning">No vault configured for this group. CyberArk secrets will not resolve at runtime.</p>
            )}
            {!formGroupId && (
              <p className="text-[10px] text-on-surface-variant">CyberArk secrets are only available for group-level secrets because vaults are configured per group.</p>
            )}
            {formGroupId && newSecretType === 'cyberark' ? (
              <TextField label="Reference path" value={newSecretValue} onChange={setNewSecretValue} helpText="e.g. prod/db/password — resolved live from Conjur" />
            ) : (
               <TextField label="Value" type="password" value={newSecretValue} onChange={setNewSecretValue} showPasswordToggle />
            )}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <Tooltip content={(!newSecretName || (newSecretType === 'core' && !newSecretValue) || (newSecretType === 'cyberark' && !newSecretValue)) ? 'Fill in all required fields' : ''}>
                <span>
                  <button onClick={handleCreate} disabled={newSecretSaving || !newSecretName || (newSecretType === 'core' && !newSecretValue) || (newSecretType === 'cyberark' && !newSecretValue)} className="m3-button disabled:opacity-50 disabled:cursor-not-allowed">{newSecretSaving ? 'Saving...' : 'Create'}</button>
                </span>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Secrets list */}
        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : secrets.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border">
            <Icon name="key" className="text-5xl text-on-surface-variant mx-auto mb-3" />
            <p className="text-on-surface-variant font-medium">
              {selectedGroupId ? 'No secrets in this group' : 'No secrets'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {selectedGroupId ? 'Add a secret above.' : isAdmin ? 'Add an app-wide secret or select a group to manage group secrets.' : 'Select a group to manage group secrets.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {secrets.map(s => {
              const isAppSecret = s._scope === 'app';
              const readOnly = !isAdmin && isAppSecret;
              const isEditing = editingSecretId === s.id;
              return (
                <div key={s.id} className="bg-surface rounded-lg border px-4 py-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-on-surface">{s.name}</span>
                      </div>
                       <TextField label="New value" type="password" value={editingSecretValue} onChange={setEditingSecretValue} showPasswordToggle />
                      <div className="flex items-center gap-2 justify-end">
                        <button type="button" onClick={() => { setEditingSecretId(null); setEditingSecretValue(''); }} className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface border border-outline rounded-lg hover:bg-surface-container-high transition-colors">Cancel</button>
                        <Tooltip content={!editingSecretValue ? 'Fill in value' : ''}>
                          <span>
                            <button onClick={() => handleEditSecret(s.id)} disabled={editingSecretSaving || !editingSecretValue} className="m3-button disabled:opacity-50 disabled:cursor-not-allowed">{editingSecretSaving ? 'Saving...' : 'Save'}</button>
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-on-surface">{s.name}</span>
                        {s.secretType === 'cyberark' ? (
                          <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-surface-container-high text-on-surface-variant">CyberArk</span>
                        ) : (
                          <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-primary-container text-primary">Core</span>
                        )}
                        {s.maskedValue && (
                          <span className="text-xs font-mono text-on-surface-variant ml-2">{s.maskedValue}</span>
                        )}
                        {s._scope === 'app' ? (
                          <span className="text-[10px] text-on-surface-variant ml-2">app-wide</span>
                        ) : (
                          <span className="text-[10px] text-on-surface-variant ml-2">{s._groupName || 'group'}</span>
                        )}
                        {readOnly && <span className="text-[10px] text-on-surface-variant ml-1">· read-only</span>}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <Tooltip content="Edit value">
                            <button onClick={() => { setEditingSecretId(s.id); setEditingSecretValue(''); }} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded text-xs">
                              <Icon name="edit" className="text-sm" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Delete secret">
                            <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded text-xs">
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

        {can('admin') && (
          <div className="bg-surface rounded-xl border p-4 mt-8 space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="vpn_key" className="text-xl text-on-surface-variant" />
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Encryption Key Administration</h3>
                <p className="text-xs text-on-surface-variant">All secrets are encrypted at rest using a root encryption key. Rotating the key generates a new key for future secrets, while re-encrypting applies the current key to all existing secrets.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={async () => { const ok = await rotateConfirm.confirm(); if (!ok) return; setRotating(true); try { await fetch('/api/secrets/rotate-key', { method: 'POST', credentials: 'include' }); } catch {} finally { setRotating(false); } }} disabled={rotating} className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50">
                {rotating ? 'Rotating...' : 'Rotate Key'}
              </button>
              <button onClick={async () => { const ok = await reEncryptConfirm.confirm(); if (!ok) return; setReEncrypting(true); try { await fetch('/api/secrets/re-encrypt', { method: 'POST', credentials: 'include' }); await fetchSecrets(); } catch {} finally { setReEncrypting(false); } }} disabled={reEncrypting} className="px-4 py-2 text-sm font-medium text-error border border-error rounded-lg hover:bg-error-container transition-colors disabled:opacity-50">
                {reEncrypting ? 'Re-encrypting...' : 'Re-encrypt All'}
              </button>
            </div>
          </div>
        )}
      </div>
      {deleteConfirm.dialog}
      {rotateConfirm.dialog}
      {reEncryptConfirm.dialog}
    </div>
  );
}

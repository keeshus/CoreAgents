import { useState, useEffect, useRef } from 'react';
import { TemplateAutocomplete } from '@/components/flow/config/TemplateAutocomplete';
import { API_URL } from '@/lib/api-client';
import { Search, X, Check, Loader2 } from 'lucide-react';

interface HITLNodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  nodeId: string;
  nodes: any[];
  edges: any[];
}

interface Role {
  id: string;
  name: string;
}

interface User {
  id: string;
  email: string;
  name: string;
}

function UserSearch({ assignedUserId, onSelect }: { assignedUserId: string; onSelect: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_URL}/users`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = query
    ? users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))
    : users;

  const selected = users.find(u => u.id === assignedUserId);

  return (
    <div ref={wrapperRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 border border-gray-300 rounded p-2 text-sm bg-gray-50">
          <span className="flex-1">{selected.name} <span className="text-gray-400">({selected.email})</span></span>
          <button onClick={() => { onSelect(''); setQuery(''); }} className="text-gray-400 hover:text-red-600">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input
            className="w-full rounded border border-gray-300 p-2 pl-8 text-sm"
            placeholder="Search users..."
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
      )}
      {open && !selected && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No users found</p>
          ) : (
            filtered.map(u => (
              <button
                key={u.id}
                onClick={() => { onSelect(u.id); setOpen(false); setQuery(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
              >
                <span className="font-medium text-gray-900">{u.name}</span>
                <span className="text-gray-400 ml-2">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RoleSelect({ assignedRoleId, onSelect }: { assignedRoleId: string; onSelect: (roleId: string) => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/roles`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-gray-400 py-1">Loading roles...</div>;

  return (
    <select
      className="block w-full rounded border border-gray-300 p-2 text-sm bg-white"
      value={assignedRoleId}
      onChange={e => onSelect(e.target.value)}
    >
      <option value="">Select a role...</option>
      {roles.map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
}

export function HITLNodeConfig({ config, onChange, nodeId, nodes, edges }: HITLNodeConfigProps) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Prompt for the User</span>
        <TemplateAutocomplete
          value={config.prompt || ''}
          onChange={(v) => onChange({ prompt: v })}
          placeholder="Please review the generated content before proceeding... Type {{ for field suggestions"
          rows={3}
          nodeId={nodeId}
          nodes={nodes}
          edges={edges}
          selectedFields={config?.inputFields}
        />
      </label>
      <div className="space-y-2">
        <span className="text-sm font-medium text-gray-700 block">Buttons</span>
        {(
          config.buttons || [
            { label: 'Approve', value: 'approved' },
            { label: 'Reject', value: 'rejected' },
          ]
        ).map((btn: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 p-2 text-sm"
              value={btn.label}
              onChange={(e) => {
                const btns = [...(config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                btns[i] = { ...btns[i], label: e.target.value };
                onChange({ buttons: btns });
              }}
              placeholder="Button label"
            />
            <input
              className="flex-1 rounded border border-gray-300 p-2 text-sm font-mono"
              value={btn.value}
              onChange={(e) => {
                const btns = [...(config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                btns[i] = { ...btns[i], value: e.target.value };
                onChange({ buttons: btns });
              }}
              placeholder="value"
            />
            <button
              onClick={() => {
                const btns = [
                  ...(config.buttons || [
                    { label: 'Approve', value: 'approved' },
                    { label: 'Reject', value: 'rejected' },
                  ]),
                ];
                btns.splice(i, 1);
                onChange({
                  buttons: btns.length > 0 ? btns : [{ label: 'Approve', value: 'approved' }],
                });
              }}
              className="w-6 h-6 flex items-center justify-center text-xs bg-red-200 text-red-800 rounded hover:bg-red-300 shrink-0 font-bold"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const btns = [
              ...(config.buttons || [
                { label: 'Approve', value: 'approved' },
                { label: 'Reject', value: 'rejected' },
              ]),
            ];
            onChange({ buttons: [...btns, { label: '', value: '' }] });
          }}
          className="text-sm text-blue-600 hover:underline block"
        >
          + Add Button
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={config?.allowFeedback !== false}
          onChange={(e) => onChange({ allowFeedback: e.target.checked })}
          className="rounded accent-blue-500"
        />
        <span className="text-sm text-gray-700">Allow reviewer feedback</span>
        <span className="text-xs text-gray-400">(text input field)</span>
      </label>
      {/* Assignment picker */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <span className="text-sm font-medium text-gray-700 block mb-2">Assignment</span>
        <div className="space-y-2">
          <select
            className="block w-full rounded border border-gray-300 p-2 text-sm bg-white"
            value={config.assignedTo?.type || 'anyone'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'anyone') {
                const { assignedTo, ...rest } = config;
                onChange({ ...rest, assignedTo: undefined });
              } else if (val === 'role') {
                onChange({ assignedTo: { type: 'role', roleId: '' } });
              } else {
                onChange({ assignedTo: { type: 'user', userId: '' } });
              }
            }}
          >
            <option value="anyone">Anyone (no restriction)</option>
            <option value="role">Specific role</option>
            <option value="user">Specific user</option>
          </select>
          {config.assignedTo?.type === 'role' && (
            <RoleSelect
              assignedRoleId={config.assignedTo.roleId || ''}
              onSelect={(roleId) => onChange({ assignedTo: { ...config.assignedTo, roleId } })}
            />
          )}
          {config.assignedTo?.type === 'user' && (
            <UserSearch
              assignedUserId={config.assignedTo.userId || ''}
              onSelect={(userId) => onChange({ assignedTo: { ...config.assignedTo, userId } })}
            />
          )}
          <p className="text-[10px] text-gray-400">
            Restrict approval visibility to a specific user or role.
          </p>
        </div>
      </div>
    </div>
  );
}

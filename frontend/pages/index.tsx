import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api-client';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useConfirm } from '@/lib/useConfirm';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { Tooltip } from '@/components/ui/Tooltip';

type Tab = 'flows' | 'subflows' | 'contexts';

export default function FlowsListPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const authConfig = useAuthConfig();
  const [activeTab, setActiveTab] = useState<Tab>('flows');
  const [flows, setFlows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'updated_at' | 'created_at'>('updated_at');
  const [groupFilter, setGroupFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, 'running' | 'ok' | 'error' | null>>({});
  const deleteConfirm = useConfirm({ title: 'Delete flow?', message: 'Are you sure you want to delete this flow? This cannot be undone.' });
  const PAGE_SIZE = 20;
  const router = useRouter();

  // ── Agent Contexts state ──
  const [contexts, setContexts] = useState<any[]>([]);
  const [contextsLoading, setContextsLoading] = useState(false);
  const [showContextForm, setShowContextForm] = useState(false);
  const [editingContext, setEditingContext] = useState<any | null>(null);
  const [contextTitle, setContextTitle] = useState('');
  const [contextDescription, setContextDescription] = useState('');
  const [contextContent, setContextContent] = useState('');
  const [contextGroupId, setContextGroupId] = useState('');
  const contextDeleteConfirm = useConfirm({ title: 'Delete context?', message: 'Are you sure you want to delete this agent context? Flows using it will no longer receive it.' });

  useAssistantContext({ pageKey: 'flows-list', description: 'Viewing all flows' });
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const isReader = user && !can('flow:create');

  useEffect(() => {
    if (authLoading) return;
    if (isReader) { router.replace('/approvals'); return; }
    if (!user) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/setup-status`)
        .then(r => r.json())
        .then(data => { if (data.required) router.replace('/setup'); })
        .catch(() => {});
    }
  }, [authLoading, isReader, user, router]);

  useEffect(() => {
    if (authLoading) { setLoading(true); return; }
    if (!user || isReader) { setLoading(false); return; }
    if (activeTab === 'contexts') return;
    const isSubflowFilter = activeTab === 'subflows';
    api.flows.list({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: search || undefined, sort, is_subflow: isSubflowFilter, group_id: groupFilter || undefined }).then(({ data, total }) => { setFlows(data || []); setTotal(total || 0); }).catch(() => { setFlows([]); setTotal(0); }).finally(() => setLoading(false));
  }, [user, authLoading, isReader, page, search, sort, activeTab, groupFilter]);

  // Fetch groups for filter
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!user) return;
    if (can('admin')) {
      api.groups.list().then(setGroups).catch(() => {});
    } else {
      setGroups(user.groups || []);
    }
  }, [user]);

  // Fetch agent contexts when tab switches
  useEffect(() => {
    if (activeTab !== 'contexts') return;
    setContextsLoading(true);
    fetch('/api/agent-contexts', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setContexts)
      .catch(() => setContexts([]))
      .finally(() => setContextsLoading(false));
  }, [activeTab]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleCreate = () => {
    router.push(activeTab === 'subflows' ? '/flows/new/edit?triggerType=subflow' : '/flows/new/edit');
  };

  const handleDelete = async (id: string) => {
    const confirmed = await deleteConfirm.confirm();
    if (!confirmed) return;
    await api.flows.delete(id);
    setFlows(flows.filter(f => f.id !== id));
  };

  const handleRun = async (flowId: string) => {
    setRunning((prev) => ({ ...prev, [flowId]: 'running' }));
    try {
      const flow = flows.find(f => f.id === flowId);
      const triggerNode = flow?.nodes?.find((n: any) => n.data?.type === 'trigger');
      const inputMessage = triggerNode?.data?.config?.inputMessage || '';
      let input: any;
      try { input = inputMessage ? JSON.parse(inputMessage) : { message: inputMessage || 'Hello!' }; }
      catch { input = { message: inputMessage || 'Hello!' }; }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      await api.flows.execute(flowId, input, controller.signal);
      clearTimeout(timeout);
      setRunning((prev) => ({ ...prev, [flowId]: 'ok' }));
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setRunning((prev) => ({ ...prev, [flowId]: 'error' }));
      } else {
        setRunning((prev) => ({ ...prev, [flowId]: null }));
      }
    }
    setTimeout(() => setRunning((prev) => ({ ...prev, [flowId]: null })), 2000);
  };

  // ── Agent Context CRUD handlers ──
  const resetContextForm = () => {
    setContextTitle('');
    setContextDescription('');
    setContextContent('');
    setContextGroupId('');
    setEditingContext(null);
    setShowContextForm(false);
  };

  const handleEditContext = (ctx: any) => {
    setEditingContext(ctx);
    setContextTitle(ctx.title);
    setContextDescription(ctx.description || '');
    setContextContent(ctx.content || '');
    setContextGroupId(ctx.group_id || '');
    setShowContextForm(true);
  };

  const handleSaveContext = async () => {
    if (!contextTitle.trim()) return;
    const body: Record<string, unknown> = { title: contextTitle.trim(), description: contextDescription, content: contextContent, group_id: contextGroupId || null };
    try {
      if (editingContext) {
        const updated = await fetch(`/api/agent-contexts/${editingContext.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }).then(r => r.json());
        setContexts(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await fetch('/api/agent-contexts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }).then(r => r.json());
        setContexts(prev => [...prev, created]);
      }
      resetContextForm();
    } catch { /* ignore */ }
  };

  const handleDeleteContext = async (id: string) => {
    const confirmed = await contextDeleteConfirm.confirm();
    if (!confirmed) return;
    try {
      await fetch(`/api/agent-contexts/${id}`, { method: 'DELETE', credentials: 'include' });
      setContexts(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'flows', label: 'Flows', icon: 'account_tree' },
    { key: 'subflows', label: 'Subflows', icon: 'call_split' },
    { key: 'contexts', label: 'Agent Contexts', icon: 'sms' },
  ];

  if (!authLoading && !user) {
    const hasSso = authConfig?.sso != null;
    const ssoName = authConfig?.sso?.name || 'SSO';
    return (
      <div className="min-h-screen bg-surface-container flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-6">
          <Icon name="account_tree" className="text-6xl text-primary mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-on-surface mb-3">Core Agents</h1>
          <p className="text-on-surface-variant mb-8">Visual LLM agent builder. Build, test, and deploy AI workflows with a drag-and-drop editor.</p>
          <div className="space-y-3">
            {hasSso && (
              <a href={`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/sso/login`} className="flex items-center justify-center gap-2 w-full border-2 border-outline text-on-surface rounded-xl p-3 text-sm font-medium hover:bg-surface-container-high transition-colors">
                <Icon name="login" className="text-xl" />
                Sign in with {ssoName}
              </a>
            )}
            <Link href="/login" className="block w-full m3-button text-center">Sign In</Link>
            <Link href="/register" className="block w-full text-sm text-primary hover:underline mt-2">Create an account</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-container">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Core Agents</h1>
            {!isReader && <p className="text-sm text-on-surface-variant mt-1">Build and manage your LLM agent workflows</p>}
          </div>
          <div className="flex items-center gap-2">
            {authLoading ? null : user ? (
              <>
                <span className="text-xs text-on-surface-variant mr-1">{user.name}</span>
                <Tooltip content="Profile">
                  <Link href="/profile" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                    <Icon name="person" className="text-sm" /> Profile
                  </Link>
                </Tooltip>
                {can('execution:approve') && (
                  <Tooltip content="All pending approvals">
                    <Link href="/approvals" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                      <Icon name="thumb_up" className="text-base" /> Approvals
                    </Link>
                  </Tooltip>
                )}
                {can('admin') && (
                <Tooltip content="Settings">
                  <Link href="/settings" className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                    <Icon name="settings" className="text-sm" /> Settings
                  </Link>
                </Tooltip>
                )}
                <Tooltip content="Sign Out">
                  <button onClick={handleLogout} className="flex items-center gap-1 p-2 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors">
                    <Icon name="logout" className="text-xl" /> Sign Out
                  </button>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip content="Sign In">
                  <Link href="/login" className="flex items-center gap-1 px-3 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                    <Icon name="login" className="text-base" /> Sign In
                  </Link>
                </Tooltip>
                <Tooltip content="Create Account">
                  <Link href="/register" className="m3-button">
                    <Icon name="person_add" className="text-base" /> Register
                  </Link>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center border-b border-outline-variant mb-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
              }`}
            >
              <Icon name={tab.icon} className="text-base" />
              {tab.label}
            </button>
          ))}
        </div>

        {authLoading ? (
          <div className="flex items-center justify-center py-16">
            <Icon name="sync" className="text-2xl text-on-surface-variant animate-spin" />
          </div>
        ) : !user ? (
          <div className="text-center py-16 bg-surface rounded-xl border max-w-lg mx-auto">
            <h2 className="text-xl font-bold text-on-surface mb-2">Welcome to Core Agents</h2>
            <p className="text-sm text-on-surface-variant mb-6">Build and manage your LLM agent workflows with a visual drag-and-drop editor.</p>
          </div>
        ) : activeTab === 'flows' ? (
          /* ── Flows tab ── */
          loading ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <TextField label="Search" value={search} onChange={(v) => { setSearch(v); setPage(0); }} className="flex-1" />
                <SelectField
                  label="Sort"
                  value={sort}
                  onChange={(v) => { setSort(v as 'updated_at' | 'created_at'); setPage(0); }}
                  options={[
                    { value: 'updated_at', label: 'Last updated' },
                    { value: 'created_at', label: 'Created' },
                  ]}
                />
                {groups.length > 0 && (
                  <SelectField
                    label="Group"
                    value={groupFilter}
                    onChange={(v) => { setGroupFilter(v); setPage(0); }}
                    options={[
                      { value: '', label: 'All groups' },
                      ...groups.map(g => ({ value: g.id, label: g.name })),
                    ]}
                    className="w-40"
                  />
                )}
                {can('flow:create') && (
                  <button onClick={handleCreate} className="m3-button gap-2 shrink-0">
                    <Icon name="add" className="text-base" /> New Flow
                  </button>
                )}
              </div>
              {flows.length === 0 ? (
                <div className="text-center py-16 bg-surface rounded-xl border">
                  <p className="text-on-surface-variant mb-2">{search ? 'No flows match your search' : 'No flows yet'}</p>
                  {can('flow:create') && !search && (
                    <button onClick={handleCreate} className="text-primary hover:text-primary text-sm font-medium">Create your first flow</button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {flows.map((flow) => (
                      <div key={flow.id} className="bg-surface rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            {(() => {
                              const triggerNode = flow.nodes?.find((n: any) => n.data?.type === 'trigger');
                              const triggerType = triggerNode?.data?.config?.triggerType || 'manual';
                              return triggerType === 'chat' ? (
                                <Tooltip content="Conversational interface — user sends messages, agent responds">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="chat" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : triggerType === 'webhook' ? (
                                <Tooltip content="Triggered by external POST request — configure in flow editor">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="webhook" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : triggerType === 'schedule' ? (
                                <Tooltip content="Runs automatically on a cron schedule — configure in flow editor">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="calendar_today" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip content="Triggered manually via the Run button or debug overlay">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="play_arrow" className="text-sm" />
                                  </span>
                                </Tooltip>
                              );
                            })()}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/flows/${flow.id}/edit`} className="font-medium text-on-surface hover:text-primary">{flow.name}</Link>
                            {flow.group_name && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary-container text-secondary">{flow.group_name}</span>
                            )}
                            <p className="text-xs text-on-surface-variant mt-0.5">{flow.description || 'No description'}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-on-surface-variant">
                              <span>Created: {new Date(flow.created_at).toLocaleString('nl-NL')}{flow.created_by_name ? ` by ${flow.created_by_name}` : ''}</span>
                              <span>·</span>
                              <span>Updated: {new Date(flow.updated_at).toLocaleString('nl-NL')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(() => {
                            const triggerNode = flow.nodes?.find((n: any) => n.data?.type === 'trigger');
                            const triggerType = triggerNode?.data?.config?.triggerType || 'manual';
                            const isChat = triggerType === 'chat';
                            const isWebhook = triggerType === 'webhook';
                            return (
                              <>
                                {isChat ? (
                                  <Tooltip content="Chat with this agent">
                                    <Link href={`/chat/${flow.id}`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-success hover:bg-secondary-container rounded transition-colors">
                                      <Icon name="chat" className="text-sm" /> Open Chat
                                    </Link>
                                  </Tooltip>
                                ) : !isWebhook && (
                                  running[flow.id] === 'running' ? (
                                    <Tooltip content="Running...">
                                      <span className="flex items-center gap-1 px-2 py-1 text-xs text-primary bg-primary-container rounded"><Icon name="sync" className="text-sm animate-spin" /> Running</span>
                                    </Tooltip>
                                  ) : running[flow.id] === 'ok' ? (
                                    <Tooltip content="Completed">
                                      <span className="flex items-center gap-1 px-2 py-1 text-xs text-success bg-success-container rounded"><Icon name="check_circle" className="text-sm" /> Completed</span>
                                    </Tooltip>
                                  ) : running[flow.id] === 'error' ? (
                                    <Tooltip content="Failed">
                                      <span className="flex items-center gap-1 px-2 py-1 text-xs text-error bg-error-container rounded"><Icon name="cancel" className="text-sm" /> Failed</span>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip content="Run flow">
                                      <button onClick={() => handleRun(flow.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-success hover:bg-secondary-container rounded transition-colors cursor-pointer">
                                        <Icon name="play_arrow" className="text-sm" /> Run
                                      </button>
                                    </Tooltip>
                                  )
                                )}
                                {can('execution:approve') && !isChat && !isWebhook && (
                                  <Tooltip content="Executions">
                                    <Link href={`/flows/${flow.id}/executions`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-success hover:bg-secondary-container rounded transition-colors">
                                      <Icon name="history" className="text-sm" /> Run history
                                    </Link>
                                  </Tooltip>
                                )}
                              </>
                            );
                          })()}
                          {can('flow:edit') && (
                            <Tooltip content="Edit flow">
                              <Link href={`/flows/${flow.id}/edit`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                                <Icon name="edit" className="text-sm" /> Edit
                              </Link>
                            </Tooltip>
                          )}
                          {can('flow:delete') && (
                            <Tooltip content="Delete flow">
                              <button onClick={() => handleDelete(flow.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer">
                                <Icon name="delete" className="text-sm" /> Delete
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-on-surface-variant">{total} flow{total !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2">
                      <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
                      <span className="text-on-surface-variant text-xs">Page {page + 1} of {Math.ceil(total / PAGE_SIZE) || 1}</span>
                      <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        ) : activeTab === 'subflows' ? (
          /* ── Subflows tab (same as flows, just with subflow labels) ── */
          loading ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <TextField label="Search" value={search} onChange={(v) => { setSearch(v); setPage(0); }} className="flex-1" />
                <SelectField
                  label="Sort"
                  value={sort}
                  onChange={(v) => { setSort(v as 'updated_at' | 'created_at'); setPage(0); }}
                  options={[
                    { value: 'updated_at', label: 'Last updated' },
                    { value: 'created_at', label: 'Created' },
                  ]}
                />
                {groups.length > 0 && (
                  <SelectField
                    label="Group"
                    value={groupFilter}
                    onChange={(v) => { setGroupFilter(v); setPage(0); }}
                    options={[
                      { value: '', label: 'All groups' },
                      ...groups.map(g => ({ value: g.id, label: g.name })),
                    ]}
                    className="w-40"
                  />
                )}
                {can('flow:create') && (
                  <button onClick={handleCreate} className="m3-button gap-2 shrink-0">
                    <Icon name="add" className="text-base" /> New Subflow
                  </button>
                )}
              </div>
              {flows.length === 0 ? (
                <div className="text-center py-16 bg-surface rounded-xl border">
                  <p className="text-on-surface-variant mb-2">{search ? 'No subflows match your search' : 'No subflows yet'}</p>
                  {can('flow:create') && !search && (
                    <button onClick={handleCreate} className="text-primary hover:text-primary text-sm font-medium">Create your first subflow</button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {flows.map((flow) => (
                      <div key={flow.id} className="bg-surface rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            {(() => {
                              const triggerNode = flow.nodes?.find((n: any) => n.data?.type === 'trigger');
                              const triggerType = triggerNode?.data?.config?.triggerType || 'manual';
                              return triggerType === 'chat' ? (
                                <Tooltip content="Conversational interface — user sends messages, agent responds">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="chat" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : triggerType === 'webhook' ? (
                                <Tooltip content="Triggered by external POST request — configure in flow editor">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="webhook" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : triggerType === 'schedule' ? (
                                <Tooltip content="Runs automatically on a cron schedule — configure in flow editor">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="calendar_today" className="text-sm" />
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip content="Triggered manually via the Run button or debug overlay">
                                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant bg-surface-container-high rounded">
                                    <Icon name="play_arrow" className="text-sm" />
                                  </span>
                                </Tooltip>
                              );
                            })()}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/flows/${flow.id}/edit`} className="font-medium text-on-surface hover:text-primary">{flow.name}</Link>
                            {flow.group_name && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary-container text-secondary">{flow.group_name}</span>
                            )}
                            <p className="text-xs text-on-surface-variant mt-0.5">{flow.description || 'No description'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {can('flow:edit') && (
                            <Tooltip content="Edit subflow">
                              <Link href={`/flows/${flow.id}/edit`} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                                <Icon name="edit" className="text-sm" /> Edit
                              </Link>
                            </Tooltip>
                          )}
                          {can('flow:delete') && (
                            <Tooltip content="Delete subflow">
                              <button onClick={() => handleDelete(flow.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer">
                                <Icon name="delete" className="text-sm" /> Delete
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-on-surface-variant">{total} subflow{total !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2">
                      <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
                      <span className="text-on-surface-variant text-xs">Page {page + 1} of {Math.ceil(total / PAGE_SIZE) || 1}</span>
                      <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="m3-button-outlined text-sm disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        ) : (
          /* ── Agent Contexts tab ── */
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-on-surface-variant">Reusable context prompts that can be attached to LLM Agent nodes in any flow.</p>
              {can('flow:create') && (
                <button onClick={() => { resetContextForm(); setShowContextForm(true); }} className="m3-button gap-2 shrink-0">
                  <Icon name="add" className="text-base" /> New Context
                </button>
              )}
            </div>

            {showContextForm && (
              <div className="bg-surface rounded-lg border p-4 mb-4 space-y-3">
                <TextField label="Title" value={contextTitle} onChange={setContextTitle} />
                <TextField label="Description" value={contextDescription} onChange={setContextDescription} />
                {groups.length > 0 && (
                  <SelectField
                    label="Group"
                    value={contextGroupId}
                    onChange={setContextGroupId}
                    options={[
                      ...(can('admin') ? [{ value: '', label: 'No group' }] : []),
                      ...groups.map(g => ({ value: g.id, label: g.name })),
                    ]}
                  />
                )}
                <div>
                  <label className="text-xs font-medium text-on-surface-variant block mb-1">Content</label>
                  <textarea
                    value={contextContent}
                    onChange={e => setContextContent(e.target.value)}
                    placeholder="You are an AI assistant working for Acme Corp. Our brand voice is professional yet approachable..."
                    rows={6}
                    className="w-full text-sm border border-outline rounded-lg px-3 py-2 font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleSaveContext} disabled={!contextTitle.trim()} className="m3-button disabled:opacity-50">
                    <Icon name="save" className="text-sm" /> {editingContext ? 'Update' : 'Create'}
                  </button>
                  <button onClick={resetContextForm} className="m3-button-outlined text-sm">Cancel</button>
                </div>
              </div>
            )}

            {contextsLoading ? (
              <p className="text-on-surface-variant text-sm">Loading...</p>
            ) : contexts.length === 0 ? (
              <div className="text-center py-16 bg-surface rounded-xl border">
                <p className="text-on-surface-variant mb-2">No agent contexts yet</p>
                {can('flow:create') && (
                  <button onClick={() => { resetContextForm(); setShowContextForm(true); }} className="text-primary hover:text-primary text-sm font-medium">Create your first context</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {contexts.map(ctx => (
                  <div key={ctx.id} className="bg-surface rounded-lg border p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-on-surface">{ctx.title}</h3>
                        {ctx.group_name && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary-container text-secondary">{ctx.group_name}</span>
                        )}
                        {ctx.description && <p className="text-xs text-on-surface-variant mt-0.5">{ctx.description}</p>}
                        {ctx.content && (
                          <pre className="mt-2 text-xs font-mono text-on-surface-variant bg-surface-container-high rounded p-2 overflow-hidden max-h-20 whitespace-pre-wrap">{ctx.content}</pre>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        {can('flow:edit') && (
                          <Tooltip content="Edit context">
                            <button onClick={() => handleEditContext(ctx)} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-primary hover:bg-secondary-container rounded transition-colors">
                              <Icon name="edit" className="text-sm" />
                            </button>
                          </Tooltip>
                        )}
                        {can('flow:delete') && (
                          <Tooltip content="Delete context">
                            <button onClick={() => handleDeleteContext(ctx.id)} className="flex items-center gap-1 p-1.5 text-xs text-on-surface-variant hover:text-error hover:bg-error-container rounded transition-colors">
                              <Icon name="delete" className="text-sm" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {deleteConfirm.dialog}
      {contextDeleteConfirm.dialog}
    </div>
  );
}

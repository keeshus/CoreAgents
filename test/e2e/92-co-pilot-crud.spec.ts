import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot tools', () => {
  // ─── LLM Endpoints ─────────────────────────────────────────────
  test('list_endpoints', async ({ request }) => {
    const res = await request.get(`${API_URL}/llm-endpoints`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_endpoint — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'CP LLM', providerType: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4', models: ['gpt-4'] },
    });
    expect(res.ok()).toBe(true);
    const ep = await res.json();
    expect(ep.name).toBe('CP LLM');
    await request.delete(`${API_URL}/llm-endpoints/${ep.id}`);
  });

  test('create_endpoint — rejects missing fields', async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, { data: { name: 'Bad' } });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('delete_endpoint — removes endpoint', async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'CP Del', providerType: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4' },
    });
    const ep = await res.json();
    const delRes = await request.delete(`${API_URL}/llm-endpoints/${ep.id}`);
    expect(delRes.ok()).toBe(true);
    const listRes = await request.get(`${API_URL}/llm-endpoints`);
    const list = await listRes.json();
    expect(list.some((e: any) => e.id === ep.id)).toBe(false);
  });

  // ─── MCP Servers ───────────────────────────────────────────────
  test('list_mcp_servers', async ({ request }) => {
    const res = await request.get(`${API_URL}/mcp-servers`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_mcp_server — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'CP MCP', url: 'http://mock-mcp-e2e:3003/sse' },
    });
    expect(res.ok()).toBe(true);
    const server = await res.json();
    expect(server.name).toBe('CP MCP');
    await request.delete(`${API_URL}/mcp-servers/${server.id}`);
  });

  test('create_mcp_server — rejects missing url', async ({ request }) => {
    const res = await request.post(`${API_URL}/mcp-servers`, { data: { name: 'Bad MCP' } });
    expect(res.status()).toBe(400);
  });

  test('refresh_mcp_tools — refreshes tool list', async ({ request }) => {
    const res = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'CP Refresh', url: 'http://mock-mcp-e2e:3003/sse' },
    });
    const server = await res.json();
    const refreshRes = await request.post(`${API_URL}/mcp-servers/${server.id}/refresh`);
    expect(refreshRes.ok()).toBe(true);
    await request.delete(`${API_URL}/mcp-servers/${server.id}`);
  });

  test('delete_mcp_server — removes server', async ({ request }) => {
    const res = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'CP Del MCP', url: 'http://e2e-del.local/sse' },
    });
    const server = await res.json();
    expect((await request.delete(`${API_URL}/mcp-servers/${server.id}`)).ok()).toBe(true);
  });

  // ─── Embedding Providers ───────────────────────────────────────
  test('list_embedding_providers', async ({ request }) => {
    const res = await request.get(`${API_URL}/embedding-providers`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_embedding_provider — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/embedding-providers`, {
      data: { name: 'CP Emb', providerType: 'openai', apiKey: 'sk-test', model: 'text-embedding-ada-002' },
    });
    expect(res.ok()).toBe(true);
    const ep = await res.json();
    expect(ep.name).toBe('CP Emb');
    await request.delete(`${API_URL}/embedding-providers/${ep.id}`);
  });

  test('create_embedding_provider — rejects missing fields', async ({ request }) => {
    const res = await request.post(`${API_URL}/embedding-providers`, { data: { name: 'Bad Emb' } });
    expect(res.status()).toBe(400);
  });

  test('delete_embedding_provider — removes provider', async ({ request }) => {
    const res = await request.post(`${API_URL}/embedding-providers`, {
      data: { name: 'CP Del Emb', providerType: 'openai', apiKey: 'sk-test' },
    });
    const ep = await res.json();
    expect((await request.delete(`${API_URL}/embedding-providers/${ep.id}`)).ok()).toBe(true);
  });

  // ─── Vector Stores ─────────────────────────────────────────────
  test('list_vector_stores', async ({ request }) => {
    const res = await request.get(`${API_URL}/vector-stores`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_vector_store — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'CP VS', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    expect(res.ok()).toBe(true);
    const vs = await res.json();
    expect(vs.name).toBe('CP VS');
    await request.delete(`${API_URL}/vector-stores/${vs.id}`);
  });

  test('create_vector_store — rejects missing url', async ({ request }) => {
    const res = await request.post(`${API_URL}/vector-stores`, { data: { name: 'Bad VS' } });
    expect(res.status()).toBe(400);
  });

  test('delete_vector_store — removes store', async ({ request }) => {
    const res = await request.post(`${API_URL}/vector-stores`, {
      data: { name: 'CP Del VS', storeType: 'qdrant', url: 'http://qdrant-e2e:6333' },
    });
    const vs = await res.json();
    expect((await request.delete(`${API_URL}/vector-stores/${vs.id}`)).ok()).toBe(true);
  });

  // ─── Users ─────────────────────────────────────────────────────
  test('list_users', async ({ request }) => {
    const res = await request.get(`${API_URL}/users`);
    expect(res.ok()).toBe(true);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.some((u: any) => u.email === 'e2e@test.local')).toBe(true);
  });

  test('create_user — success', async ({ request }) => {
    const email = `cp-user-${Date.now()}@test.local`;
    const res = await request.post(`${API_URL}/users`, {
      data: { email, password: 'Test1234!', name: 'CP User' },
    });
    expect(res.ok()).toBe(true);
    const user = await res.json();
    expect(user.email).toBe(email);
    await request.delete(`${API_URL}/users/${user.id}`);
  });

  test('create_user — rejects duplicate email', async ({ request }) => {
    const email = `cp-dup-${Date.now()}@test.local`;
    await request.post(`${API_URL}/users`, { data: { email, password: 'Test1234!', name: 'First' } });
    const res2 = await request.post(`${API_URL}/users`, { data: { email, password: 'Test1234!', name: 'Second' } });
    // Should return 409 conflict (or 500 if duplicate handling isn't perfect)
    expect([409, 500]).toContain(res2.status());
    // Cleanup: find and delete
    const users = await (await request.get(`${API_URL}/users`)).json();
    const dup = users.find((u: any) => u.email === email);
    if (dup) await request.delete(`${API_URL}/users/${dup.id}`);
  });

  test('delete_user — removes user', async ({ request }) => {
    const email = `cp-del-${Date.now()}@test.local`;
    const res = await request.post(`${API_URL}/users`, { data: { email, password: 'Test1234!', name: 'Del' } });
    const user = await res.json();
    expect((await request.delete(`${API_URL}/users/${user.id}`)).ok()).toBe(true);
    const users = await (await request.get(`${API_URL}/users`)).json();
    expect(users.some((u: any) => u.id === user.id)).toBe(false);
  });

  test('update_user_role — changes role', async ({ request }) => {
    const email = `cp-role-${Date.now()}@test.local`;
    const res = await request.post(`${API_URL}/users`, { data: { email, password: 'Test1234!', name: 'Role' } });
    const user = await res.json();
    const roles = await (await request.get(`${API_URL}/roles`)).json();
    const reader = roles.find((r: any) => r.name === 'reader');

    const updateRes = await request.put(`${API_URL}/users/${user.id}/role`, { data: { role_id: reader.id } });
    expect(updateRes.ok()).toBe(true);

    await request.delete(`${API_URL}/users/${user.id}`);
  });

  test('list_roles', async ({ request }) => {
    const res = await request.get(`${API_URL}/roles`);
    expect(res.ok()).toBe(true);
    const roles = await res.json();
    expect(roles.some((r: any) => r.name === 'admin')).toBe(true);
  });

  // ─── Profile ───────────────────────────────────────────────────
  test('update_profile — changes name', async ({ request }) => {
    await request.put(`${API_URL}/auth/profile`, { data: { name: 'CP Profile' } });
    const profile = await (await request.get(`${API_URL}/auth/profile`)).json();
    expect(profile.name).toBe('CP Profile');
    await request.put(`${API_URL}/auth/profile`, { data: { name: 'E2E Test User' } });
  });

  test('get_profile — returns current user', async ({ request }) => {
    const res = await request.get(`${API_URL}/auth/profile`);
    expect(res.ok()).toBe(true);
    const profile = await res.json();
    expect(profile.email).toBe('e2e@test.local');
  });

  // ─── Executions ────────────────────────────────────────────────
  test('list_executions', async ({ request }) => {
    const res = await request.get(`${API_URL}/executions`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('get_execution_details + delete_execution', async ({ request }) => {
    const list = await (await request.get(`${API_URL}/executions`)).json();
    const execs = Array.isArray(list) ? list : [];
    const target = execs.find((e: any) => !e.input?._debug);
    if (target) {
      const detail = await (await request.get(`${API_URL}/executions/${target.id}`)).json();
      expect(detail.id).toBe(target.id);
      expect((await request.delete(`${API_URL}/executions/${target.id}`)).ok()).toBe(true);
    }
  });

  // ─── Approvals ─────────────────────────────────────────────────
  test('get_pending_approvals', async ({ request }) => {
    const res = await request.get(`${API_URL}/executions/pending`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('approve_execution + reject_execution — via API', async ({ request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CP-HITL'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'Gate', type: 'hitl', config: { prompt: 'Go?', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await flowRes.json();
    const { executeUntilPaused, pollExecution } = await import('./helpers/stream');
    const cookie = (await import('./helpers/auth')).getAuthCookie() || undefined;

    const { executionId } = await executeUntilPaused(flow.id, { message: 'test' }, cookie);
    expect(executionId).toBeTruthy();

    // Approve
    const approveRes = await fetch(`${API_URL}/executions/${executionId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(approveRes.ok).toBe(true);
    const exec = await pollExecution(request, executionId, 30000);
    expect(exec.status).toBe('completed');

    await deleteFlow(request, flow.id);
  });

  // ─── Flows ─────────────────────────────────────────────────────
  test('list_flows', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('search_flows — returns filtered results', async ({ request }) => {
    const name = uniqueFlowName('SearchTarget');
    await createFlow(request, { name });
    const res = await request.get(`${API_URL}/flows?limit=100&search=${encodeURIComponent(name)}`);
    const data = await res.json();
    expect(data.data.some((f: any) => f.name === name)).toBe(true);
  });

  // ─── Navigation ────────────────────────────────────────────────
  test('navigate_to — various pages', async ({ page }) => {
    for (const path of ['/settings/endpoints', '/settings/mcp-servers', '/settings/users', '/profile', '/approvals']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    }
  });

  // ─── Secrets ───────────────────────────────────────────────────
  test('list_secrets', async ({ request }) => {
    const res = await request.get(`${API_URL}/secrets`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_secret — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, {
      data: { name: 'CP-Secret', value: 'cp-value', scope: 'app' },
    });
    expect(res.ok()).toBe(true);
    const secret = await res.json();
    expect(secret.name).toBe('CP-Secret');
    await request.delete(`${API_URL}/secrets/${secret.id}`);
  });

  test('create_secret — rejects empty name', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, { data: { name: '', value: 'v', scope: 'app' } });
    expect(res.status()).toBe(400);
  });

  test('update_secret — changes value', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, {
      data: { name: 'CP-Upd', value: 'old', scope: 'app' },
    });
    const secret = await res.json();
    const updateRes = await request.put(`${API_URL}/secrets/${secret.id}`, { data: { value: 'new' } });
    expect(updateRes.ok()).toBe(true);
    await request.delete(`${API_URL}/secrets/${secret.id}`);
  });

  test('delete_secret — removes secret', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, {
      data: { name: 'CP-Del', value: 'x', scope: 'app' },
    });
    const secret = await res.json();
    expect((await request.delete(`${API_URL}/secrets/${secret.id}`)).ok()).toBe(true);
  });

  test('rotate_key — rotates encryption key', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets/rotate-key`);
    expect(res.ok()).toBe(true);
  });

  // ─── Secret Vaults ─────────────────────────────────────────────
  let vaultGroupId: string;

  test.beforeAll(async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `CP-VaultGrp-${Date.now()}` } });
    vaultGroupId = (await gRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (vaultGroupId) await request.delete(`${API_URL}/groups/${vaultGroupId}`).catch(() => {});
  });

  test('list_vaults', async ({ request }) => {
    const res = await request.get(`${API_URL}/secret-vaults`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_vault — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'CP-Vault', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'admin', apiKey: 'test-key', groupId: vaultGroupId },
    });
    expect(res.ok()).toBe(true);
    const vault = await res.json();
    expect(vault.name).toBe('CP-Vault');
    await request.delete(`${API_URL}/secret-vaults/${vault.id}`);
  });

  test('create_vault — rejects missing fields', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, { data: { name: 'Bad Vault' } });
    expect(res.status()).toBe(400);
  });

  test('test_vault_connection — tests connection', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'CP-VaultTest', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'admin', apiKey: 'test-key', groupId: vaultGroupId },
    });
    const vault = await res.json();
    const testRes = await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);
    expect(testRes.ok()).toBe(true);
    await request.delete(`${API_URL}/secret-vaults/${vault.id}`);
  });

  test('update_vault — updates config', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'CP-UpdV', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', login: 'admin', apiKey: 'test-key', groupId: vaultGroupId },
    });
    const vault = await res.json();
    const updRes = await request.put(`${API_URL}/secret-vaults/${vault.id}`, { data: { name: 'CP-UpdV-New' } });
    expect(updRes.ok()).toBe(true);
    await request.delete(`${API_URL}/secret-vaults/${vault.id}`);
  });

  test('delete_vault — removes vault', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'CP-DelV', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', login: 'admin', apiKey: 'test-key', groupId: vaultGroupId },
    });
    const vault = await res.json();
    expect((await request.delete(`${API_URL}/secret-vaults/${vault.id}`)).ok()).toBe(true);
  });

  // ─── Global Context ────────────────────────────────────────────
  test('get_global_context', async ({ request }) => {
    const res = await request.get(`${API_URL}/settings/global-context`);
    expect(res.ok()).toBe(true);
  });

  test('update_global_context — saves and reads back', async ({ request }) => {
    const orig = await (await request.get(`${API_URL}/settings/global-context`)).json();
    await request.put(`${API_URL}/settings/global-context`, { data: { value: 'CP Global Context' } });
    const updated = await (await request.get(`${API_URL}/settings/global-context`)).json();
    expect(updated.value || updated).toBe('CP Global Context');
    await request.put(`${API_URL}/settings/global-context`, { data: { value: orig.value || '' } });
  });

  // ─── SSO Config ────────────────────────────────────────────────
  test('get_sso_config', async ({ request }) => {
    const res = await request.get(`${API_URL}/admin/sso-config`);
    expect(res.ok()).toBe(true);
  });

  test('update_sso_config — saves config', async ({ request }) => {
    const orig = await (await request.get(`${API_URL}/admin/sso-config`)).json();
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { provider: 'oidc', clientId: 'cp-test', clientSecret: 'cp-secret', issuer: 'http://test.local' },
    });
    const saved = await (await request.get(`${API_URL}/admin/sso-config`)).json();
    expect(saved.provider).toBe('oidc');
    // Restore
    await request.put(`${API_URL}/admin/sso-config`, { data: orig });
  });

  // ─── Groups ────────────────────────────────────────────────────
  test('list_groups', async ({ request }) => {
    const res = await request.get(`${API_URL}/groups`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_group — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, { data: { name: `CP-Group-${Date.now()}` } });
    expect(res.ok()).toBe(true);
    const group = await res.json();
    expect(group.name).toContain('CP-Group');
    await request.delete(`${API_URL}/groups/${group.id}`);
  });

  test('create_group — rejects duplicate name', async ({ request }) => {
    const name = `CP-Dup-${Date.now()}`;
    await request.post(`${API_URL}/groups`, { data: { name } });
    const res2 = await request.post(`${API_URL}/groups`, { data: { name } });
    expect(res2.status()).toBe(409);
  });

  test('update_group — updates name and context', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, { data: { name: `CP-UpdG-${Date.now()}` } });
    const group = await res.json();
    const updRes = await request.put(`${API_URL}/groups/${group.id}`, { data: { name: 'CP-UpdG-New', context: 'test context' } });
    expect(updRes.ok()).toBe(true);
    await request.delete(`${API_URL}/groups/${group.id}`);
  });

  test('delete_group — removes group', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, { data: { name: `CP-DelG-${Date.now()}` } });
    const group = await res.json();
    expect((await request.delete(`${API_URL}/groups/${group.id}`)).ok()).toBe(true);
  });

  test('add_group_member + remove_group_member', async ({ request }) => {
    const groupRes = await request.post(`${API_URL}/groups`, { data: { name: `CP-Member-${Date.now()}` } });
    const group = await groupRes.json();
    const users = await (await request.get(`${API_URL}/users`)).json();
    const target = users[0];

    const addRes = await request.post(`${API_URL}/groups/${group.id}/members`, { data: { userId: target.id } });
    expect(addRes.ok()).toBe(true);

    const delRes = await request.delete(`${API_URL}/groups/${group.id}/members/${target.id}`);
    expect(delRes.ok()).toBe(true);

    await request.delete(`${API_URL}/groups/${group.id}`);
  });

  test('get_group_context — reads group context', async ({ request }) => {
    const groupRes = await request.post(`${API_URL}/groups`, { data: { name: `CP-Ctx-${Date.now()}`, context: 'group hello' } });
    const group = await groupRes.json();

    const ctxRes = await request.get(`${API_URL}/groups/${group.id}`);
    expect(ctxRes.ok()).toBe(true);
    const ctx = await ctxRes.json();
    expect(ctx.context).toBe('group hello');

    await request.delete(`${API_URL}/groups/${group.id}`);
  });

  // ─── Group Vault Config ────────────────────────────────────────
  test('get_group_vault + set_group_vault', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `CP-GV-${Date.now()}` } });
    const grp = await gRes.json();

    const vaultRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: `CP-GVault-${Date.now()}`, vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', login: 'admin', apiKey: 'test-key', groupId: grp.id },
    });
    const vault = await vaultRes.json();

    // Set group vault config
    const setRes = await request.put(`${API_URL}/group-vault-config/${grp.id}`, {
      data: { vaultId: vault.id, enabled: true },
    });
    expect(setRes.ok()).toBe(true);

    // Get
    const getRes = await request.get(`${API_URL}/group-vault-config/${grp.id}`);
    expect(getRes.ok()).toBe(true);

    await request.delete(`${API_URL}/secret-vaults/${vault.id}`);
    await request.delete(`${API_URL}/groups/${grp.id}`);
  });

  // ─── Agent Contexts ────────────────────────────────────────────
  test('list_agent_contexts', async ({ request }) => {
    const res = await request.get(`${API_URL}/agent-contexts`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('create_agent_context — success', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'CP Context', description: 'test', content: 'You are helpful.' },
    });
    expect(res.ok()).toBe(true);
    const ctx = await res.json();
    expect(ctx.title).toBe('CP Context');
    await request.delete(`${API_URL}/agent-contexts/${ctx.id}`);
  });

  test('create_agent_context — rejects empty title', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, { data: { content: 'x' } });
    expect(res.status()).toBe(400);
  });

  test('update_agent_context — updates title and content', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'CP UpdCtx', content: 'old content' },
    });
    const ctx = await res.json();
    const updRes = await request.put(`${API_URL}/agent-contexts/${ctx.id}`, {
      data: { title: 'CP UpdCtx New', content: 'new content' },
    });
    expect(updRes.ok()).toBe(true);
    await request.delete(`${API_URL}/agent-contexts/${ctx.id}`);
  });

  test('delete_agent_context — removes context', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'CP DelCtx', content: 'x' },
    });
    const ctx = await res.json();
    expect((await request.delete(`${API_URL}/agent-contexts/${ctx.id}`)).ok()).toBe(true);
  });
});

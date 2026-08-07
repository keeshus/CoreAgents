import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Settings pages', () => {
  const cleanupGroupIds: string[] = [];
  const cleanupEndpointIds: string[] = [];
  const cleanupMcpIds: string[] = [];
  const cleanupEmbeddingIds: string[] = [];
  const cleanupVectorStoreIds: string[] = [];
  const cleanupUserIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of cleanupUserIds) {
      await request.delete(`${API_URL}/users/${id}`).catch(() => {});
    }
    cleanupUserIds.length = 0;
    for (const id of cleanupGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    cleanupGroupIds.length = 0;
    for (const id of cleanupEndpointIds) {
      await request.delete(`${API_URL}/llm-endpoints/${id}`).catch(() => {});
    }
    cleanupEndpointIds.length = 0;
    for (const id of cleanupMcpIds) {
      await request.delete(`${API_URL}/mcp-servers/${id}`).catch(() => {});
    }
    cleanupMcpIds.length = 0;
    for (const id of cleanupEmbeddingIds) {
      await request.delete(`${API_URL}/embedding-providers/${id}`).catch(() => {});
    }
    cleanupEmbeddingIds.length = 0;
    for (const id of cleanupVectorStoreIds) {
      await request.delete(`${API_URL}/vector-stores/${id}`).catch(() => {});
    }
    cleanupVectorStoreIds.length = 0;
  });

  test('settings page loads with navigation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('LLM endpoints page loads', async ({ page }) => {
    await page.goto('/settings/endpoints');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('MCP servers page loads', async ({ page }) => {
    await page.goto('/settings/mcp-servers');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('users page loads', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  // ─── Users page search ─────────────────────────────────────────

  const createUser = async (request: any, body: Record<string, unknown>) => {
    const res = await request.post(`${API_URL}/users`, { data: body });
    expect(res.status()).toBe(201);
    const user = await res.json();
    cleanupUserIds.push(user.id);
    return user;
  };

  test('users page: search filters users by name and email', async ({ page, request }) => {
    const alpha = await createUser(request, { name: `Alpha Search User`, email: `alpha-search-${Date.now()}@test.local`, password: 'Test1234!' });
    const beta = await createUser(request, { name: `Beta Search User`, email: `beta-search-${Date.now()}@test.local`, password: 'Test1234!' });

    await page.goto('/settings/users');
    await expect(page.getByText(alpha.name)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(beta.name)).toBeVisible();

    const searchInput = page.getByLabel('Search users');
    await searchInput.fill('Alpha Search');
    await expect(page.getByText(alpha.name)).toBeVisible();
    await expect(page.getByText(beta.name)).not.toBeVisible();

    // Search by email (substring)
    await searchInput.fill(beta.email.split('@')[0]);
    await expect(page.getByText(beta.name)).toBeVisible();
    await expect(page.getByText(alpha.name)).not.toBeVisible();
  });

  test('users page: search matches role, provider and group names', async ({ page, request }) => {
    const roles = await (await request.get(`${API_URL}/roles`)).json();
    const editorRole = (roles as any[]).find((r: any) => r.name === 'editor');
    const ts = Date.now();

    const group = (await (await request.post(`${API_URL}/groups`, { data: { name: `Users-Search-Group-${ts}` } })).json());
    cleanupGroupIds.push(group.id);

    const editor = await createUser(request, { name: `RoleEditor User ${ts}`, email: `role-editor-${ts}@test.local`, password: 'Test1234!', role_id: editorRole.id });
    const member = await createUser(request, { name: `GroupMember User ${ts}`, email: `group-member-${ts}@test.local`, password: 'Test1234!' });
    await request.post(`${API_URL}/groups/${group.id}/members`, { data: { userId: member.id } });

    await page.goto('/settings/users');
    await expect(page.getByText(editor.name)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(member.name)).toBeVisible();

    // Search by role name
    await page.getByLabel('Search users').fill('editor');
    await expect(page.getByText(editor.name)).toBeVisible();
    await expect(page.getByText(member.name)).not.toBeVisible();
    // Search by group name
    await page.getByLabel('Search users').fill(group.name);
    await expect(page.getByText(member.name)).toBeVisible();
    await expect(page.getByText(editor.name)).not.toBeVisible();

    // Search by provider ("local" matches every local account)
    await page.getByLabel('Search users').fill('local');
    await expect(page.getByText(editor.name)).toBeVisible();
    await expect(page.getByText(member.name)).toBeVisible();
  });

  test('users page: search with no matches shows empty state', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.getByLabel('Search users')).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Search users').fill('zzz-no-such-user');
    await expect(page.getByText('No users match your search')).toBeVisible({ timeout: 5000 });
  });

  test('knowledge page loads', async ({ page }) => {
    await page.goto('/settings/knowledge');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Settings hub navigation ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('settings hub tiles link to the right pages', async ({ page }) => {
    // Admin sees all tiles (admin user from the auth state)
    const expectedTiles: Array<[string, string]> = [
      ['Secrets', '/settings/secrets'],
      ['Environment Variables', '/settings/env-vars'],
      ['LLM Endpoints', '/settings/endpoints'],
      ['MCP Servers', '/settings/mcp-servers'],
      ['Knowledge Bases', '/settings/knowledge'],
      ['Secret Vaults', '/settings/secret-vaults'],
      ['Users', '/settings/users'],
      ['Groups', '/settings/groups'],
      ['Global Context', '/settings/global-context'],
      ['Pending Approvals', '/settings/executions'],
      ['SSO / OIDC', '/settings/sso'],
    ];

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });

    for (const [title, href] of expectedTiles) {
      const link = page.getByRole('link', { name: title });
      await expect(link).toBeVisible({ timeout: 5000 });
      await expect(link).toHaveAttribute('href', href);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── LLM Endpoints CRUD via UI ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('endpoints page: create, edit and delete an endpoint via UI', async ({ page, request }) => {
    const name = `E2E Endpoint ${Date.now()}`;
    const editedName = `${name} Edited`;

    await page.goto('/settings/endpoints');
    await expect(page.locator('[data-testid="endpoints-heading"]')).toBeVisible({ timeout: 10000 });

    // ── Create ──
    await page.locator('[data-testid="add-endpoint-btn"]').click();
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('API Key').fill('e2e-key');
    await page.getByLabel('Base URL').fill('http://mock-llm-e2e:3002/v1');
    // Add a model — typing it auto-marks it as the default (required by the backend)
    await page.getByRole('button', { name: '+ Add model' }).click();
    await page.getByLabel('Model', { exact: true }).fill('mock-gpt-4');
    await expect(page.getByText('Default', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create Endpoint' }).click();

    // Row appears in the list with the model shown
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('mock-gpt-4')).toBeVisible({ timeout: 5000 });

    // Verified via API
    const listRes = await request.get(`${API_URL}/llm-endpoints`);
    const endpoints = await listRes.json();
    const created = endpoints.find((e: any) => e.name === name);
    expect(created).toBeDefined();
    expect(created.default_model).toBe('mock-gpt-4');
    expect(created.base_url).toBe('http://mock-llm-e2e:3002/v1');
    cleanupEndpointIds.push(created.id);

    // ── Edit ──
    const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Name')).toHaveValue(name, { timeout: 5000 });
    await page.getByLabel('Name').fill(editedName);
    await page.getByRole('button', { name: 'Update Endpoint' }).click();
    await expect(page.getByRole('heading', { name: editedName })).toBeVisible({ timeout: 5000 });

    const edited = await (await request.get(`${API_URL}/llm-endpoints/${created.id}`)).json();
    expect(edited.name).toBe(editedName);
    expect(edited.default_model).toBe('mock-gpt-4');

    // ── Delete ──
    const editedRow = page.locator('div.bg-surface.rounded-lg', { hasText: editedName }).first();
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete endpoint?')).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('heading', { name: editedName })).not.toBeVisible({ timeout: 5000 });

    const afterDelete = await (await request.get(`${API_URL}/llm-endpoints`)).json();
    expect(afterDelete.find((e: any) => e.id === created.id)).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── MCP Servers CRUD via UI ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('mcp servers page: create, refresh tools and delete a server via UI', async ({ page, request }) => {
    const name = `E2E MCP ${Date.now()}`;
    const url = 'http://mock-mcp-e2e:3003/sse';

    await page.goto('/settings/mcp-servers');
    await expect(page.locator('[data-testid="mcp-servers-heading"]')).toBeVisible({ timeout: 10000 });

    // ── Create ──
    await page.locator('[data-testid="add-mcp-server-btn"]').click();
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('URL').fill(url);
    await page.getByRole('button', { name: 'Create Server' }).click();

    // Row appears with name and url
    const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
    await expect(row.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });
    await expect(row.getByText(url, { exact: true })).toBeVisible({ timeout: 5000 });

    // Verified via API
    const listRes = await request.get(`${API_URL}/mcp-servers`);
    const servers = await listRes.json();
    const created = servers.find((s: any) => s.name === name);
    expect(created).toBeDefined();
    expect(created.url).toBe(url);
    expect(created.enabled).toBe(true);
    cleanupMcpIds.push(created.id);

    // ── Refresh tools (mock-mcp advertises the 'echo' tool) ──
    await row.getByRole('button', { name: 'Refresh' }).click();
    await expect
      .poll(async () => {
        const res = await request.get(`${API_URL}/mcp-servers/${created.id}`);
        const srv = await res.json();
        return srv.tools && srv.tools.length > 0;
      }, { timeout: 15000 })
      .toBe(true);

    const refreshed = await (await request.get(`${API_URL}/mcp-servers/${created.id}`)).json();
    expect(refreshed.tools.map((t: any) => t.name)).toContain('echo');

    // UI reflects the tool count
    await expect(row.getByText('1 tool', { exact: true })).toBeVisible({ timeout: 5000 });

    // ── Expand the tools panel to see the tool list ──
    await row.getByRole('button', { name: /1 tools?/ }).click();
    await expect(page.getByText('Available Tools', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('echo', { exact: true })).toBeVisible({ timeout: 5000 });
    // Collapse again
    await row.getByRole('button', { name: /1 tools?/ }).click();
    await expect(page.getByText('Available Tools', { exact: true })).toHaveCount(0, { timeout: 5000 });

    // ── Delete ──
    await row.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete MCP server?')).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(row).not.toBeVisible({ timeout: 5000 });

    const afterDelete = await (await request.get(`${API_URL}/mcp-servers`)).json();
    expect(afterDelete.find((s: any) => s.id === created.id)).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Group filter tests ──────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('endpoints page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `EP-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/endpoints');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('knowledge page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `KN-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/knowledge');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('mcp servers page group filter works', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `MCP-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/mcp-servers');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  // ─── Non-admin group filter scoping ─────────────────────────────

  test('non-admin editors only see their own groups in settings group filters', async ({ page, request }) => {
    // Create two groups — the editor is only a member of the first
    const mineRes = await request.post(`${API_URL}/groups`, { data: { name: `Mine-Group-${Date.now()}` } });
    const otherRes = await request.post(`${API_URL}/groups`, { data: { name: `Other-Group-${Date.now()}` } });
    expect(mineRes.ok()).toBe(true);
    expect(otherRes.ok()).toBe(true);
    const mine = await mineRes.json();
    const other = await otherRes.json();
    cleanupGroupIds.push(mine.id, other.id);

    // Register an editor and add them to `mine` only
    const email = `filter-editor-${Date.now()}@test.local`;
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Filter Editor', email, password: 'Test1234!' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    cleanupUserIds.push(regData.user.id);
    const roles = await (await request.get(`${API_URL}/roles`)).json();
    const editorRole = roles.find((r: any) => r.name === 'editor');
    await request.put(`${API_URL}/users/${regData.user.id}/role`, { data: { role_id: editorRole.id } });
    await request.post(`${API_URL}/groups/${mine.id}/members`, { data: { userId: regData.user.id } });

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const meRes = await page.request.get(`${API_URL}/auth/me`);
      if (!meRes.ok()) return 'ERR';
      return (await meRes.json()).user?.role;
    }, { timeout: 10000 }).toBe('editor');

    // Every settings page with a group filter must list only the editor's group
    for (const path of ['/settings/endpoints', '/settings/knowledge', '/settings/mcp-servers', '/settings/env-vars']) {
      await page.goto(path);
      await expect(page.getByText('Filter by group').first()).toBeVisible({ timeout: 10000 });
      await page.getByText('All items').first().click();
      await expect(page.getByText(mine.name, { exact: true })).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(other.name, { exact: true })).toHaveCount(0);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Endpoints: default lifecycle + model editor ────────────────
  // ═══════════════════════════════════════════════════════════════

  test('endpoints page: set as default via UI and default badge moves', async ({ page, request }) => {
    // Create two endpoints via API (no default set)
    const epA = `E2E-Default-A-${Date.now()}`;
    const epB = `E2E-Default-B-${Date.now()}`;
    const mk = (name: string) => request.post(`${API_URL}/llm-endpoints`, {
      data: { name, providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    const resA = await mk(epA);
    const resB = await mk(epB);
    expect(resA.ok()).toBe(true);
    expect(resB.ok()).toBe(true);
    const epa = await resA.json();
    const epb = await resB.json();
    cleanupEndpointIds.push(epa.id, epb.id);

    await page.goto('/settings/endpoints');
    await expect(page.getByRole('heading', { name: epA })).toBeVisible({ timeout: 10000 });

    // ── Set epA as default via the UI button ──
    const rowA = page.locator('div.bg-surface.rounded-lg', { hasText: epA }).first();
    await rowA.getByRole('button', { name: 'Set as default' }).click();

    // ⭐ Default badge appears on A, and the "Set as default" button disappears
    const badgeA = page.locator('div.bg-surface.rounded-lg', { hasText: epA }).getByText('⭐ Default');
    await expect(badgeA).toBeVisible({ timeout: 5000 });
    await expect(page.locator('div.bg-surface.rounded-lg', { hasText: epA }).getByRole('button', { name: 'Set as default' })).toHaveCount(0);

    const list = await (await request.get(`${API_URL}/llm-endpoints`)).json();
    expect(list.find((e: any) => e.id === epa.id).is_default).toBe(true);
    expect(list.find((e: any) => e.id === epb.id).is_default).toBe(false);

    // ── Deleting the default endpoint is blocked client-side ──
    await page.locator('div.bg-surface.rounded-lg', { hasText: epA }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Cannot delete the default endpoint. Set another endpoint as default first.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: epA })).toBeVisible();

    // ── Non-default endpoint still deletes with the confirm dialog ──
    // (B is now the default, so delete A which is non-default)
    await page.locator('div.bg-surface.rounded-lg', { hasText: epB }).getByRole('button', { name: 'Set as default' }).click();
    await expect(page.locator('div.bg-surface.rounded-lg', { hasText: epB }).getByText('⭐ Default')).toBeVisible({ timeout: 5000 });

    const rowANonDefault = page.locator('div.bg-surface.rounded-lg', { hasText: epA }).first();
    await rowANonDefault.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete endpoint?')).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: epA })).not.toBeVisible({ timeout: 5000 });
  });

  test('endpoints page: model editor removes rows and preserves default on rename', async ({ page, request }) => {
    const name = `E2E-Models-${Date.now()}`;
    await page.goto('/settings/endpoints');
    await expect(page.locator('[data-testid="endpoints-heading"]')).toBeVisible({ timeout: 10000 });

    // ── Create with two models, first marked default ──
    await page.locator('[data-testid="add-endpoint-btn"]').click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('API Key').fill('e2e-key');
    await page.getByLabel('Base URL').fill('http://mock-llm-e2e:3002/v1');
    await page.getByRole('button', { name: '+ Add model' }).click();
    await page.getByLabel('Model', { exact: true }).first().fill('gpt-4o');
    await page.getByRole('button', { name: '+ Add model' }).click();
    await page.getByLabel('Model', { exact: true }).nth(1).fill('gpt-4o-mini');
    await page.getByRole('button', { name: 'Create Endpoint' }).click();

    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });

    const listRes = await request.get(`${API_URL}/llm-endpoints`);
    const created = (await listRes.json()).find((e: any) => e.name === name);
    expect(created).toBeDefined();
    expect(created.default_model).toBe('gpt-4o');
    expect(created.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    cleanupEndpointIds.push(created.id);

    // ── Edit: rename the default model — default must follow ──
    const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Model', { exact: true }).first()).toHaveValue('gpt-4o', { timeout: 5000 });
    await page.getByLabel('Model', { exact: true }).first().fill('gpt-4o-2024');
    await page.getByRole('button', { name: 'Update Endpoint' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });

    const afterRename = await (await request.get(`${API_URL}/llm-endpoints/${created.id}`)).json();
    expect(afterRename.default_model).toBe('gpt-4o-2024');

    // ── Edit: remove a model row ──
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Model', { exact: true }).nth(1)).toHaveValue('gpt-4o-mini', { timeout: 5000 });
    await page.getByRole('button', { name: 'Remove model' }).nth(1).click();
    await expect(page.getByLabel('Model', { exact: true }).nth(1)).toHaveCount(0, { timeout: 5000 });
    await page.getByRole('button', { name: 'Update Endpoint' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });

    const afterRemove = await (await request.get(`${API_URL}/llm-endpoints/${created.id}`)).json();
    expect(afterRemove.models).toEqual(['gpt-4o-2024']);
    expect(afterRemove.default_model).toBe('gpt-4o-2024');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── MCP Servers: edit + enabled toggle ────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('mcp servers page: edit server and toggle enabled via UI', async ({ page, request }) => {
    const name = `E2E-MCP-Edit-${Date.now()}`;
    const editedName = `${name} Edited`;
    const url = 'http://mock-mcp-e2e:3003/sse';

    const res = await request.post(`${API_URL}/mcp-servers`, { data: { name, url, enabled: true } });
    expect(res.ok()).toBe(true);
    const created = await res.json();
    cleanupMcpIds.push(created.id);

    await page.goto('/settings/mcp-servers');
    await expect(page.locator('[data-testid="mcp-servers-heading"]')).toBeVisible({ timeout: 10000 });

    const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
    await expect(row.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });

    // ── Edit name ──
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Name')).toHaveValue(name, { timeout: 5000 });
    await page.getByLabel('Name').fill(editedName);
    await page.getByRole('button', { name: 'Update Server' }).click();
    await expect(page.getByRole('heading', { name: editedName })).toBeVisible({ timeout: 5000 });

    const edited = await (await request.get(`${API_URL}/mcp-servers/${created.id}`)).json();
    expect(edited.name).toBe(editedName);

    // ── Toggle enabled off (via the edit form's Enabled checkbox) ──
    const editedRow = page.locator('div.bg-surface.rounded-lg', { hasText: editedName }).first();
    await editedRow.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Enabled')).toBeChecked({ timeout: 5000 });
    await page.getByLabel('Enabled').uncheck();
    await page.getByRole('button', { name: 'Update Server' }).click();
    await expect(page.getByText('Disabled').first()).toBeVisible({ timeout: 5000 });

    const afterToggle = await (await request.get(`${API_URL}/mcp-servers/${created.id}`)).json();
    expect(afterToggle.enabled).toBe(false);
  });

  test('knowledge page: create, edit and delete an embedding provider via UI', async ({ page, request }) => {
    const name = `E2E Embed ${Date.now()}`;
    const editedName = `${name} Edited`;

    await page.goto('/settings/knowledge');
    await expect(page.locator('[data-testid="knowledge-heading"]')).toBeVisible({ timeout: 10000 });

    // ── Create ──
    await page.locator('[data-testid="add-embedding-btn"]').click();
    await expect(page.getByRole('heading', { name: 'New Embedding Provider' })).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('API Key').fill('e2e-embed-key');
    await page.getByLabel('Base URL').fill('http://mock-llm-e2e:3002/v1');
    await page.getByLabel('Model').fill('text-embedding-ada-002');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.locator('[data-testid="embedding-item"]', { hasText: name })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/openai · text-embedding-ada-002/)).toBeVisible({ timeout: 5000 });

    const listRes = await request.get(`${API_URL}/embedding-providers`);
    const providers = await listRes.json();
    const created = providers.find((p: any) => p.name === name);
    expect(created).toBeDefined();
    expect(created.model).toBe('text-embedding-ada-002');
    cleanupEmbeddingIds.push(created.id);

    // ── Edit ──
    await page.locator('[data-testid="embedding-item"]', { hasText: name }).getByTestId('edit-embedding-btn').click();
    await expect(page.getByRole('heading', { name: 'Edit Embedding Provider' })).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(editedName);
    // API key not required on edit — leave blank to keep current
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('[data-testid="embedding-item"]', { hasText: editedName })).toBeVisible({ timeout: 5000 });

    const edited = await (await request.get(`${API_URL}/embedding-providers/${created.id}`)).json();
    expect(edited.name).toBe(editedName);

    // ── Delete with confirm dialog ──
    await page.locator('[data-testid="embedding-item"]', { hasText: editedName }).getByTestId('delete-embedding-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete embedding provider?' })).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('[data-testid="embedding-item"]', { hasText: editedName })).not.toBeVisible({ timeout: 5000 });

    const afterDelete = await (await request.get(`${API_URL}/embedding-providers`)).json();
    expect(afterDelete.find((p: any) => p.id === created.id)).toBeUndefined();
  });

  test('knowledge page: create, edit, refresh and delete a vector store via UI', async ({ page, request }) => {
    const name = `E2E Store ${Date.now()}`;
    const editedName = `${name} Edited`;

    await page.goto('/settings/knowledge');
    await expect(page.locator('[data-testid="knowledge-heading"]')).toBeVisible({ timeout: 10000 });

    // ── Create ──
    await page.locator('[data-testid="add-vectorstore-btn"]').click();
    await expect(page.getByRole('heading', { name: 'New Vector Store' })).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('URL').fill('http://qdrant-e2e:6333');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.locator('[data-testid="vectorstore-item"]', { hasText: name })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/qdrant · http:\/\/qdrant-e2e:6333/)).toBeVisible({ timeout: 5000 });

    const listRes = await request.get(`${API_URL}/vector-stores`);
    const stores = await listRes.json();
    const created = stores.find((s: any) => s.name === name);
    expect(created).toBeDefined();
    cleanupVectorStoreIds.push(created.id);

    // ── Refresh (errors are swallowed client-side; just assert no crash) ──
    await page.locator('[data-testid="vectorstore-item"]', { hasText: name }).getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('[data-testid="vectorstore-item"]', { hasText: name })).toBeVisible({ timeout: 5000 });

    // ── Edit ──
    await page.locator('[data-testid="vectorstore-item"]', { hasText: name }).getByTestId('edit-vectorstore-btn').click();
    await expect(page.getByRole('heading', { name: 'Edit Vector Store' })).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Name').fill(editedName);
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('[data-testid="vectorstore-item"]', { hasText: editedName })).toBeVisible({ timeout: 5000 });

    const edited = await (await request.get(`${API_URL}/vector-stores/${created.id}`)).json();
    expect(edited.name).toBe(editedName);

    // ── Delete with confirm dialog ──
    await page.locator('[data-testid="vectorstore-item"]', { hasText: editedName }).getByTestId('delete-vectorstore-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete vector store?' })).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('[data-testid="vectorstore-item"]', { hasText: editedName })).not.toBeVisible({ timeout: 5000 });

    const afterDelete = await (await request.get(`${API_URL}/vector-stores`)).json();
    expect(afterDelete.find((s: any) => s.id === created.id)).toBeUndefined();
  });
});

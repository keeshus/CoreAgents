import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Settings pages', () => {
  const cleanupGroupIds: string[] = [];
  const cleanupEndpointIds: string[] = [];
  const cleanupMcpIds: string[] = [];

  test.afterEach(async ({ request }) => {
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
    // Add a model and mark it default (required by the backend)
    await page.getByRole('button', { name: '+ Add model' }).click();
    await page.getByLabel('Model', { exact: true }).fill('mock-gpt-4');
    await page.getByText('Set default', { exact: true }).click();
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
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });
});

import { test, expect } from '@playwright/test';
import { uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

// ── Spec-scoped helpers ────────────────────────────────────────────────

// Delete an app-level env var via API (PUT replaces the whole bucket —
// keep other tests' vars intact by re-sending everything except ours).
async function removeAppVar(request: any, name: string) {
  const res = await request.get(`${API_URL}/env-vars`);
  if (!res.ok()) return;
  const vars = await res.json();
  if (!Array.isArray(vars)) return;
  const remaining = vars.filter((v: any) => v.name !== name);
  await request.put(`${API_URL}/env-vars`, { data: { envVars: remaining } });
}

test.describe('Env Vars settings page', () => {
  const cleanupGroupIds: string[] = [];
  const cleanupSecretIds: string[] = [];
  const cleanupVaultIds: string[] = [];
  let beforeAllGroupId: string | null = null;
  let beforeAllVaultId: string | null = null;
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM Env UI', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }

    // App-level Core secret used by the UI-created core_secret vars
    const secRes = await request.post(`${API_URL}/secrets`, {
      data: { name: 'UI_APP_SECRET', value: 'ui-secret-value-42', scope: 'app' },
    });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    // Group + bound CyberArk vault used by the UI-created cyberark var
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-CyberArk-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    beforeAllGroupId = group.id;

    const vRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'E2E UI CyberArk', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'host/myapp', apiKey: 'myapp-api-key-456', groupId: group.id },
    });
    expect(vRes.status()).toBe(201);
    const vault = await vRes.json();
    beforeAllVaultId = vault.id;

    await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);
    const bindRes = await request.put(`${API_URL}/group-vault-config/${group.id}`, {
      data: { vaultId: vault.id, enabled: true },
    });
    expect(bindRes.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) { await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`).catch(() => {}); }
    if (beforeAllVaultId) { await request.delete(`${API_URL}/secret-vaults/${beforeAllVaultId}`).catch(() => {}); }
    if (beforeAllGroupId) { await request.delete(`${API_URL}/groups/${beforeAllGroupId}`).catch(() => {}); }
    for (const id of cleanupSecretIds) { await request.delete(`${API_URL}/secrets/${id}`).catch(() => {}); }
    for (const id of cleanupVaultIds) { await request.delete(`${API_URL}/secret-vaults/${id}`).catch(() => {}); }
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    mockEndpointId = null;
    beforeAllGroupId = beforeAllVaultId = null;
    cleanupSecretIds.length = cleanupVaultIds.length = cleanupGroupIds.length = 0;
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    cleanupGroupIds.length = 0;
  });

  test('env vars settings page loads', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await expect(page.getByRole('heading', { name: /Environment Variables/i })).toBeVisible({ timeout: 10000 });
  });

  test('env vars page shows group filter', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `EV-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await expect(page.getByText('Filter by group')).toBeVisible({ timeout: 10000 });
  });

  test('add and remove an app env var via UI', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Fill fields
    await page.getByLabel('Variable name').fill('TEST_VAR');
    await page.getByLabel('Value').fill('test-value-123');

    // Submit
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1500);

    // Verify variable appears
    await expect(page.getByText('TEST_VAR').first()).toBeVisible({ timeout: 5000 });

    // Delete it — use the delete button in the same row
    const row = page.getByTestId('env-var-item').filter({ hasText: 'TEST_VAR' });
    await row.getByTestId('delete-var-btn').first().click();
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(1500);

    // Verify gone
    await expect(page.getByText('TEST_VAR')).toHaveCount(0, { timeout: 5000 });
  });

  test('toggle between static, core_secret, and cyberark types', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Default is Static — should see a textfield labeled "Value"
    await expect(page.getByLabel('Value')).toBeVisible();

    // Switch to Core Secret via the type dropdown
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.getByRole('option', { name: 'Core Secret' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Core Secret' }).click();
    await page.waitForTimeout(300);

    // After switching to Core Secret, the value field becomes a select too
    await expect(page.locator('[role="combobox"]')).toHaveCount(2, { timeout: 5000 });

    // Switch back to Static
    await page.locator('[role="combobox"]').filter({ hasText: 'Core Secret' }).click();
    await page.getByRole('option', { name: 'Static' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Static' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByLabel('Value')).toBeVisible();
  });

  test('group env vars tab — select a group and view vars', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-Group-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    // Open the group filter dropdown (SearchableSelect trigger button with "All items" text)
    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });

  test('group env vars — add and remove', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-Group-CRUD-${Date.now()}` } });
    expect(gRes.ok()).toBe(true);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    // Select group via filter — click the SearchableSelect trigger button
    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Select the group in the form's Group selector (defaults to "App-wide")
    // Click the trigger button, then select the group from the dropdown inside the form
    await page.getByTestId('add-var-form').locator('button').filter({ hasText: 'App-wide' }).click();
    await page.getByTestId('add-var-form').getByText(group.name).click();
    await page.waitForTimeout(300);

    await page.getByLabel('Variable name').fill('GROUP_VAR');
    await page.getByLabel('Value').fill('group-val');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText('GROUP_VAR').first()).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── CyberArk hidden when no group selected ──────────────────
  // ═══════════════════════════════════════════════════════════════

  test('CyberArk type is hidden when no group is selected', async ({ page }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    // Open add form
    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Open the type dropdown — CyberArk should NOT be an option
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.waitForTimeout(300);

    // Check that Core Secret is available but CyberArk is not
    await expect(page.getByRole('option', { name: 'Core Secret' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: 'CyberArk' })).not.toBeVisible({ timeout: 3000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── core_secret env var creation via UI ──────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('create an app core_secret env var via UI — persists with type and secret reference', async ({ page, request }) => {
    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    await page.getByLabel('Variable name').fill('UI_CORE_VAR');

    // Type dropdown: Static → Core Secret
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.getByRole('option', { name: 'Core Secret' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Core Secret' }).click();
    await page.waitForTimeout(300);

    // The value field becomes a secret selector — it must list the app secret
    // created in beforeAll
    await page.locator('[role="combobox"]').nth(1).click();
    await page.getByRole('option', { name: 'UI_APP_SECRET' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'UI_APP_SECRET' }).click();
    await page.waitForTimeout(300);

    await page.getByTestId('create-var-btn').click();
    await page.waitForTimeout(1500);

    // Row appears with the Core Secret badge
    await expect(page.getByText('UI_CORE_VAR').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Core Secret').first()).toBeVisible({ timeout: 5000 });

    // Persistence: the backend stores name + type + secret name reference
    const res = await request.get(`${API_URL}/env-vars`);
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    const entry = stored.find((v: any) => v.name === 'UI_CORE_VAR');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('core_secret');
    expect(entry.value).toBe('UI_APP_SECRET');

    // Cleanup via UI delete (exercises the app-var delete path with a secret var)
    const row = page.getByTestId('env-var-item').filter({ hasText: 'UI_CORE_VAR' });
    await row.getByTestId('delete-var-btn').first().click();
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('UI_CORE_VAR')).toHaveCount(0, { timeout: 5000 });
  });

  test('core secret dropdown in the add form lists existing secrets', async ({ page, request }) => {
    const secRes = await request.post(`${API_URL}/secrets`, {
      data: { name: 'UI_DROPDOWN_SECRET', value: 'dropdown-secret-val', scope: 'app' },
    });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Switch type to Core Secret so the value field becomes a secret select
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.getByRole('option', { name: 'Core Secret' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'Core Secret' }).click();
    await page.waitForTimeout(300);

    // The secret select must list the secret created via API
    await page.locator('[role="combobox"]').nth(1).click();
    const option = page.getByRole('option', { name: 'UI_DROPDOWN_SECRET' });
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.click();

    // Selecting it fills the value
    await expect(page.locator('[role="combobox"]').nth(1)).toContainText('UI_DROPDOWN_SECRET');

    // Cancel the form — nothing saved
    await page.getByTestId('cancel-var-btn').click();
    await expect(page.getByTestId('add-var-form')).not.toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Runtime behavior of app-level env vars (documented) ──────
  // ═══════════════════════════════════════════════════════════════
  // Backend only injects flow-level env vars (and the input __env
  // layer) into the sandbox at runtime. App-level env vars — even
  // core_secret ones — persist but never reach the sandbox. This
  // test pins that behavior so the gap is explicit and catches a fix.

  test('app-level core_secret env var persists but does not resolve in the sandbox (runtime is flow-scoped only)', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // App-level core_secret var pointing at the beforeAll secret
    const putRes = await request.put(`${API_URL}/env-vars`, {
      data: { envVars: [{ name: 'UI_RUNTIME_VAR', value: 'UI_APP_SECRET', type: 'core_secret' }] },
    });
    expect(putRes.ok()).toBe(true);
    try {
      // Flow with an LLM node referencing {{env.UI_RUNTIME_VAR}}
      const flowRes = await request.post(`${API_URL}/flows`, {
        data: {
          name: uniqueFlowName('AppEnv-Runtime'),
          nodes: [
            { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
            { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nApp var value: {{env.UI_RUNTIME_VAR}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
            { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Assistant.content'] } } },
          ],
          edges: [
            { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
            { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
          ],
        },
      });
      expect(flowRes.ok()).toBe(true);
      const flow = await flowRes.json();

      const { debugExecute } = await import('./helpers/stream');
      const events = await debugExecute(flow.id, { message: 'test' }, cookie);
      await request.delete(`${API_URL}/flows/${flow.id}`).catch(() => {});

      const completed = events.find(e => e.type === 'execution.completed');
      expect(completed).toBeDefined();
      const output = completed?.data?.output || {};
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

      // Template IS resolved (to empty — var missing from sandboxEnv),
      // but neither the secret value nor the secret name reaches runtime
      expect(outputStr).toContain('App var value:');
      expect(outputStr).not.toContain('{{env.UI_RUNTIME_VAR}}');
      expect(outputStr).not.toContain('ui-secret-value-42');
    } finally {
      await removeAppVar(request, 'UI_RUNTIME_VAR');
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── cyberark env var creation via UI ─────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('create a cyberark env var via UI for a group with a bound vault — persists', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-CyberArk-Var-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: /Add/i }).first().click();
    await page.waitForTimeout(500);

    // Select the group in the form's Group selector so CyberArk becomes available
    await page.getByTestId('add-var-form').locator('button').filter({ hasText: 'App-wide' }).click();
    await page.getByTestId('add-var-form').getByText(group.name).click();
    await page.waitForTimeout(300);

    await page.getByLabel('Variable name').fill('UI_CYBER_VAR');

    // Type dropdown now includes CyberArk
    await page.locator('[role="combobox"]').filter({ hasText: 'Static' }).click();
    await page.getByRole('option', { name: 'CyberArk' }).waitFor({ timeout: 5000 });
    await page.getByRole('option', { name: 'CyberArk' }).click();
    await page.waitForTimeout(300);

    // CyberArk uses a plain text value field for the reference path
    await page.getByLabel('Value').fill('prod/db/password');
    await page.getByTestId('create-var-btn').click();
    await page.waitForTimeout(1500);

    // Row appears with the CyberArk badge
    await expect(page.getByText('UI_CYBER_VAR').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('CyberArk').first()).toBeVisible({ timeout: 5000 });

    // Persistence via the group env vars API
    const res = await request.get(`${API_URL}/env-vars/groups/${group.id}`);
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    const entry = stored.find((v: any) => v.name === 'UI_CYBER_VAR');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('cyberark');
    expect(entry.value).toBe('prod/db/password');

    // Cleanup: delete via UI
    const row = page.getByTestId('env-var-item').filter({ hasText: 'UI_CYBER_VAR' });
    await row.getByTestId('delete-var-btn').first().click();
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('UI_CYBER_VAR')).toHaveCount(0, { timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Group env var deletion via UI ────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('delete a group env var via UI — persists to the group scope', async ({ request, page }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `UI-Group-Del-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const putRes = await request.put(`${API_URL}/env-vars/groups/${group.id}`, {
      data: { envVars: [{ name: 'UI_GROUP_DEL_VAR', value: 'delete-me', type: 'static' }] },
    });
    expect(putRes.ok()).toBe(true);

    await page.goto('/settings/env-vars');
    await page.waitForTimeout(1500);

    // Select the group in the filter so only its vars are shown
    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText('UI_GROUP_DEL_VAR').first()).toBeVisible({ timeout: 5000 });

    const row = page.getByTestId('env-var-item').filter({ hasText: 'UI_GROUP_DEL_VAR' });
    await row.getByTestId('delete-var-btn').first().click();
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(1500);

    // Gone from the UI
    await expect(page.getByText('UI_GROUP_DEL_VAR')).toHaveCount(0, { timeout: 5000 });

    // Gone from the backend
    const res = await request.get(`${API_URL}/env-vars/groups/${group.id}`);
    expect(res.ok()).toBe(true);
    const stored = await res.json();
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.find((v: any) => v.name === 'UI_GROUP_DEL_VAR')).toBeUndefined();
  });
});

import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Secrets management', () => {
  const cleanupSecretIds: string[] = [];
  const cleanupVaultIds: string[] = [];
  const cleanupGroupIds: string[] = [];
  const cleanupFlowIds: string[] = [];
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM Secrets', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupSecretIds) { await request.delete(`${API_URL}/secrets/${id}`).catch(() => {}); }
    for (const id of cleanupVaultIds) { await request.delete(`${API_URL}/secret-vaults/${id}`).catch(() => {}); }
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    for (const id of cleanupFlowIds) { await deleteFlow(request, id).catch(() => {}); }
    cleanupSecretIds.length = cleanupVaultIds.length = cleanupGroupIds.length = cleanupFlowIds.length = 0;
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── App-scoped secrets CRUD ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('create an app-level secret', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, {
      data: { name: 'api-key', value: 'sk-abc123', scope: 'app' },
    });
    expect(res.status()).toBe(201);
    const secret = await res.json();
    expect(secret.name).toBe('api-key');
    expect(secret.scope).toBe('app');
    cleanupSecretIds.push(secret.id);
  });

  test('list secrets returns metadata only (no values)', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, { data: { name: 'db-pass', value: 'secret123', scope: 'app' } });
    const secret = await res.json();
    cleanupSecretIds.push(secret.id);

    // List should not contain the value
    const listRes = await request.get(`${API_URL}/secrets?scope=app`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const found = list.find((s: any) => s.id === secret.id);
    expect(found).toBeDefined();
    expect(found.encrypted_value).toBeUndefined();
  });

  test('reveal a secret returns the plaintext value', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, { data: { name: 'my-secret', value: 'plaintext-value', scope: 'app' } });
    const secret = await res.json();
    cleanupSecretIds.push(secret.id);

    const revealRes = await request.post(`${API_URL}/secrets/${secret.id}/reveal`);
    expect(revealRes.status()).toBe(200);
    const revealed = await revealRes.json();
    expect(revealed.value).toBe('plaintext-value');
  });

  test('delete a secret', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, { data: { name: 'delete-me', value: 'x', scope: 'app' } });
    const secret = await res.json();

    const delRes = await request.delete(`${API_URL}/secrets/${secret.id}`);
    expect(delRes.status()).toBe(200);

    const getRes = await request.get(`${API_URL}/secrets/${secret.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('rejects duplicate secret name in same scope', async ({ request }) => {
    const res = await request.post(`${API_URL}/secrets`, { data: { name: 'dup-test', value: 'first', scope: 'app' } });
    expect(res.status()).toBe(201);
    const secret = await res.json();
    cleanupSecretIds.push(secret.id);

    const dupRes = await request.post(`${API_URL}/secrets`, { data: { name: 'dup-test', value: 'second', scope: 'app' } });
    expect(dupRes.status()).toBe(409);
  });

  test('rejects empty name or value', async ({ request }) => {
    const res1 = await request.post(`${API_URL}/secrets`, { data: { name: '', value: 'x', scope: 'app' } });
    expect(res1.status()).toBe(400);

    const res2 = await request.post(`${API_URL}/secrets`, { data: { name: 'x', value: '', scope: 'app' } });
    expect(res2.status()).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Flow-scoped secrets in Flow Settings modal ─────────────
  // ═══════════════════════════════════════════════════════════════

  test('flow-level secrets appear in Flow Settings modal', async ({ page, request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('Secret-Flow') });
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    // Add a flow-level secret via API
    const secRes = await request.post(`${API_URL}/secrets`, {
      data: { name: 'flow-token', value: 'flow-secret-value', scope: 'flow', scopeId: flow.id },
    });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings modal
    await page.locator('button').filter({ hasText: 'settings' }).click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Flow Secrets section should be visible with the secret
    await expect(page.getByText('Flow Secrets')).toBeVisible();
    await expect(page.getByText('flow-token')).toBeVisible();
  });

  test('create flow-level secret from Flow Settings modal', async ({ page, request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('Secret-Create') });
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings (settings icon in the top bar)
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Fill in new secret fields
    const nameInput = page.locator('input[placeholder="Secret name"]');
    const valueInput = page.locator('input[placeholder="Value"]');
    await nameInput.fill('db-password');
    await valueInput.fill('s3cr3t');

    // Click the add icon button next to the value field
    await page.locator('button').filter({ hasText: 'add' }).last().click();

    // The secret should appear in the list
    await expect(page.getByText('db-password')).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── CyberArk vault ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('create a Conjur vault config', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: {
        name: 'Test Conjur',
        vaultType: 'cyberark',
        baseUrl: 'http://mock-cyberark-e2e:3005',
        account: 'conjur',
        login: 'host/myapp',
        apiKey: 'myapp-api-key-456',
      },
    });
    expect(res.status()).toBe(201);
    const vault = await res.json();
    expect(vault.name).toBe('Test Conjur');
    expect(vault.hasApiKey).toBe(true);
    // The actual api_key should NOT be in the response
    expect(vault.api_key).toBeUndefined();
    cleanupVaultIds.push(vault.id);
  });

  test('test connection to Conjur vault', async ({ request }) => {
    const res = await request.post(`${API_URL}/secret-vaults`, {
      data: {
        name: 'Connectable Vault',
        vaultType: 'cyberark',
        baseUrl: 'http://mock-cyberark-e2e:3005',
        account: 'conjur',
        login: 'host/myapp',
        apiKey: 'myapp-api-key-456',
      },
    });
    expect(res.status()).toBe(201);
    const vault = await res.json();
    expect(vault.name).toBe('Connectable Vault');

    const testRes = await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);
    expect(testRes.status()).toBe(200);
    const testResult = await testRes.json();
    expect(testResult.success).toBe(true);
  });

  test('bind a vault to a group via group-vault-config', async ({ request }) => {
    const vRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'Group Vault', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'host/myapp', apiKey: 'myapp-api-key-456' },
    });
    const vault = await vRes.json();
    cleanupVaultIds.push(vault.id);

    await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);

    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `Vault-Group-${Date.now()}` } });
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const bindRes = await request.put(`${API_URL}/group-vault-config/${group.id}`, {
      data: { vaultId: vault.id, enabled: true },
    });
    expect(bindRes.status()).toBe(200);
    const bindResult = await bindRes.json();
    expect(bindResult.status).toBe('updated');

    const getBindRes = await request.get(`${API_URL}/group-vault-config/${group.id}`);
    expect(getBindRes.status()).toBe(200);
    const binding = await getBindRes.json();
    expect(binding.vaultId).toBe(vault.id);
    expect(binding.enabled).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Secrets in template resolution ─────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('{{secrets.core.app:NAME}} resolves in LLM system prompt', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create an app-level secret
    const secRes = await request.post(`${API_URL}/secrets`, { data: { name: 'app-greeting', value: 'Hello from app secret!', scope: 'app' } });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    // Create a flow that references the secret in the system prompt
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Secret-Resolve'),
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe greeting is: {{secrets.core.app:app-greeting}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
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
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    // The mock LLM echoed the full system prompt — the secret should be resolved
    expect(outputStr).toContain('Hello from app secret!');
    // The template tag should be replaced, not present as-is
    expect(outputStr).not.toContain('{{secrets.core.app:app-greeting}}');
  });

  test('{{secrets.cyberark.PATH}} resolves from bound Conjur vault', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create a Conjur vault
    const vRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'E2E Conjur', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'host/myapp', apiKey: 'myapp-api-key-456' },
    });
    expect(vRes.status()).toBe(201);
    const vault = await vRes.json();
    cleanupVaultIds.push(vault.id);

    // Connect it
    await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);

    // Create a group bound to this vault
    const groupName = `Conjur-Group-${Date.now()}`;
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: groupName } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await request.put(`${API_URL}/group-vault-config/${group.id}`, {
      data: { vaultId: vault.id, enabled: true },
    });

    // Create a flow in this group with a system prompt referencing a Conjur secret
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Conjur-Resolve'),
        group_id: group.id,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe DB password is: {{secrets.cyberark.prod/db/password}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
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
    cleanupFlowIds.push(flow.id);

    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    // The Conjur secret should be resolved in the prompt
    expect(outputStr).toContain('sup3r-s3cr3t-db-pass!');
    expect(outputStr).not.toContain('{{secrets.cyberark.prod/db/password}}');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Secrets settings page ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('secrets settings page loads', async ({ page }) => {
    await page.goto('/settings/secrets');
    await expect(page.locator('h1').filter({ hasText: 'Secrets' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('secrets vault settings page loads and shows vault list', async ({ page, request }) => {
    await page.goto('/settings/secret-vaults');
    // Wait for the actual page content to render (not just the shell)
    await expect(page.getByText('Add Vault')).toBeVisible({ timeout: 10000 });
    // Verify the React component rendered without crashing
    const hasCrashed = await page.getByText('Secret Vaults').isVisible().catch(() => false);
    expect(hasCrashed).toBe(true);
    // Verify API access works
    const listRes = await request.get(`${API_URL}/secret-vaults`);
    expect(listRes.status()).toBe(200);
  });

  test('settings navigation shows secrets links', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Secrets').first()).toBeVisible();
    await expect(page.getByText('Secret Vaults').first()).toBeVisible();
  });
});

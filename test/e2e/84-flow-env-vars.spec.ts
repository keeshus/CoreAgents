import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Flow env vars and secret types', () => {
  const cleanupFlowIds: string[] = [];
  const cleanupSecretIds: string[] = [];
  const cleanupVaultIds: string[] = [];
  const cleanupGroupIds: string[] = [];
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM Flow Env', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupFlowIds) { await deleteFlow(request, id).catch(() => {}); }
    for (const id of cleanupSecretIds) { await request.delete(`${API_URL}/secrets/${id}`).catch(() => {}); }
    for (const id of cleanupVaultIds) { await request.delete(`${API_URL}/secret-vaults/${id}`).catch(() => {}); }
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    cleanupFlowIds.length = cleanupSecretIds.length = cleanupVaultIds.length = cleanupGroupIds.length = 0;
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Flow env vars in Flow Settings modal ─────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('flow env vars appear in Flow Settings modal', async ({ page, request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('Env-Flow') });
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    // Add a flow-level env var via flow update
    const updateRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: { envVars: [{ name: 'FLOW_TOKEN', value: 'flow-val', type: 'static' }] },
    });
    if (!updateRes.ok()) test.skip(true, 'Flow env_vars column not yet available');

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings modal
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // The Environment Variables section should show FLOW_TOKEN
    await expect(page.getByText('Environment Variables', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await expect(page.getByText('FLOW_TOKEN').first()).toBeVisible({ timeout: 5000 });
    // Use the Static badge rendered inside the env var item
    await expect(page.getByText('Static').first()).toBeVisible({ timeout: 5000 });
  });

  test('add a flow env var via UI', async ({ page, request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('Env-Add') });
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings modal
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Scroll down to env vars section
    const envSection = page.getByText('Environment Variables', { exact: true });
    await expect(envSection).toBeVisible();

    // Fill in the new env var form
    await page.getByPlaceholder('Variable name').fill('DB_URL');
    await page.getByPlaceholder('Variable name').locator('..').locator('select').selectOption('static');
    await page.getByPlaceholder('Variable name').locator('..').getByPlaceholder('Value').fill('postgres://localhost:5432/mydb');

    // Click the add button
    await page.getByPlaceholder('Variable name').locator('..').locator('button').click();

    // The var should appear in the list
    await expect(page.getByText('DB_URL')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Static').first()).toBeVisible();

    // Close the modal (auto-save — no Save button needed)
    await page.getByRole('button', { name: 'close' }).click();
    await expect(page.getByText('Flow Settings')).not.toBeVisible({ timeout: 5000 });

    // Verify persistence — reload and check
    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('DB_URL')).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Flow env var resolution during execution ─────────────────
  // ═══════════════════════════════════════════════════════════════

  test('{{env.FLOW_VAR}} resolves during execution', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Flow-Env-Resolve'),
        envVars: [{ name: 'DB_HOST', value: 'db.internal', type: 'static' }],
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe DB is at: {{env.DB_HOST}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
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
    expect(outputStr).toContain('db.internal');
    expect(outputStr).not.toContain('{{env.DB_HOST}}');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── core_secret env var resolution ───────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('core_secret env var references a Core secret during execution', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create an app-level Core secret
    const secRes = await request.post(`${API_URL}/secrets`, {
      data: { name: 'MY_API_KEY', value: 'sk-12345', scope: 'app' },
    });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    // Create a flow with a core_secret type env var
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('CoreSecret-Resolve'),
        envVars: [{ name: 'API_KEY', value: 'MY_API_KEY', type: 'core_secret' }],
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe API key is: {{env.API_KEY}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
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
    // The core_secret should be resolved to the actual secret value
    expect(outputStr).toContain('sk-12345');
    expect(outputStr).not.toContain('{{env.API_KEY}}');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── cyberark env var resolution ──────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('cyberark env var references a CyberArk vault', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create a group first (vaults require a group)
    const groupRes = await request.post(`${API_URL}/groups`, { data: { name: `CyberArk-Env-Group-${Date.now()}` } });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();
    cleanupGroupIds.push(group.id);

    // Create a Conjur vault bound to the group
    const vRes = await request.post(`${API_URL}/secret-vaults`, {
      data: { name: 'E2E CyberArk Env', vaultType: 'cyberark', baseUrl: 'http://mock-cyberark-e2e:3005', account: 'conjur', login: 'host/myapp', apiKey: 'myapp-api-key-456', groupId: group.id },
    });
    expect(vRes.status()).toBe(201);
    const vault = await vRes.json();
    cleanupVaultIds.push(vault.id);

    // Test connection
    await request.post(`${API_URL}/secret-vaults/${vault.id}/test`);

    // Bind the vault to the group
    await request.put(`${API_URL}/group-vault-config/${group.id}`, {
      data: { vaultId: vault.id, enabled: true },
    });

    // Create a flow in that group with a cyberark type env var
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('CyberArk-Env-Resolve'),
        group_id: group.id,
        envVars: [{ name: 'DB_PASS', value: 'prod/db/password', type: 'cyberark' }],
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: mockEndpointId, model: 'mock-gpt-4', systemPrompt: 'ECHO_SYSTEM_PROMPT\nThe DB password is: {{env.DB_PASS}}', temperature: 0.7, maxTokens: 1024, responseFormat: 'text' } } },
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
    // The mock CyberArk returns "sup3r-s3cr3t-db-pass!" for prod/db/password
    expect(outputStr).toContain('sup3r-s3cr3t-db-pass!');
    expect(outputStr).not.toContain('{{env.DB_PASS}}');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Inherited Secrets & Env Vars in Flow Settings ────────────
  // ═══════════════════════════════════════════════════════════════

  test('inherited secrets and env vars appear in Flow Settings modal', async ({ page, request }) => {
    // Create an app-level secret and env var
    const secRes = await request.post(`${API_URL}/secrets`, { data: { name: 'app-db-password', value: 'app-secret-val', scope: 'app' } });
    expect(secRes.status()).toBe(201);
    const appSecret = await secRes.json();
    cleanupSecretIds.push(appSecret.id);

    await request.put(`${API_URL}/env-vars`, { data: { envVars: [{ name: 'APP_VAR', value: 'app-val', type: 'static' }] } });

    // Create a group and add group-level items
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `Inherited-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await request.put(`${API_URL}/env-vars/groups/${group.id}`, { data: { envVars: [{ name: 'GROUP_VAR', value: 'group-val', type: 'static' }] } });

    // Create a flow in the group
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: { name: uniqueFlowName('Inherited-Test'), group_id: group.id },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings modal
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Inherited Secrets section should show the app-level secret
    await expect(page.getByText('Inherited Secrets')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('app-db-password')).toBeVisible({ timeout: 5000 });

    // Inherited Environment Variables section should show app and group vars
    await expect(page.getByText('Inherited Environment Variables')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('APP_VAR').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('GROUP_VAR').first()).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Core Secret dropdown in Flow Settings env vars ──────────
  // ═══════════════════════════════════════════════════════════════

  test('core_secret dropdown shows available secrets in Flow Settings', async ({ page, request }) => {
    const secRes = await request.post(`${API_URL}/secrets`, { data: { name: 'MY_API_SECRET', value: 'sk-abc', scope: 'app' } });
    expect(secRes.status()).toBe(201);
    const secret = await secRes.json();
    cleanupSecretIds.push(secret.id);

    const flowRes = await request.post(`${API_URL}/flows`, { data: { name: uniqueFlowName('CoreSecret-Dropdown') } });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Scroll to env vars section and switch type to Core Secret
    await page.getByText('Environment Variables', { exact: true }).click();
    await page.locator('select').filter({ hasText: 'Static' }).selectOption('core_secret');

    // The Core Secret dropdown should contain our secret as an option
    const coreSelect = page.locator('select').nth(1);
    await expect(coreSelect).toContainText('MY_API_SECRET');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── CyberArk dropdown in Flow Settings env vars ─────────────
  // ═══════════════════════════════════════════════════════════════

  test('cyberark dropdown shows select element in Flow Settings', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `CyberArk-Dropdown-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const flowRes = await request.post(`${API_URL}/flows`, {
      data: { name: uniqueFlowName('CyberArk-Dropdown'), group_id: group.id },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Switch to CyberArk type
    await page.getByText('Environment Variables', { exact: true }).click();
    await page.locator('select').filter({ hasText: 'Static' }).selectOption('cyberark');

    // A select element with the CyberArk placeholder should be visible
    const cyberSelect = page.locator('select').nth(1);
    await expect(cyberSelect).toBeVisible({ timeout: 5000 });
    await expect(cyberSelect).toContainText('Select a CyberArk secret');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Secret type toggle in Flow Settings modal ───────────────
  // ═══════════════════════════════════════════════════════════════

  test('secret type toggle switches between Core and CyberArk in Flow Settings', async ({ page, request }) => {
    const flowRes = await request.post(`${API_URL}/flows`, { data: { name: uniqueFlowName('Secret-Type-Toggle') } });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Open Flow Settings
    await page.getByTestId('flow-settings-btn').click();
    await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });

    // Scroll to Flow Secrets section
    await expect(page.getByText('Flow Secrets')).toBeVisible({ timeout: 5000 });

    // The Core/CyberArk toggle buttons should be visible
    const coreBtn = page.getByRole('button', { name: 'Core' });
    const cyberBtn = page.getByRole('button', { name: 'CyberArk' });
    await expect(coreBtn).toBeVisible();
    await expect(cyberBtn).toBeVisible();

    // Core should be selected by default
    await expect(coreBtn).toHaveClass(/bg-primary/);

    // Click CyberArk — should show reference path input instead of password
    await cyberBtn.click();
    await page.waitForTimeout(300);
    await expect(cyberBtn).toHaveClass(/bg-primary/);
    await expect(page.getByPlaceholder('Reference path')).toBeVisible();

    // Click Core again — should show value input
    await coreBtn.click();
    await page.waitForTimeout(300);
    await expect(coreBtn).toHaveClass(/bg-primary/);
    await expect(page.getByTestId('flow-secret-value')).toBeVisible();
  });
});

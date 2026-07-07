import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Agent contexts system', () => {
const cleanupContextIds: string[] = [];
const cleanupGroupIds: string[] = [];
const cleanupFlowIds: string[] = [];
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM AC', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) { const ep = await llmRes.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  test.afterEach(async ({ request }) => {
    for (const id of cleanupContextIds) {
      await request.delete(`${API_URL}/agent-contexts/${id}`).catch(() => {});
    }
    cleanupContextIds.length = 0;
    for (const id of cleanupGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    cleanupGroupIds.length = 0;
    for (const id of cleanupFlowIds) {
      await deleteFlow(request, id).catch(() => {});
    }
    cleanupFlowIds.length = 0;
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Agent Context CRUD ─────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('create an agent context via API', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Brand Voice', description: 'Tone and style guide', content: 'Use a professional yet approachable tone.' },
    });
    expect(res.status()).toBe(201);
    const ctx = await res.json();
    expect(ctx.title).toBe('Brand Voice');
    expect(ctx.content).toBe('Use a professional yet approachable tone.');
    cleanupContextIds.push(ctx.id);
  });

  test('list all agent contexts', async ({ request }) => {
    const c1 = await request.post(`${API_URL}/agent-contexts`, { data: { title: 'Alpha' } });
    const c2 = await request.post(`${API_URL}/agent-contexts`, { data: { title: 'Beta' } });
    const ctx1 = await c1.json();
    const ctx2 = await c2.json();
    cleanupContextIds.push(ctx1.id, ctx2.id);

    const listRes = await request.get(`${API_URL}/agent-contexts`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const titles = list.map((c: any) => c.title);
    expect(titles).toContain('Alpha');
    expect(titles).toContain('Beta');
  });

  test('update an agent context via API', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Old Title', content: 'Old content' },
    });
    const ctx = await res.json();
    cleanupContextIds.push(ctx.id);

    const updRes = await request.put(`${API_URL}/agent-contexts/${ctx.id}`, {
      data: { title: 'New Title', content: 'New content' },
    });
    expect(updRes.status()).toBe(200);
    const updated = await updRes.json();
    expect(updated.title).toBe('New Title');
    expect(updated.content).toBe('New content');
  });

  test('delete an agent context via API', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Delete Me' },
    });
    const ctx = await res.json();

    const delRes = await request.delete(`${API_URL}/agent-contexts/${ctx.id}`);
    expect(delRes.status()).toBe(204);

    const getRes = await request.get(`${API_URL}/agent-contexts/${ctx.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('rejects empty title', async ({ request }) => {
    const res = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: '', content: 'test' },
    });
    expect(res.status()).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Global Context ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('global context settings page loads', async ({ page }) => {
    await page.goto('/settings/global-context');
    await expect(page.locator('h1').filter({ hasText: 'Global Context' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('global context can be saved and read back', async ({ page }) => {
    await page.goto('/settings/global-context');
    await expect(page.locator('h1').filter({ hasText: 'Global Context' }).first()).toBeVisible({ timeout: 10000 });

    const textarea = page.locator('textarea').first();
    await textarea.fill('You are a helpful AI assistant for the Acme Corporation.');

    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Global context saved')).toBeVisible({ timeout: 5000 });

    // Reload and verify persisted
    await page.goto('/settings/global-context');
    await expect(page.locator('textarea').first()).toHaveValue(/Acme Corporation/);
  });

  test('global context appears in settings navigation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Global Context')).toBeVisible();
    const link = page.locator('a').filter({ hasText: 'Global Context' }).first();
    await expect(link).toHaveAttribute('href', '/settings/global-context');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Group Context ───────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('group context can be set on group creation', async ({ request }) => {
    const name = `Ctx-Group-${Date.now()}`;
    const res = await request.post(`${API_URL}/groups`, {
      data: { name, description: 'Test', context: 'This group manages customer-facing flows.' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    expect(group.context).toBe('This group manages customer-facing flows.');
    cleanupGroupIds.push(group.id);
  });

  test('group context is returned in group detail', async ({ request }) => {
    const name = `Detail-Ctx-Group-${Date.now()}`;
    const res = await request.post(`${API_URL}/groups`, {
      data: { name, context: 'Group-level instructions.' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();

    const getRes = await request.get(`${API_URL}/groups/${group.id}`);
    const detail = await getRes.json();
    expect(detail.context).toBe('Group-level instructions.');

    await request.delete(`${API_URL}/groups/${group.id}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Flow Context ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('flow context can be set via API', async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Context-Flow'),
      nodes: [{ id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
      edges: [],
    });
    const flow = await res.json();
    cleanupFlowIds.push(flow.id);

    const updRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: { flow_context: 'This flow handles user onboarding.' },
    });
    expect(updRes.ok()).toBe(true);
    const updated = await updRes.json();
    expect(updated.flow_context).toBe('This flow handles user onboarding.');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── LLM Agent Config — Agent Contexts selector ─────────────
  // ═══════════════════════════════════════════════════════════════

  test('LLM agent config shows agent contexts checkbox list', async ({ page, request }) => {
    // Create an agent context
    const ctxRes = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Test Context', description: 'A test', content: 'Test content here.' },
    });
    const ctx = await ctxRes.json();
    cleanupContextIds.push(ctx.id);

    const flowRes = await createFlow(request, { name: uniqueFlowName('AC-Config-Test') });
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Add LLM Agent node
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-llm-agent').click();

    // Open the LLM Agent config
    await page.getByText('LLM Agent').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    // Agent Contexts section should be visible with our context
    await expect(page.getByText('Agent Contexts')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Test Context')).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Context Layering in LLM Execution ──────────────────────
  // ═══════════════════════════════════════════════════════════════

  test('context layering injects global + group + flow + agent contexts into LLM prompt', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Set up global context
    const globalRes = await request.put(`${API_URL}/settings/global-context`, {
      data: { value: 'You work for Acme Corp.' },
    });
    expect(globalRes.ok()).toBe(true);

    // Create a group with context
    const groupName = `Layer-Group-${Date.now()}`;
    const groupRes = await request.post(`${API_URL}/groups`, {
      data: { name: groupName, context: 'Answer customer support questions.' },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();
    cleanupGroupIds.push(group.id);

    // Create an agent context
    const ctxRes = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Product Info', content: 'Widget Pro v2 is our main product.' },
    });
    expect(ctxRes.status()).toBe(201);
    const agentCtx = await ctxRes.json();
    cleanupContextIds.push(agentCtx.id);

    // Create the flow with all context layers
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Layer-Test'),
        group_id: group.id,
        flow_context: 'This is the billing flow.',
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          {
            id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
            data: {
              label: 'Assistant',
              type: 'llm-agent',
              config: {
                endpointId: mockEndpointId, model: 'mock-gpt-4',
                systemPrompt: 'ECHO_SYSTEM_PROMPT\nRespond to {{input.Trigger.message}}',
                temperature: 0.7, maxTokens: 1024, responseFormat: 'text',
                contextIds: [agentCtx.id],
              },
            },
          },
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

    // Execute in debug mode — the mock LLM will echo back the full system prompt
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(flow.id, { message: 'test' }, cookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // The mock LLM echoed the full system prompt — verify all 5 layers are present
    expect(outputStr).toContain('You work for Acme Corp.');          // Layer 1: Global context
    expect(outputStr).toContain('Answer customer support questions.'); // Layer 2: Group context
    expect(outputStr).toContain('This is the billing flow.');          // Layer 3: Flow context
    expect(outputStr).toContain('Product Info');                        // Layer 4: Agent context title
    expect(outputStr).toContain('Widget Pro v2 is our main product.'); // Layer 4: Agent context content
    expect(outputStr).toContain('Respond to');                         // Layer 5: Node system prompt
    expect(outputStr).toContain('---');                                // Separators between layers
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Agent Contexts: Group filter on settings page ───────────
  // ═══════════════════════════════════════════════════════════════

  test('agent contexts group filter filters contexts by group', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `AC-Filter-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const ctxRes = await request.post(`${API_URL}/agent-contexts`, {
      data: { title: 'Group-Scoped', content: 'Only for this group.', group_id: group.id },
    });
    expect(ctxRes.status()).toBe(201);
    const ctx = await ctxRes.json();
    cleanupContextIds.push(ctx.id);

    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Agent Contexts' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Group-Scoped').first()).toBeVisible({ timeout: 5000 });

    await page.getByText('All items').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Group-Scoped').first()).toBeVisible({ timeout: 5000 });
  });

  test('agent contexts form group selector assigns context to group', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, { data: { name: `AC-Form-Group-${Date.now()}` } });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Agent Contexts' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New Context' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Group').first()).toBeVisible({ timeout: 5000 });

    await page.getByText('App-wide').first().click();
    await page.getByText(group.name).first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Title').fill('Group-Assigned');
    await page.locator('textarea').first().fill('Group content.');
    await page.locator('button.m3-button').filter({ hasText: 'Create' }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Group-Assigned').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(group.name).first()).toBeVisible({ timeout: 5000 });
  });
});

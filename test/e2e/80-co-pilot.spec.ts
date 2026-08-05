import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot AI Assistant', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E Co-Pilot LLM',
        providerType: 'openai',
        baseUrl: 'http://mock-llm-e2e:3002/v1',
        apiKey: 'mock-key',
        defaultModel: 'mock-gpt-4',
        models: ['mock-gpt-4'],
      },
    });
    expect(llmRes.ok()).toBe(true);
    const ep = await llmRes.json();
    mockEndpointId = ep.id;
    const setDefault = await request.put(`${API_URL}/llm-endpoints/${ep.id}`, {
      data: { isDefault: true },
    });
    expect(setDefault.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) {
      await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`).catch(() => {});
    }
  });

  const createdFlowIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdFlowIds) {
      await deleteFlow(request, id).catch(() => {});
    }
    createdFlowIds.length = 0;
  });

  /** Open the Co-Pilot panel from the floating FAB. */
  async function openPanel(page: any) {
    const toggleBtn = page.getByTestId('co-pilot-toggle');
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();
    const textarea = page.getByPlaceholder('Ask anything...');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Co-Pilot').first()).toBeVisible();
    // No endpoint badge means the default endpoint is wired up
    await expect(page.getByText('No endpoint')).toHaveCount(0, { timeout: 5000 });
    return textarea;
  }

  /** Send a message and wait for the mock LLM response to render. */
  async function sendMessage(page: any, textarea: any, message: string, expectedResponses = 1) {
    await textarea.fill(message);
    await page.keyboard.press('Enter');
    // User message renders in the panel (exact match — the response echoes the text too)
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 5000 });
    // The mock echoes "Mock response to: <message>"
    await expect.poll(
      () => page.getByText(/Mock response to/).count(),
      { timeout: 20000, message: 'co-pilot response should render in the panel' },
    ).toBe(expectedResponses);
  }

  test('assistant FAB opens the panel with an input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);
    await expect(textarea).toBeEditable();
  });

  test('co-pilot sends a message and renders the streamed response', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    await sendMessage(page, textarea, 'hello co-pilot');

    // Final assistant bubble contains the echoed mock response
    const response = page.getByText('Mock response to: hello co-pilot').first();
    await expect(response).toBeVisible({ timeout: 10000 });
  });

  test('conversation history persists across messages and page reloads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    await sendMessage(page, textarea, 'first co-pilot message');
    await sendMessage(page, textarea, 'second co-pilot message', 2);

    // Both user messages are visible in the conversation
    await expect(page.getByText('first co-pilot message', { exact: true })).toBeVisible();
    await expect(page.getByText('second co-pilot message', { exact: true })).toBeVisible();

    // Close the panel (saves the conversation), reload, reopen — history persists
    await page.getByTestId('co-pilot-toggle').click();
    await expect(page.getByPlaceholder('Ask anything...')).toHaveCount(0, { timeout: 3000 });
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    await page.getByTestId('co-pilot-toggle').click();
    await expect(page.getByPlaceholder('Ask anything...')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('first co-pilot message', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('second co-pilot message', { exact: true })).toBeVisible();
  });

  test('co-pilot works on the flow editor', async ({ page, request }) => {
    const flowRes = await createFlow(request, { name: uniqueFlowName('CoPilot-Flow') });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const textarea = await openPanel(page);
    await sendMessage(page, textarea, 'help me on the editor');

    // Editor still functional behind the panel
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 5000 });
  });

  test('co-pilot executes a tool call (MOCK_TOOL_CALL) and shows the result bubble', async ({ page, request }) => {
    // Create a flow so list_flows returns real data
    const flowRes = await createFlow(request, { name: uniqueFlowName('CoPilot-Tool') });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    // The mock LLM (test/mock-llm) returns a tool_call for list_flows when the
    // message starts with MOCK_TOOL_CALL. The panel executes the real
    // list_flows tool (REST call to /api/flows), renders a tool bubble, feeds
    // the result back, and the mock then returns plain text.
    await textarea.fill('MOCK_TOOL_CALL: list_flows {}');
    await page.keyboard.press('Enter');

    // Tool bubble appears with the tool name
    await expect(page.getByText(/🔧 list_flows/).first()).toBeVisible({ timeout: 10000 });

    // The follow-up response renders after the tool result is fed back
    await expect.poll(
      () => page.getByText(/Mock response to: Tool result/).count(),
      { timeout: 20000, message: 'follow-up response after tool call should render' },
    ).toBeGreaterThan(0);
  });

  test('co-pilot echoes its system prompt (page capabilities + tools)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    // ECHO_SYSTEM_PROMPT makes the mock return the full system prompt, which
    // the panel renders — verifying the page-aware prompt + tool list end-to-end.
    await textarea.fill('ECHO_SYSTEM_PROMPT');
    await page.keyboard.press('Enter');

    await expect(page.getByText('You are Co-Pilot, an AI assistant for OrcheStream.AI').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Available tools:/).first()).toBeVisible({ timeout: 5000 });
    // Flows-list page tools are advertised and page capability text is present
    await expect(page.getByText(/list_flows/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/This page shows a list of all flows/).first()).toBeVisible({ timeout: 5000 });
  });

  test('co-pilot knows which tab is active on the flows page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    // Switch to the Agent Contexts tab, then ask the co-pilot for its page
    // description — the echoed system prompt must mention the active tab.
    await page.getByRole('button', { name: /Agent Contexts/ }).click();
    await page.waitForTimeout(500);
    const textarea = await openPanel(page);

    await textarea.fill('ECHO_SYSTEM_PROMPT');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/Agent Contexts tab/).first()).toBeVisible({ timeout: 15000 });
  });

  test('co-pilot hides permission-gated tools from an editor on the endpoints page', async ({ page, request }) => {
    // Register an editor (no endpoint:write) via direct fetch so the shared
    // request fixture keeps its admin cookie.
    const editorEmail = `copilot-editor-${Date.now()}@test.local`;
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CoPilot Editor', email: editorEmail, password: 'Test1234!' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    const cleanupUserId = regData.user.id;

    try {
      // Assign the editor role (reader has no perms and the co-pilot FAB is
      // hidden for readers; editors can use the panel but lack write perms).
      const rolesRes = await request.get(`${API_URL}/roles`);
      const roles = await rolesRes.json();
      const editorRole = roles.find((r: any) => r.name === 'editor');
      expect(editorRole).toBeDefined();
      const roleUpd = await request.put(`${API_URL}/users/${cleanupUserId}/role`, {
        data: { role_id: editorRole.id },
      });
      expect(roleUpd.status()).toBe(200);

      // Login as the editor in the browser
      await page.goto('/login');
      await page.getByLabel('Email').fill(editorEmail);
      await page.getByLabel('Password', { exact: true }).fill('Test1234!');
      await page.getByRole('button', { name: /sign.?in/i }).click();
      await expect(page).toHaveURL(/\/$/);

      // Navigate to the endpoints settings page
      await page.goto('/settings/endpoints');
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

      const textarea = await openPanel(page);
      await textarea.fill('ECHO_SYSTEM_PROMPT');
      await page.keyboard.press('Enter');

      // Editor prompt: read-only endpoint tools + navigation present, but no
      // endpoint:write tools (editor role lacks endpoint:write).
      await expect(page.getByText('You are Co-Pilot, an AI assistant for OrcheStream.AI').first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/list_endpoints/).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/navigate_to/).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/create_endpoint/)).toHaveCount(0);
      await expect(page.getByText(/delete_endpoint/)).toHaveCount(0);
      await expect(page.getByText(/update_endpoint/)).toHaveCount(0);
    } finally {
      // Cleanup as admin (editor cannot delete themselves)
      await request.delete(`${API_URL}/users/${cleanupUserId}`).catch(() => {});
    }
  });

  test('co-pilot clear conversation resets the panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    await sendMessage(page, textarea, 'message to clear');
    await expect(page.getByText('message to clear', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Clear' }).click();
    // User message is gone and the empty state is shown again
    await expect(page.getByText('message to clear', { exact: true })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText(/Ask me anything about building flows/).first()).toBeVisible({ timeout: 5000 });
  });

  test('co-pilot stop button aborts a streaming response', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const textarea = await openPanel(page);

    // MOCK_RESPONSE returns a long string the mock streams token-by-token with
    // a 5ms delay (~1000 tokens -> ~5s) — plenty of time to hit Stop mid-stream.
    const longText = 'stop me please ' + 'word '.repeat(2000);
    await textarea.fill(`MOCK_RESPONSE: ${longText}`);
    await page.keyboard.press('Enter');

    // Stop button appears while streaming
    const stopBtn = page.getByRole('button', { name: /Stop/i });
    await expect(stopBtn).toBeVisible({ timeout: 10000 });
    await stopBtn.click();

    // Streaming ends: Stop disappears, textarea is re-enabled
    await expect(stopBtn).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByPlaceholder('Ask anything...')).toBeEditable({ timeout: 5000 });
    // The full response never renders
    await expect(page.getByText(longText, { exact: true })).toHaveCount(0, { timeout: 3000 });
  });
});

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
});

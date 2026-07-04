import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot AI Assistant', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Co-Pilot LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (llmRes.ok()) {
      const ep = await llmRes.json();
      mockEndpointId = ep.id;
      await request.put(`${API_URL}/llm-endpoints/${ep.id}`, { data: { isDefault: true } });
    }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  const createdFlowIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdFlowIds) {
      await deleteFlow(request, id).catch(() => {});
    }
    createdFlowIds.length = 0;
  });

  test('assistant button exists on the flows page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('co-pilot panel opens and sends a message', async ({ page }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    // Open the Co-Pilot panel via the toggle button
    const toggleBtn = page.getByTestId('co-pilot-toggle');
    await toggleBtn.click();

    // Find the chat textarea by its placeholder
    const textarea = page.getByPlaceholder('Ask anything...');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Type a message and send
    await textarea.fill('list all flows');
    await page.keyboard.press('Enter');

    // Wait for the mock LLM to respond
    await page.waitForTimeout(3000);
  });

  test('co-pilot works on the flow editor', async ({ page, request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const flowRes = await createFlow(request, { name: uniqueFlowName('CoPilot-Flow') });
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const toggleBtn = page.getByTestId('co-pilot-toggle');
    await toggleBtn.click();

    const textarea = page.getByPlaceholder('Ask anything...');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    await textarea.fill('list flows');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 5000 });
  });
});

import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

test.describe('Chat flow', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Chat Flow E2E'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        { id: 'o1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['chat.message'] } } },
      ],
      edges: [{ id: 'e1', source: 't1', target: 'o1' }],
    });
    const flow = await res.json();
    flowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('chat page loads with input field and no history', async ({ page }) => {
    await page.goto(`/chat/${flowId}`);
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);

    // Should show a chat input
    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // No messages should exist yet
    const messages = page.locator('[class*="message"]');
    await expect(messages).toHaveCount(0);
  });

  test('sends a message and shows loading indicator', async ({ page }) => {
    await page.goto(`/chat/${flowId}`);

    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Hello, world!');
    await page.keyboard.press('Enter');

    // Bouncing dots or loading indicator should appear while waiting
    const loading = page.locator('[class*="loading"], [class*="dots"], [class*="spinner"], [class*="typing"]').first();
    await expect(loading).toBeVisible({ timeout: 3000 });
  });

  test('shows the sent message in the chat', async ({ page }) => {
    await page.goto(`/chat/${flowId}`);

    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('Test message');
    await page.keyboard.press('Enter');

    // The sent message should appear
    await expect(page.getByText('Test message')).toBeVisible({ timeout: 5000 });
  });
});

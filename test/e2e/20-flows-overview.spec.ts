import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

function flowCard(page: any, name: string) {
  return page.locator('div.rounded-lg.border.p-4').filter({ has: page.getByText(name, { exact: true }) });
}

test.describe('Flows overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows flows list heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Flows').first()).toBeVisible();
  });

  test('shows new flow button', async ({ page }) => {
    await page.goto('/');
    const createBtn = page.getByText('New Flow').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('new flow button navigates to editor', async ({ page }) => {
    await page.goto('/');
    await page.getByText('New Flow').first().click();
    await expect(page).toHaveURL(/\/flows\/[^/]+\/edit/);
  });

  test('created flow appears in the list', async ({ page, request }) => {
    const res = await createFlow(request, { name: uniqueFlowName('Test Flow E2E'), description: 'E2E test flow' });
    const flow = await res.json();
    await page.goto('/');
    await expect(page.getByText('Test Flow E2E')).toBeVisible();
    // Cleanup
    await deleteFlow(request, flow.id);
  });

  test('search filters the list', async ({ page, request }) => {
    const res1 = await createFlow(request, { name: uniqueFlowName('Alpha Flow') });
    const res2 = await createFlow(request, { name: uniqueFlowName('Beta Flow') });
    const flow1 = await res1.json();
    const flow2 = await res2.json();

    await page.goto('/');
    await expect(page.getByText('Alpha Flow')).toBeVisible();
    await expect(page.getByText('Beta Flow')).toBeVisible();

    // Type in search
    await page.getByLabel('Search').fill('Alpha');
    await expect(page.getByText('Alpha Flow')).toBeVisible();
    await expect(page.getByText('Beta Flow')).not.toBeVisible();

    await deleteFlow(request, flow1.id);
    await deleteFlow(request, flow2.id);
  });

  test('search with no matches shows empty state message', async ({ page, request }) => {
    const res = await createFlow(request, { name: uniqueFlowName('Present Flow') });
    const flow = await res.json();
    await page.goto('/');
    await expect(page.getByText('Present Flow')).toBeVisible();

    await page.getByLabel('Search').fill(uniqueFlowName('zzzz-no-such-flow'));
    await expect(page.getByText('No flows match your search')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Present Flow')).not.toBeVisible();

    await deleteFlow(request, flow.id);
  });

  test('delete flow removes it from list', async ({ page, request }) => {
    const res = await createFlow(request, { name: uniqueFlowName('Delete Me') });
    const flow = await res.json();
    await page.goto('/');

    const card = flowCard(page, flow.name);
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.getByRole('button', { name: 'Delete' }).click();

    // Confirm dialog must appear before deletion happens
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Delete flow?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(flow.name, { exact: true })).not.toBeVisible({ timeout: 5000 });
    // Flow must be gone from the API as well
    const gone = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(gone.status()).toBe(404);
  });

  test('shows correct trigger type badge for manual trigger', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Manual Trigger Flow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: {} } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto('/');

    const card = flowCard(page, flow.name);
    await expect(card).toBeVisible({ timeout: 10000 });
    // Manual trigger badge = play_arrow icon, and no webhook badge in this card
    await expect(card.locator('.material-symbols-outlined').first()).toHaveText('play_arrow');
    await expect(card.locator('.material-symbols-outlined', { hasText: 'webhook' })).toHaveCount(0);

    await deleteFlow(request, flow.id);
  });

  test('webhook-trigger flow shows webhook badge in the list', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Webhook Flow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'webhook' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto('/');

    const card = flowCard(page, flow.name);
    await expect(card).toBeVisible({ timeout: 10000 });
    // Badge icon is the first material symbol in the card (webhook)
    await expect(card.locator('.material-symbols-outlined').first()).toHaveText('webhook');
    // Webhook flows also expose an API docs link
    await expect(card.getByRole('link', { name: 'API' })).toBeVisible();

    await deleteFlow(request, flow.id);
  });

  test('chat-trigger flow shows chat badge in the list', async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Chat Flow'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'chat' } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    await page.goto('/');

    const card = flowCard(page, flow.name);
    await expect(card).toBeVisible({ timeout: 10000 });
    // Badge icon is the first material symbol in the card (chat)
    await expect(card.locator('.material-symbols-outlined').first()).toHaveText('chat');
    // Chat flows expose an "Open Chat" link
    await expect(card.getByRole('link', { name: 'Open Chat' })).toBeVisible();

    await deleteFlow(request, flow.id);
  });

  test('flow name click navigates to the editor', async ({ page, request }) => {
    const res = await createFlow(request, { name: uniqueFlowName('Navigate Me') });
    const flow = await res.json();
    await page.goto('/');

    await page.getByRole('link', { name: 'Navigate Me' }).click();
    await expect(page).toHaveURL(new RegExp(`/flows/${flow.id}/edit`));

    await deleteFlow(request, flow.id);
  });
});

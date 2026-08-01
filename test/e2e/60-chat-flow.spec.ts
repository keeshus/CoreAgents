import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const MOCK_LLM_URL = 'http://mock-llm-e2e:3002/v1';

test.describe('Chat flow', () => {
  let mockEndpointId: string | null = null;
  let flowId: string;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E Chat Flow LLM',
        providerType: 'openai',
        baseUrl: MOCK_LLM_URL,
        apiKey: 'mock-key',
        defaultModel: 'mock-gpt-4',
        models: ['mock-gpt-4'],
      },
    });
    if (llmRes.ok()) {
      const ep = await llmRes.json();
      mockEndpointId = ep.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) {
      await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`).catch(() => {});
    }
  });

  test.beforeEach(async ({ request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('Chat Flow E2E'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Chat', type: 'trigger', config: { triggerType: 'chat' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'Assistant',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: 'MOCK_RESPONSE: "Hello from chat!"',
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['assistant.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    flowId = flow.id;
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  const sessionsHeading = (page: any) => page.getByRole("heading", { name: "Chat Sessions" });

  /** Start a new chat session through the UI and return the session URL. */
  async function startNewChat(page: any): Promise<void> {
    await page.goto(`/chat/${flowId}`);
    await expect(sessionsHeading(page)).toBeVisible({ timeout: 15000 });
    await page.getByText('New Chat').click();
    await expect(page).toHaveURL(new RegExp(`/chat/${flowId}/[^/]+`));
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: 10000 });
  }

  /** Send a message in an open chat session and wait for the mock response. */
  async function sendMessageAndWait(page: any, message: string): Promise<void> {
    await page.getByLabel('Message').fill(message);
    await page.keyboard.press('Enter');
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect.poll(
      () => page.getByText('Hello from chat!').count(),
      { timeout: 20000, message: 'assistant response should render' },
    ).toBeGreaterThan(0);
  }

  test('chat page loads and allows starting a new chat', async ({ page }) => {
    await page.goto(`/chat/${flowId}`);
    await expect(sessionsHeading(page)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('New Chat')).toBeVisible({ timeout: 5000 });
    await page.getByText('New Chat').click();
    await expect(page).toHaveURL(/\/chat\/[^/]+\/[^/]+/);
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Start a conversation with this agent')).toBeVisible();
  });

  test('sends a message and receives the streamed assistant response', async ({ page }) => {
    await startNewChat(page);
    const message = 'What is 2+2?';
    await sendMessageAndWait(page, message);

    // User message appears in its own bubble (right-aligned primary bubble)
    const userBubble = page.locator('.flex.flex-row-reverse').filter({ hasText: message });
    await expect(userBubble).toBeVisible();

    // Assistant response renders in the conversation
    await expect(page.getByText('Hello from chat!').first()).toBeVisible({ timeout: 10000 });
    // Input returns to an editable state after the stream finishes
    await expect(page.getByLabel('Message')).toBeEnabled({ timeout: 15000 });
  });

  test('session appears in the session list after sending', async ({ page }) => {
    const message = 'List sessions please';
    await startNewChat(page);
    await sendMessageAndWait(page, message);

    // Navigate back to the session list via the Back link
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${flowId}$`));
    await expect(sessionsHeading(page)).toBeVisible({ timeout: 15000 });

    // The session entry is titled with the first message
    await expect(page.getByText(message)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href^="/chat/"][href*="' + flowId + '"]').filter({ hasText: message })).toBeVisible();
  });

  test('reload restores the conversation history from the session', async ({ page }) => {
    const message = 'Remember me';
    await startNewChat(page);
    await sendMessageAndWait(page, message);

    await page.reload();
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: 10000 });
    // Prior messages render again after reload
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Hello from chat!').first()).toBeVisible({ timeout: 10000 });
    // The empty-state hint is gone because history loaded
    await expect(page.getByText('Start a conversation with this agent')).toHaveCount(0);
  });

  test('switches between multiple chat sessions', async ({ page }) => {
    // Session A
    await startNewChat(page);
    await sendMessageAndWait(page, 'First question');

    // Session B
    await page.getByRole('link', { name: 'Back' }).click();
    await page.getByText('New Chat').click();
    await expect(page).toHaveURL(new RegExp(`/chat/${flowId}/[^/]+`));
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: 10000 });
    await sendMessageAndWait(page, 'Second question');

    // Back to list, open session A again
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(sessionsHeading(page)).toBeVisible({ timeout: 15000 });
    await page.getByText('First question').click();
    await expect(page).toHaveURL(new RegExp(`/chat/${flowId}/[^/]+`));
    await expect(page.getByText('First question', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Second question')).toHaveCount(0);
    await expect(page.getByText('Hello from chat!').first()).toBeVisible({ timeout: 10000 });

    // Open session B again
    await page.getByRole('link', { name: 'Back' }).click();
    await page.getByText('Second question').click();
    await expect(page.getByText('Second question', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('First question')).toHaveCount(0);
  });

  test('deletes a session from the list', async ({ page, request }) => {
    const message = 'Delete me later';
    await startNewChat(page);
    await sendMessageAndWait(page, message);

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(sessionsHeading(page)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(message)).toBeVisible({ timeout: 10000 });

    // Delete via the row button + confirm dialog
    const row = page.locator('a[href^="/chat/"][href*="' + flowId + '"]').filter({ hasText: message });
    await row.locator('xpath=following-sibling::button').filter({ hasText: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(message)).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText('No conversations yet')).toBeVisible();

    // Backend agrees: no sessions remain for this flow
    const listRes = await request.get(`${API_URL}/chat/${flowId}/sessions`);
    expect(listRes.ok()).toBe(true);
    const sessions = await listRes.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(0);
  });
});

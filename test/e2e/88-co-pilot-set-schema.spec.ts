import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-Pilot set_node_output_schema tool', () => {
  let mockEndpointId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E Set Schema LLM',
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

  /** Open the Co-Pilot panel from the floating FAB. The FAB is covered by an
   *  open node config modal — ALWAYS open the panel first, then open the node
   *  config (the panel stacks above the modal). */
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

  /** Invoke a tool through the mock LLM (MOCK_TOOL_CALL directive) and wait for
   *  its tool bubble. `args` is the already-stringified JSON tool arguments. */
  async function sendToolCall(page: any, textarea: any, toolName: string, args: string) {
    await textarea.fill(`MOCK_TOOL_CALL: ${toolName} ${args}`);
    await page.keyboard.press('Enter');
    await expect(page.getByText(new RegExp(`🔧 ${toolName}`)).first()).toBeVisible({ timeout: 15000 });
  }

  /** Click the editor Save button, retrying until the change lands in the API
   *  (the Save button can silently no-op when its async closure goes stale). */
  async function saveFlowViaRetry(page: any, request: any, flowId: string, isSaved: (flow: any) => boolean) {
    await expect.poll(async () => {
      const btn = page.getByRole('button', { name: 'Save' });
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
      const res = await request.get(`${API_URL}/flows/${flowId}`);
      if (!res.ok()) return false;
      return isSaved(await res.json());
    }, { timeout: 20000, message: 'Save should persist the schema to the API' }).toBe(true);
  }

  test('set_node_output_schema configures an LLM Agent node and switches Response Format to JSON', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CopilotSchemaLlm'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 100 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'a1', type: 'llm-agent', position: { x: 350, y: 100 }, data: { label: 'Assistant', type: 'llm-agent', config: { endpointId: '', model: '', systemPrompt: 'Analyze', responseFormat: 'text' } } },
        { id: 'o1', type: 'output', position: { x: 650, y: 100 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
        { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Panel first, then the node config — the panel stacks above the modal
    const panelInput = await openPanel(page);
    await page.locator('.react-flow__node').nth(1).click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Response Format is Plain Text, so the schema builder is NOT rendered yet
    await expect(page.locator('[data-field-label="Response Format"]')).toContainText('Plain Text', { timeout: 5000 });
    await expect(modal.getByTestId('json-schema-builder')).toHaveCount(0);

    // The schema is a JSON string arg — inner quotes are escaped
    await sendToolCall(page, panelInput, 'set_node_output_schema', JSON.stringify({ schema: '{"summary":"string","score":"number"}' }));

    await expect(page.getByText(/Structured output schema set/).first()).toBeVisible({ timeout: 5000 });

    // The builder appeared (Response Format was switched to JSON) in raw mode
    // with the normalized schema, and the select now shows JSON
    const rawInput = modal.getByTestId('json-schema-raw-input');
    await expect(rawInput).toHaveValue(/"summary"/, { timeout: 5000 });
    await expect(rawInput).toHaveValue(/"score"/, { timeout: 5000 });
    await expect(page.locator('[data-field-label="Response Format"]')).toContainText('JSON', { timeout: 5000 });

    // Close the modal, then persist through the editor Save button
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0, { timeout: 5000 });
    await saveFlowViaRetry(page, request, flow.id, (f) => {
      const agent = f.nodes.find((n: any) => n.data?.type === 'llm-agent');
      return agent?.data?.config?.responseFormat === 'json_object' &&
        typeof agent?.data?.config?.outputSchema === 'string' &&
        agent.data.config.outputSchema.includes('"summary"');
    });

    // Server-side persistence: responseFormat switched and outputSchema stored
    const savedRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(savedRes.ok()).toBe(true);
    const saved = await savedRes.json();
    const agent = saved.nodes.find((n: any) => n.data?.type === 'llm-agent');
    expect(agent.data.config.responseFormat).toBe('json_object');
    expect(agent.data.config.outputSchema).toContain('"summary"');
    expect(agent.data.config.outputSchema).toContain('"score"');
  });

  test('set_node_output_schema configures a webhook trigger input schema', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CopilotSchemaWebhook'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 100 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '' } } },
        { id: 'o1', type: 'output', position: { x: 350, y: 100 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const panelInput = await openPanel(page);
    await page.locator('.react-flow__node').nth(0).click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    // Webhook triggers expose the schema builder as "Expected Input Schema"
    await expect(modal.getByText('Expected Input Schema')).toBeVisible({ timeout: 5000 });

    await sendToolCall(page, panelInput, 'set_node_output_schema', JSON.stringify({ schema: '{"city":"string"}' }));
    await expect(page.getByText(/Structured output schema set/).first()).toBeVisible({ timeout: 5000 });
    await expect(modal.getByTestId('json-schema-raw-input')).toHaveValue(/"city"/, { timeout: 5000 });

    // Close the modal, persist, reload, and verify the inputSchema on the server
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0, { timeout: 5000 });
    await saveFlowViaRetry(page, request, flow.id, (f) => {
      const trigger = f.nodes.find((n: any) => n.data?.type === 'trigger');
      return typeof trigger?.data?.config?.inputSchema === 'string' &&
        trigger.data.config.inputSchema.includes('"city"');
    });
    await page.reload();
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const savedRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(savedRes.ok()).toBe(true);
    const saved = await savedRes.json();
    const trigger = saved.nodes.find((n: any) => n.data?.type === 'trigger');
    const inputSchema = JSON.parse(trigger.data.config.inputSchema);
    expect(inputSchema.type).toBe('object');
    expect(inputSchema.properties.city.type).toBe('string');
  });

  test('set_node_output_schema rejects invalid JSON', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CopilotSchemaInvalid'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 100 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 350, y: 100 }, data: { label: 'Processor', type: 'code', config: { code: 'return input;' } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' }],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const panelInput = await openPanel(page);
    await page.locator('.react-flow__node').nth(1).click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    // Code nodes always render the builder as "Output Structure (documentation)"
    await expect(modal.getByText('Output Structure (documentation)')).toBeVisible({ timeout: 5000 });

    await sendToolCall(page, panelInput, 'set_node_output_schema', JSON.stringify({ schema: 'not json {' }));
    await expect(page.getByText(/Invalid JSON/).first()).toBeVisible({ timeout: 5000 });

    // The schema was rejected — the builder stays in builder mode with no
    // properties and was never switched to raw mode
    await expect(modal.getByTestId('json-schema-raw-input')).toHaveCount(0, { timeout: 5000 });
    await expect(modal.getByText(/No properties yet/)).toBeVisible({ timeout: 5000 });
  });

  test('set_node_output_schema requires an open node config', async ({ page, request }) => {
    const flowRes = await createFlow(request, {
      name: uniqueFlowName('CopilotSchemaNoModal'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 50, y: 100 }, data: { label: 'Start', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'c1', type: 'code', position: { x: 350, y: 100 }, data: { label: 'Processor', type: 'code', config: { code: 'return input;' } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' }],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    createdFlowIds.push(flow.id);

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    const panelInput = await openPanel(page);

    // Ensure no node config modal is open when sending the message — only the
    // co-pilot panel (Escape is harmless here; it only closes Radix dialogs)
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-config-modal')).toHaveCount(0, { timeout: 5000 });

    await sendToolCall(page, panelInput, 'set_node_output_schema', JSON.stringify({ schema: '{"a":"string"}' }));
    await expect(page.getByText(/No node config panel is open/).first()).toBeVisible({ timeout: 10000 });
  });
});

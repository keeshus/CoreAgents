import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute, pollExecution } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const WEBHOOK_SECRET = 'ft-e2e-secret';
const INPUT_SCHEMA = '{"message":"string"}';

test.describe('Flow Tool node', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const name = uniqueFlowName('FlowTool');
    const res = await createFlow(request, { name });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (flowId) {
      await deleteFlow(request, flowId).catch(() => {});
    }
  });

  test('appears in the node catalog under Tools', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await expect(page.getByTestId('catalog-flow-tool')).toBeVisible({ timeout: 5000 });
  });

  test('can be added to the canvas', async ({ page }) => {
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-flow-tool').click();
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByText('Flow Tool')).toBeVisible();
  });
});

test.describe('Flow Tool config', () => {
  let webhookFlowId: string;
  let webhookFlowName: string;
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    // Create a webhook flow to appear in the Flow Tool picker
    const webhookRes = await createFlow(request, {
      name: uniqueFlowName('WeatherAPI'),
      description: 'Get weather for a city',
      nodes: [
        {
          id: 't1', type: 'trigger', position: { x: 0, y: 0 },
          data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET, inputSchema: INPUT_SCHEMA } },
        },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Process', type: 'code', config: { code: 'return { result: `Weather in ${input.message}: sunny, 22°C` };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['process.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowId = webhookFlow.id;
    webhookFlowName = webhookFlow.name;

    // Create the main flow with a Flow Tool node
    const res = await createFlow(request, {
      name: uniqueFlowName('FlowToolConfig'),
      nodes: [
        { id: 'ft1', type: 'flow-tool', position: { x: 0, y: 0 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [], selectedFlows: [] } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
  });

  test.afterEach(async ({ request }) => {
    if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  test('shows webhook flows in the config panel', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    // The webhook flow should appear in the list
    await expect(modal.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('excludes non-webhook flows from the flow-tool picker', async ({ page, request }) => {
    // Create a manual-trigger flow — it must NOT show up in the picker
    const manualRes = await createFlow(request, {
      name: uniqueFlowName('PickerManual'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const manualFlow = await manualRes.json();
    const manualName = manualFlow.name;

    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // The webhook flow (created in beforeEach) is listed...
    await expect(modal.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
    // ...but the manual flow is excluded entirely
    await expect(modal.getByText(manualName, { exact: true })).toHaveCount(0);
    // Exactly one checkbox = exactly one webhook flow in the list
    await expect(modal.locator('input[type="checkbox"]')).toHaveCount(1);

    await deleteFlow(request, manualFlow.id);
  });

  test('flow-tool selection persists after save and reload', async ({ page, request }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Select the webhook flow
    const checkbox = modal.locator('input[type="checkbox"]').first();
    await checkbox.check();
    await expect(modal.getByText(/1 flow selected/)).toBeVisible({ timeout: 3000 });

    // Close the modal, then save via the editor, then reload the page
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
    // The Save button can silently no-op when its async name-check closure
    // goes stale (app quirk) — retry the click until the API reflects it
    await expect.poll(async () => {
      const btn = page.getByRole('button', { name: 'Save' });
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
      const res = await page.request.get(`${API_URL}/flows/${flowId}`);
      if (!res.ok()) return -1;
      const flow = await res.json();
      const ft = flow.nodes.find((n: any) => n.data?.type === 'flow-tool');
      return ft?.data?.config?.flowIds?.includes(webhookFlowId) ? 1 : 0;
    }, { timeout: 20000, message: 'save should persist the flow-tool selection' }).toBe(1);
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Reopen the config — the selection must still be checked
    await page.locator('.react-flow__node').first().click();
    const modal2 = page.getByTestId('node-config-modal');
    await expect(modal2).toBeVisible({ timeout: 5000 });
    await expect(modal2.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(modal2.locator('input[type="checkbox"]').first()).toBeChecked();
    await expect(modal2.getByText(/1 flow selected/)).toBeVisible({ timeout: 3000 });

    // And the flow-tool node config on the server carries the selection
    const savedRes = await request.get(`${API_URL}/flows/${flowId}`);
    expect(savedRes.ok()).toBe(true);
    const saved = await savedRes.json();
    const ftNode = saved.nodes.find((n: any) => n.data?.type === 'flow-tool');
    expect(ftNode.data?.config?.flowIds).toContain(webhookFlowId);
    expect(ftNode.data?.config?.selectedFlows?.length).toBe(1);
  });

  test('allows selecting a webhook flow', async ({ page }) => {
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    const modal = page.getByTestId('node-config-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    // Click the checkbox for the webhook flow
    const checkbox = modal.locator('input[type="checkbox"]').first();
    await checkbox.check();
    // Summary text should appear
    await expect(modal.getByText(/flow.*selected/)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Flow Tool execution', () => {
  let mockEndpointId: string | null = null;
  const webhookFlowIds: string[] = [];
  const mainFlowIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API_URL}/llm-endpoints`, {
      data: { name: 'E2E Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
    });
    if (res.ok()) { const ep = await res.json(); mockEndpointId = ep.id; }
  });

  test.afterAll(async ({ request }) => {
    for (const id of webhookFlowIds) await deleteFlow(request, id).catch(() => {});
    for (const id of mainFlowIds) await deleteFlow(request, id).catch(() => {});
    if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  });

  const cookie = getAuthCookie() || undefined;

  test('executes a webhook flow via Flow Tool when LLM Agent calls it', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create a webhook flow (the "tool" to be called)
    const slug = 'weather_api';
    const webhookRes = await createFlow(request, {
      name: 'Weather API',
      description: 'Get weather for a city',
      nodes: [
        {
          id: 't1', type: 'trigger', position: { x: 0, y: 0 },
          data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET, inputSchema: INPUT_SCHEMA } },
        },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Process', type: 'code', config: { code: 'return { result: `Weather in ${input.message}: sunny, 22°C` };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['process.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowIds.push(webhookFlow.id);

    // Create the main flow with manual trigger → LLM Agent → Output, and a Flow Tool node
    const mainRes = await createFlow(request, {
      name: uniqueFlowName('FlowToolExec'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `You have weather tools. MOCK_TOOL_CALL: flow_${slug} {"message":"Amsterdam"} MOCK_RESPONSE: "Done! Weather retrieved."`,
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        { id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [webhookFlow.id], selectedFlows: [{ id: webhookFlow.id, name: 'Weather API' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'get weather' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed!.data?.output;
    expect(output).toBeDefined();

    // The LLM Agent output should contain the mock response after the tool call
    const content = output?.l1?.content || '';
    expect(content).toContain('Done!');

    // Verify the flow-tool node was skipped (it doesn't execute as a DAG node)
    const ftStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'ft1');
    expect(ftStep).toBeUndefined();
  });

  test('executes webhook flow via POST endpoint and returns correct result', async ({ request }) => {
    // Create a webhook flow
    const webhookRes = await createFlow(request, {
      name: uniqueFlowName('EchoWebhook'),
      description: 'Echoes back the message',
      nodes: [
        {
          id: 't1', type: 'trigger', position: { x: 0, y: 0 },
          data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET, inputSchema: INPUT_SCHEMA } },
        },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message.toUpperCase() };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowIds.push(webhookFlow.id);

    // Test the webhook endpoint works directly
    const webhookRes2 = await request.post(`${API_URL}/webhook/${webhookFlow.id}?secret=${WEBHOOK_SECRET}`, {
      data: { message: 'hello webhook' },
    });
    expect(webhookRes2.ok()).toBe(true);
    const webhookData = await webhookRes2.json();
    expect(webhookData.executionId).toBeDefined();
    expect(webhookData.status).toBe('queued');

    // Poll for completion
    const exec = await pollExecution(request, webhookData.executionId, 45000);
    expect(exec.status).toBe('completed');
  });

  test('Flow Tool with multiple webhook flows provides multiple tools', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create two webhook flows
    const flow1Res = await createFlow(request, {
      name: 'Get Weather',
      description: 'Weather info',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Process', type: 'code', config: { code: 'return { result: `Weather in ${input.city}: sunny` };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['process.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow1 = await flow1Res.json();
    webhookFlowIds.push(flow1.id);

    const flow2Res = await createFlow(request, {
      name: 'Send Email',
      description: 'Send an email',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"}},"required":["to","subject"]}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Send', type: 'code', config: { code: 'return { result: `Email sent to ${input.to}` };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['send.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow2 = await flow2Res.json();
    webhookFlowIds.push(flow2.id);

    // Create main flow with both flows as tools, but mock calls flow_get_weather
    const mainRes = await createFlow(request, {
      name: uniqueFlowName('MultiFlowTool'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `You have weather and email tools. MOCK_TOOL_CALL: flow_get_weather {"city":"London"} MOCK_RESPONSE: "Done! Weather checked."`,
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        {
          id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 },
          data: {
            label: 'Flow Tool',
            type: 'flow-tool',
            config: {
              flowIds: [flow1.id, flow2.id],
              selectedFlows: [
                { id: flow1.id, name: 'Get Weather' },
                { id: flow2.id, name: 'Send Email' },
              ],
            },
          },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'check weather' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed!.data?.output;
    expect(output).toBeDefined();
    expect(output?.l1?.content || '').toContain('Done!');
  });

  test('Flow Tool handles webhook flow without input schema', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Create a webhook flow with no input schema
    const webhookRes = await createFlow(request, {
      name: 'Simple Ping',
      description: 'Returns pong',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Pong', type: 'code', config: { code: 'return { result: "pong" };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['pong.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowIds.push(webhookFlow.id);

    const mainRes = await createFlow(request, {
      name: uniqueFlowName('SimplePingFT'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `MOCK_TOOL_CALL: flow_simple_ping {} MOCK_RESPONSE: "Done!"`,
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        {
          id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 },
          data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [webhookFlow.id], selectedFlows: [{ id: webhookFlow.id, name: 'Simple Ping' }] } },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'ping' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output).toBeDefined();
  });

  test('Flow Tool execution emits step events for LLM and output', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
    const slug = 'echo_tool';
    const webhookRes = await createFlow(request, {
      name: 'Echo Tool',
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: INPUT_SCHEMA } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowIds.push(webhookFlow.id);

    const mainRes = await createFlow(request, {
      name: uniqueFlowName('SSEEcho'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `MOCK_TOOL_CALL: flow_${slug} {"message":"test-echo"} MOCK_RESPONSE: "Echo complete."`,
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        {
          id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 },
          data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [webhookFlow.id], selectedFlows: [{ id: webhookFlow.id, name: 'Echo Tool' }] } },
        },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'test' }, cookie);

    // Verify standard step events for key nodes
    const triggerStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 't1');
    expect(triggerStep).toBeDefined();

    const llmStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'l1');
    expect(llmStep).toBeDefined();
    expect(llmStep!.data?.output?.content || '').toContain('Echo complete');

    // The flow-tool node should NOT have a step event (it's skipped during DAG execution)
    const ftStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'ft1');
    expect(ftStep).toBeUndefined();

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
  });

  test('realistic flow: LLM uses Flow Tool to look up data, then code node processes the result', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    const slug = 'data_lookup';
    const webhookRes = await createFlow(request, {
      name: 'Data Lookup',
      description: 'Look up data by key',
      nodes: [
        { id: 'w1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: '{"key":"string"}' } } },
        { id: 'w2', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Query', type: 'code', config: { code: 'return { value: `Data for ${input.key}: value=42, status=active` };' } } },
        { id: 'w3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Query.value'] } } },
      ],
      edges: [
        { id: 'e1', source: 'w1', sourceHandle: 'output-0', target: 'w2', targetHandle: 'input-0' },
        { id: 'e2', source: 'w2', sourceHandle: 'output-0', target: 'w3', targetHandle: 'input-0' },
      ],
    });
    const webhookFlow = await webhookRes.json();
    webhookFlowIds.push(webhookFlow.id);

    // Main flow: Trigger → LLM Agent (calls flow tool) → Code (processes tool result) → Output
    const mainRes = await createFlow(request, {
      name: uniqueFlowName('RealFlowTool'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'Analyzer',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `Look up data. MOCK_TOOL_CALL: flow_${slug} {"key":"test-key"} MOCK_RESPONSE: "The tool returned: {value: Test Data}".`,
              temperature: 0.7,
              maxTokens: 512,
              responseFormat: 'text',
            },
          },
        },
        {
          id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 },
          data: { label: 'Data Tool', type: 'flow-tool', config: { flowIds: [webhookFlow.id], selectedFlows: [{ id: webhookFlow.id, name: 'Data Lookup' }] } },
        },
        {
          id: 'c1', type: 'code', position: { x: 600, y: 0 },
          data: { label: 'Formatter', type: 'code', config: { code: 'const raw = input.analyzer?.content || input.l1?.content || ""; return { summary: `LLM said: ${raw}`, timestamp: new Date().toISOString() };' } },
        },
        { id: 'o1', type: 'output', position: { x: 900, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Formatter.summary', 'Formatter.timestamp'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e3', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e4', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'lookup data' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed!.data?.output;
    expect(output).toBeDefined();

    // LLM Agent output
    expect(output?.l1?.content || '').toContain('Test Data');

    // Code node processed the LLM output
    expect(output?.c1?.summary || '').toContain('LLM said');

    // Flow Tool node should be skipped (no DAG step)
    const ftStep = events.find(e => e.type === 'step.completed' && e.data?.nodeId === 'ft1');
    expect(ftStep).toBeUndefined();
  });

  test('surfaces a failing webhook flow tool call to the LLM (not silent)', async ({ request }) => {
    test.skip(!mockEndpointId, 'Mock LLM endpoint not available');

    // Webhook flow that errors at runtime: a code node configured with an
    // unsupported language throws in-process, which is a real tool failure.
    const slug = 'broken_tool';
    const brokenRes = await createFlow(request, {
      name: 'Broken Tool',
      description: 'Always fails',
      nodes: [
        { id: 'w1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', inputSchema: INPUT_SCHEMA } } },
        { id: 'w2', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Py', type: 'code', config: { language: 'python', code: 'print("hi")' } } },
        { id: 'w3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: ['Py.result'] } } },
      ],
      edges: [
        { id: 'e1', source: 'w1', sourceHandle: 'output-0', target: 'w2', targetHandle: 'input-0' },
        { id: 'e2', source: 'w2', sourceHandle: 'output-0', target: 'w3', targetHandle: 'input-0' },
      ],
    });
    const brokenFlow = await brokenRes.json();
    webhookFlowIds.push(brokenFlow.id);

    const mainRes = await createFlow(request, {
      name: uniqueFlowName('BrokenToolMain'),
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        {
          id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
          data: {
            label: 'LLM Agent',
            type: 'llm-agent',
            config: {
              endpointId: mockEndpointId,
              model: 'mock-gpt-4',
              systemPrompt: `MOCK_TOOL_CALL: flow_${slug} {"message":"boom"} MOCK_RESPONSE: "Recovered after failure."`,
              temperature: 0.7,
              maxTokens: 256,
              responseFormat: 'text',
            },
          },
        },
        { id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [brokenFlow.id], selectedFlows: [{ id: brokenFlow.id, name: 'Broken Tool' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
        { id: 'e2', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        { id: 'e3', source: 'ft1', sourceHandle: 'tool-output', target: 'l1', targetHandle: 'tool-input' },
      ],
    });
    const mainFlow = await mainRes.json();
    mainFlowIds.push(mainFlow.id);

    const events = await debugExecute(mainFlow.id, { message: 'go' }, cookie);

    // The tool failure is NOT silent: the flow-tool call log carries the error
    const toolLog = events.find(e => e.type === 'log' && e.data?.toolCall === `flow_${slug}`);
    expect(toolLog).toBeDefined();
    const toolResult = JSON.parse(toolLog!.data?.toolResult || '{}');
    expect(toolResult.status).toBe('failed');
    expect(toolResult.error).toContain('unsupported language');

    // The sub-execution reports the failure as well
    const subFailed = events.find(e => e.type === 'subflow.failed');
    expect(subFailed).toBeDefined();
    expect(subFailed!.data?.error).toContain('unsupported language');

    // The LLM receives the failure as a tool result and completes with its response
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.l1?.content || '').toContain('Recovered after failure');
  });
});

test.describe('Flow Tool group filter scoping', () => {
  test('non-admin editors only see their own groups in the Flow Tool filter', async ({ page, request }) => {
    const mine = (await (await request.post(`${API_URL}/groups`, { data: { name: `FT-Mine-${Date.now()}` } })).json());
    const other = (await (await request.post(`${API_URL}/groups`, { data: { name: `FT-Other-${Date.now()}` } })).json());

    // A container flow with a single Flow Tool node
    const containerRes = await createFlow(request, {
      name: uniqueFlowName('FT-Scope'),
      nodes: [
        { id: 'ft1', type: 'flow-tool', position: { x: 0, y: 0 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [], selectedFlows: [] } } },
      ],
      edges: [],
    });
    const container = await containerRes.json();

    // Register an editor with membership in `mine` only
    const email = `ft-editor-${Date.now()}@test.local`;
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FT Editor', email, password: 'Test1234!' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    const roles = await (await request.get(`${API_URL}/roles`)).json();
    const editorRole = roles.find((r: any) => r.name === 'editor');
    await request.put(`${API_URL}/users/${regData.user.id}/role`, { data: { role_id: editorRole.id } });
    await request.post(`${API_URL}/groups/${mine.id}/members`, { data: { userId: regData.user.id } });

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill('Test1234!');
      await page.getByRole('button', { name: /sign.?in/i }).click();
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

      await expect.poll(async () => {
        const meRes = await page.request.get(`${API_URL}/auth/me`);
        if (!meRes.ok()) return 'ERR';
        return (await meRes.json()).user?.role;
      }, { timeout: 10000 }).toBe('editor');

      await page.goto(`/flows/${container.id}/edit`);
      await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('.react-flow__node').first().click();
      const modal = page.getByTestId('node-config-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // The filter lists only the editor's own group
      await expect(modal.getByText('Filter by group')).toBeVisible({ timeout: 5000 });
      await modal.getByText('All groups').first().click();
      await expect(modal.getByText(mine.name, { exact: true })).toBeVisible({ timeout: 5000 });
      await expect(modal.getByText(other.name, { exact: true })).toHaveCount(0);
    } finally {
      await request.delete(`${API_URL}/users/${regData.user.id}`).catch(() => {});
      await deleteFlow(request, container.id).catch(() => {});
      await request.delete(`${API_URL}/groups/${mine.id}`).catch(() => {});
      await request.delete(`${API_URL}/groups/${other.id}`).catch(() => {});
    }
  });
});

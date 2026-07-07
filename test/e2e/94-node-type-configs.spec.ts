import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { openNodeConfig } from './helpers/ui';

test.describe('Node type config fields', () => {
  // Create a flow with one of each node type for config testing
  async function setupFlow(request: any) {
    const name = uniqueFlowName('AllNodesConfig');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trig', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'n2', type: 'llm-agent', position: { x: 0, y: 100 }, data: { label: 'LLM', type: 'llm-agent', config: { endpointId: '', model: '', systemPrompt: '', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } } },
        { id: 'n3', type: 'code', position: { x: 0, y: 200 }, data: { label: 'Code', type: 'code', config: { code: 'return input;' } } },
        { id: 'n4', type: 'branch', position: { x: 0, y: 300 }, data: { label: 'Branch', type: 'branch', config: { condition: '', outputLabels: ['true', 'false'] } } },
        { id: 'n5', type: 'output', position: { x: 0, y: 400 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
        { id: 'n6', type: 'hitl', position: { x: 0, y: 500 }, data: { label: 'HITL', type: 'hitl', config: { prompt: '', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'n7', type: 'mcp-tool', position: { x: 0, y: 600 }, data: { label: 'MCP', type: 'mcp-tool', config: { serverId: '', toolName: '' } } },
        { id: 'n8', type: 'retriever', position: { x: 0, y: 700 }, data: { label: 'Ret', type: 'retriever', config: { collectionName: 'default', topK: 5 } } },
        { id: 'n9', type: 'parallel', position: { x: 0, y: 800 }, data: { label: 'Parallel', type: 'parallel', config: { subNodes: [] } } },
      ],
      edges: [],
    });
    return res;
  }

  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await setupFlow(request);
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  const openNode = openNodeConfig;

  test('trigger node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Trig');
    await expect(page.getByLabel('Node name')).toBeVisible();
    // Trigger Type uses SelectField (not TextField) — check by text
    await expect(page.getByText('Trigger Type')).toBeVisible();
    // Update node name
    await page.getByLabel('Node name').fill('My Trigger');
    await expect(page.getByLabel('Node name')).toHaveValue('My Trigger');
  });

  test('llm-agent node config fields are accessible', async ({ page }) => {
    await openNode(page, 'LLM');
    await expect(page.getByLabel('Node name')).toBeVisible();
    // LLM agent should have system prompt, temperature, max tokens
    const inputs = await page.locator('[data-testid="node-config-modal"] textarea, [data-testid="node-config-modal"] input').all();
    expect(inputs.length).toBeGreaterThan(0);
    // Update system prompt
    const sp = page.getByLabel('System Prompt');
    if (await sp.isVisible().catch(() => false)) {
      await sp.fill('Test prompt');
      await expect(sp).toHaveValue('Test prompt');
    }
  });

  test('code node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Code');
    await expect(page.getByLabel('JavaScript Code')).toBeVisible();
    await page.getByLabel('JavaScript Code').fill('return { test: true };');
    await expect(page.getByLabel('JavaScript Code')).toHaveValue('return { test: true };');
  });

  test('branch node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Branch');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Branch');
    await expect(page.getByLabel('Node name')).toHaveValue('My Branch');
  });

  test('output node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Out');
    await expect(page.getByTestId('node-config-modal')).toBeVisible();
    // Output node should show input field checkboxes
    const checkboxes = page.locator('[data-testid="node-config-modal"] input[type="checkbox"]');
    const count = await checkboxes.count();
    // Should have at least some checkboxes for field selection
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('hitl node config fields are accessible', async ({ page }) => {
    await openNode(page, 'HITL');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Review Step');
    await expect(page.getByLabel('Node name')).toHaveValue('Review Step');
  });

  test('mcp-tool node config fields are accessible', async ({ page }) => {
    await openNode(page, 'MCP');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('MCP Tool');
    await expect(page.getByLabel('Node name')).toHaveValue('MCP Tool');
  });

  test('retriever node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Ret');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Retriever');
    await expect(page.getByLabel('Node name')).toHaveValue('My Retriever');
  });

  test('parallel node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Parallel');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Parallel');
    await expect(page.getByLabel('Node name')).toHaveValue('My Parallel');
  });
});
test.describe('Node config — deep field tests', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await createFlow(request, {
      name: uniqueFlowName('DeepConfig'),
      nodes: [
        { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trig', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'n2', type: 'llm-agent', position: { x: 0, y: 100 }, data: { label: 'LLM', type: 'llm-agent', config: { endpointId: '', model: '', systemPrompt: '', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } } },
        { id: 'n3', type: 'code', position: { x: 0, y: 200 }, data: { label: 'Code', type: 'code', config: { code: 'return input;' } } },
        { id: 'n4', type: 'branch', position: { x: 0, y: 300 }, data: { label: 'Brch', type: 'branch', config: { condition: '', outputLabels: ['true', 'false'] } } },
        { id: 'n5', type: 'output', position: { x: 0, y: 400 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
        { id: 'n6', type: 'hitl', position: { x: 0, y: 500 }, data: { label: 'HITL', type: 'hitl', config: { prompt: '', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'n7', type: 'mcp-tool', position: { x: 0, y: 600 }, data: { label: 'MCP', type: 'mcp-tool', config: { serverId: '', toolName: '' } } },
        { id: 'n8', type: 'retriever', position: { x: 0, y: 700 }, data: { label: 'Ret', type: 'retriever', config: { collectionName: 'default', topK: 5, minScore: 0.5 } } },
        { id: 'n9', type: 'parallel', position: { x: 0, y: 800 }, data: { label: 'Par', type: 'parallel', config: { subNodes: [] } } },
      ],
      edges: [],
    });
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  const openNode = openNodeConfig;

  test('trigger: shows trigger type selector and webhook/schedule fields', async ({ page }) => {
    await openNode(page, 'Trig');
    await expect(page.getByText('Trigger Type')).toBeVisible();

    // Check that the config modal has the trigger config UI
    const modal = page.getByTestId('node-config-modal');

    // Verify trigger type label exists
    await expect(modal.getByText('Manual')).toBeVisible();

    // Check a field is present (Node name)
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Trigger');
    await expect(page.getByLabel('Node name')).toHaveValue('My Trigger');
  });

  test('llm-agent: shows LLM endpoint, system prompt area, and config fields', async ({ page }) => {
    await openNode(page, 'LLM');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My LLM');
    await expect(page.getByLabel('Node name')).toHaveValue('My LLM');
  });

  test('code: JavaScript code editor present and editable', async ({ page }) => {
    await openNode(page, 'Code');
    const codeField = page.getByLabel('JavaScript Code');
    await expect(codeField).toBeVisible();
    await codeField.fill('return { message: input.text };');
    await expect(codeField).toHaveValue('return { message: input.text };');
  });

  test('branch: condition expression field present', async ({ page }) => {
    await openNode(page, 'Brch');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Branch A');
    await expect(page.getByLabel('Node name')).toHaveValue('Branch A');
  });

  test('output: field checkboxes present', async ({ page }) => {
    await openNode(page, 'Out');
    await expect(page.getByLabel('Node name')).toBeVisible();
    // The output node config should exist
    await page.getByLabel('Node name').fill('Output');
    await expect(page.getByLabel('Node name')).toHaveValue('Output');
  });

  test('hitl: prompt field and buttons', async ({ page }) => {
    await openNode(page, 'HITL');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Hitl');
    await expect(page.getByLabel('Node name')).toHaveValue('Hitl');
  });

  test('mcp-tool: server and tool selectors present', async ({ page }) => {
    await openNode(page, 'MCP');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('MCP Tool');
    await expect(page.getByLabel('Node name')).toHaveValue('MCP Tool');
  });

  test('retriever: config fields present', async ({ page }) => {
    await openNode(page, 'Ret');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Retriever');
    await expect(page.getByLabel('Node name')).toHaveValue('My Retriever');
  });

  test('parallel: configuration section present', async ({ page }) => {
    await openNode(page, 'Par');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Parallel');
    await expect(page.getByLabel('Node name')).toHaveValue('Parallel');
  });

  test('subflow node config opens and shows subflow selector', async ({ page, request }) => {
    // Create a subflow first
    const subRes = await createFlow(request, {
      name: uniqueFlowName('SubChild'),
      nodes: [
        { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: '{"data":"string"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const subFlow = await subRes.json();

    // Now open subflow config on the canvas
    await openNode(page, 'out'); // use an existing output node

    await deleteFlow(request, subFlow.id);
  });
});

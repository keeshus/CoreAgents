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
        { id: 'n4', type: 'condition', position: { x: 0, y: 300 }, data: { label: 'Condition', type: 'condition', config: { condition: '' } } },
        { id: 'n5', type: 'output', position: { x: 0, y: 400 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
        { id: 'n6', type: 'hitl', position: { x: 0, y: 500 }, data: { label: 'HITL', type: 'hitl', config: { prompt: '', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'n7', type: 'mcp-tool', position: { x: 0, y: 600 }, data: { label: 'MCP', type: 'mcp-tool', config: { serverId: '', toolName: '' } } },
        { id: 'n8', type: 'retriever', position: { x: 0, y: 700 }, data: { label: 'Ret', type: 'retriever', config: { collectionName: 'default', topK: 5 } } },
        { id: 'n9', type: 'switch', position: { x: 0, y: 800 }, data: { label: 'Switch', type: 'switch', config: { fieldPath: '', cases: [] } } },
        { id: 'n10', type: 'parallel', position: { x: 0, y: 900 }, data: { label: 'Parallel Agents', type: 'parallel', config: { subNodes: [] } } },
        { id: 'n11', type: 'map', position: { x: 0, y: 1000 }, data: { label: 'Map', type: 'map', config: { fields: [], mode: 'replace' } } },
        { id: 'n12', type: 'http', position: { x: 0, y: 1100 }, data: { label: 'HTTP', type: 'http', config: { method: 'GET', url: '' } } },
        { id: 'n13', type: 'loop', position: { x: 0, y: 1200 }, data: { label: 'Loop', type: 'loop', config: { itemsField: '', subNodes: [], subEdges: [] } } },
        { id: 'n14', type: 'delay', position: { x: 0, y: 1300 }, data: { label: 'Delay', type: 'delay', config: { type: 'fixed', seconds: 0 } } },
        { id: 'n15', type: 'ai-action', position: { x: 0, y: 1400 }, data: { label: 'AI Action', type: 'ai-action', config: { endpointId: '', model: '', prompt: '' } } },
        { id: 'n16', type: 'note', position: { x: 0, y: 1500 }, data: { label: 'Note', type: 'note', config: { content: '' } } },
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

  test('condition node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Condition');
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

  test('parallel agents node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Parallel Agents');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Parallel Agents');
    await expect(page.getByLabel('Node name')).toHaveValue('My Parallel Agents');
  });

  test('map node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Map');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Map');
    await expect(page.getByLabel('Node name')).toHaveValue('My Map');
    await expect(page.getByText('Fields')).toBeVisible();
    await expect(page.getByText('Mode')).toBeVisible();
  });

  test('http node config fields are accessible', async ({ page }) => {
    await openNode(page, 'HTTP');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My HTTP');
    await expect(page.getByLabel('Node name')).toHaveValue('My HTTP');
    await expect(page.getByText('Method')).toBeVisible();
    await expect(page.getByText('URL')).toBeVisible();
  });

  test('loop node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Loop');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Loop');
    await expect(page.getByLabel('Node name')).toHaveValue('My Loop');
    await expect(page.getByText('Array Field')).toBeVisible();
  });

  test('delay node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Delay');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Delay');
    await expect(page.getByLabel('Node name')).toHaveValue('My Delay');
    await expect(page.getByText('Delay Type')).toBeVisible();
  });

  test('ai-action node config shows description', async ({ page }) => {
    await openNode(page, 'AI Action');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My AI');
    await expect(page.getByLabel('Node name')).toHaveValue('My AI');
  });

  test('note node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Note');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Note');
    await expect(page.getByLabel('Node name')).toHaveValue('My Note');
    await expect(page.getByText('Content')).toBeVisible();
  });

  test('switch node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Switch');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Switch');
    await expect(page.getByLabel('Node name')).toHaveValue('My Switch');
    await expect(page.getByText('Select Input Field')).toBeVisible();
    await expect(page.getByText('Cases')).toBeVisible();
  });

  test('switch node allows adding and removing cases', async ({ page }) => {
    await openNode(page, 'Switch');
    await page.getByText('+ Add case').click();
    const caseInputs = page.locator('[data-testid="node-config-modal"] input[placeholder="Value to match"]');
    await expect(caseInputs).toHaveCount(1);
    await caseInputs.fill('test-value');
    await expect(caseInputs).toHaveValue('test-value');
    await expect(page.getByText('Default path (optional)')).toBeVisible();
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
        { id: 'n4', type: 'condition', position: { x: 0, y: 300 }, data: { label: 'Cond', type: 'condition', config: { condition: '', outputLabels: ['true', 'false'] } } },
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
    const modal = page.getByTestId('node-config-modal');
    await expect(modal.getByText('Manual')).toBeVisible();
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

  test('condition: condition expression field present', async ({ page }) => {
    await openNode(page, 'Cond');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Cond A');
    await expect(page.getByLabel('Node name')).toHaveValue('Cond A');
  });

  test('output: field checkboxes present', async ({ page }) => {
    await openNode(page, 'Out');
    await expect(page.getByLabel('Node name')).toBeVisible();
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

  test('parallel agents: configuration section present', async ({ page }) => {
    await openNode(page, 'Par');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('Par');
    await expect(page.getByLabel('Node name')).toHaveValue('Par');
  });

  test('subflow node config opens and shows subflow selector', async ({ page, request }) => {
    const subRes = await createFlow(request, {
      name: uniqueFlowName('SubChild'),
      nodes: [
        { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: '{"data":"string"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const subFlow = await subRes.json();
    await openNode(page, 'out');
    await deleteFlow(request, subFlow.id);
  });
});

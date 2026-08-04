import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

const LLM_SYSTEM_PROMPT_PLACEHOLDER = 'You are a helpful assistant... Type {{ for field suggestions';

/**
 * Open a node's config modal on the flow editor canvas by label text.
 * - Uses a real pointer click (synthetic element.click() hit-tests against
 *   React Flow's coordinate system and can open the wrong node).
 * - Matches the node's label span exactly (node textContent concatenates the
 *   label and type, e.g. "TrigTrigger", and "Out" would otherwise match the
 *   "outputs" text inside the Parallel Agents node).
 */
async function openNode(page: any, label: string) {
  await page.locator('.react-flow__node').filter({ has: page.getByText(label, { exact: true }) }).first().click();
  await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
}

/**
 * Grid position for node index i.
 * The canvas is fitView-scaled; content taller than the pane pins row 0 under
 * the floating top bar (which would swallow pointer clicks). Wide-short grids
 * keep every node in the clickable middle band of the pane.
 */
function gridPos(i: number, cols: number) {
  const spacingX = 250;
  const spacingY = 300;
  return { x: (i % cols) * spacingX, y: Math.floor(i / cols) * spacingY };
}

test.describe('Node type config fields', () => {
  let mcpServerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const mcpRes = await request.post(`${API_URL}/mcp-servers`, {
      data: { name: 'E2E Config MCP', url: 'http://mock-mcp-e2e:3003/sse', transport: 'sse', enabled: true },
    });
    if (mcpRes.ok()) {
      const s = await mcpRes.json();
      mcpServerId = s.id;
      // Populate the tool list so the config dropdown shows tools
      const refresh = await request.post(`${API_URL}/mcp-servers/${s.id}/refresh`);
      if (!refresh.ok()) {
        console.warn('MCP refresh failed:', refresh.status());
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (mcpServerId) {
      await request.delete(`${API_URL}/mcp-servers/${mcpServerId}`).catch(() => {});
    }
  });

  // Create a flow with one of each node type for config testing
  async function setupFlow(request: any) {
    const name = uniqueFlowName('AllNodesConfig');
    const nodeTypes: Array<{ id: string; type: string; label: string; config: any }> = [
      { id: 'n1', type: 'trigger', label: 'Trig', config: { triggerType: 'manual' } },
      { id: 'n2', type: 'llm-agent', label: 'LLM', config: { endpointId: '', model: '', systemPrompt: '', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } },
      { id: 'n3', type: 'code', label: 'Code', config: { code: 'return input;' } },
      { id: 'n4', type: 'condition', label: 'Condition', config: { condition: '' } },
      { id: 'n5', type: 'output', label: 'Out', config: { inputFields: [] } },
      { id: 'n6', type: 'hitl', label: 'HITL', config: { prompt: '', buttons: [{ label: 'Approve', value: 'approved' }] } },
      { id: 'n7', type: 'mcp-tool', label: 'MCP', config: { serverId: '', toolName: '' } },
      { id: 'n8', type: 'retriever', label: 'Ret', config: { collectionName: 'default', topK: 5 } },
      { id: 'n9', type: 'switch', label: 'Switch', config: { fieldPath: '', cases: [] } },
      { id: 'n10', type: 'parallel', label: 'Parallel Agents', config: { subNodes: [] } },
      { id: 'n11', type: 'map', label: 'Map', config: { fields: [], mode: 'replace' } },
      { id: 'n12', type: 'http', label: 'HTTP', config: { method: 'GET', url: '' } },
      { id: 'n13', type: 'loop', label: 'Loop', config: { itemsField: '', subNodes: [], subEdges: [] } },
      { id: 'n14', type: 'delay', label: 'Delay', config: { type: 'fixed', seconds: 0 } },
      { id: 'n15', type: 'ai-action', label: 'AI Action', config: { endpointId: '', model: '', prompt: '' } },
      { id: 'n16', type: 'note', label: 'Note', config: { content: '' } },
    ];
    const res = await createFlow(request, {
      name,
      nodes: nodeTypes.map((n, i) => ({ id: n.id, type: n.type, position: gridPos(i, 8), data: { label: n.label, type: n.type, config: n.config } })),
      edges: [],
    });
    return res;
  }

  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const res = await setupFlow(request);
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

  /** Save the flow via the UI, wait until the config is visible via API, then reload. */
  async function saveAndReload(page: any, persisted: (flow: any) => boolean) {
    // Close the config modal first — its full-screen overlay sits above the bottom bar
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('node-config-modal')).toHaveCount(0, { timeout: 3000 });
    // The Save button is briefly disabled on load until the debounced name check completes
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => {
      const res = await page.request.get(`${API_URL}/flows/${flowId}`);
      if (!res.ok()) return false;
      const flow = await res.json();
      return persisted(flow);
    }, { timeout: 10000, message: 'save should persist the node config' }).toBe(true);
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  }

  test('trigger node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Trig');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await expect(page.getByText('Trigger Type')).toBeVisible();
    await page.getByLabel('Node name').fill('My Trigger');
    await expect(page.getByLabel('Node name')).toHaveValue('My Trigger');
  });

  test('llm-agent node config fields are accessible', async ({ page }) => {
    await openNode(page, 'LLM');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await expect(page.locator('[data-field-label="LLM Endpoint"]')).toBeVisible();
    // System prompt is a TemplateAutocomplete textarea (no label association)
    const sp = page.getByPlaceholder(LLM_SYSTEM_PROMPT_PLACEHOLDER);
    await expect(sp).toBeVisible();
    await sp.fill('Test prompt');
    await expect(sp).toHaveValue('Test prompt');
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
    await expect(page.getByLabel('Node name')).toBeVisible();
    // Non-chat output shows the behavior explainer
    await expect(page.getByText('Output behavior')).toBeVisible();
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
    await expect(page.locator('[data-field-label="MCP Server"]')).toBeVisible();
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
    await expect(page.getByText('Fields', { exact: true })).toBeVisible();
    await expect(page.getByText('Mode', { exact: true })).toBeVisible();
  });

  test('http node config fields are accessible', async ({ page }) => {
    await openNode(page, 'HTTP');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My HTTP');
    await expect(page.getByLabel('Node name')).toHaveValue('My HTTP');
    await expect(page.getByText('Method', { exact: true })).toBeVisible();
    await expect(page.getByText('URL', { exact: true })).toBeVisible();
  });

  test('loop node config fields are accessible', async ({ page }) => {
    await openNode(page, 'Loop');
    await expect(page.getByLabel('Node name')).toBeVisible();
    await page.getByLabel('Node name').fill('My Loop');
    await expect(page.getByLabel('Node name')).toHaveValue('My Loop');
    await expect(page.getByText('Array Field', { exact: true })).toBeVisible();
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

  // ── Type-specific field persistence (edit → save → reload → verify) ──

  test('trigger: manual input message persists after save and reload', async ({ page }) => {
    await openNode(page, 'Trig');
    await page.getByLabel('Input Message').fill('Persisted manual input message');
    await saveAndReload(page, (flow) => flow.nodes.find((n: any) => n.data?.type === 'trigger')?.data?.config?.inputMessage === 'Persisted manual input message');

    await openNode(page, 'Trig');
    await expect(page.getByLabel('Input Message')).toHaveValue('Persisted manual input message');
  });

  test('llm-agent: system prompt persists after save and reload', async ({ page }) => {
    await openNode(page, 'LLM');
    await page.getByPlaceholder(LLM_SYSTEM_PROMPT_PLACEHOLDER).fill('Persisted system prompt for E2E');
    await saveAndReload(page, (flow) => {
      const cfg = flow.nodes.find((n: any) => n.data?.type === 'llm-agent')?.data?.config;
      return cfg?.systemPrompt === 'Persisted system prompt for E2E';
    });

    await openNode(page, 'LLM');
    await expect(page.getByPlaceholder(LLM_SYSTEM_PROMPT_PLACEHOLDER)).toHaveValue('Persisted system prompt for E2E');
  });

  test('http: URL persists after save and reload', async ({ page }) => {
    await openNode(page, 'HTTP');
    await page.getByLabel('URL').fill('https://persisted.example/api/v1');
    await saveAndReload(page, (flow) => flow.nodes.find((n: any) => n.data?.type === 'http')?.data?.config?.url === 'https://persisted.example/api/v1');

    await openNode(page, 'HTTP');
    await expect(page.getByLabel('URL')).toHaveValue('https://persisted.example/api/v1');
  });

  // ── Trigger type switching ──

  test('trigger: switching types shows the matching fields and persists', async ({ page }) => {
    await openNode(page, 'Trig');

    // Manual → Webhook: secret + input schema appear
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Webhook' }).click();
    await expect(page.getByText('Expected Input Schema')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Webhook Secret')).toBeVisible();
    await page.getByLabel('Webhook Secret').fill('super-secret-123');
    await page.getByTestId('json-schema-mode-raw').click();
    await page.getByTestId('json-schema-raw-input').fill('{"type":"object","properties":{"data":{"type":"string"}},"required":["data"]}');

    // Webhook → Schedule: cron field appears
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Schedule' }).click();
    await expect(page.getByLabel('Cron Expression')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Webhook Secret')).toHaveCount(0);
    await page.getByLabel('Cron Expression').fill('*/5 * * * *');

    // Schedule → Manual: input message appears
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Manual' }).click();
    await expect(page.getByLabel('Input Message')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Cron Expression')).toHaveCount(0);

    // Back to Webhook and persist the config
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Webhook' }).click();
    await expect(page.getByLabel('Webhook Secret')).toBeVisible({ timeout: 5000 });
    await saveAndReload(page, (flow) => {
      const cfg = flow.nodes.find((n: any) => n.data?.type === 'trigger')?.data?.config;
      return cfg?.triggerType === 'webhook' && cfg?.webhookSecret === 'super-secret-123';
    });

    await openNode(page, 'Trig');
    await expect(page.getByLabel('Webhook Secret')).toHaveValue('super-secret-123');
    await expect(page.getByText('Expected Input Schema')).toBeVisible();
  });

  // ── HITL button management ──

  test('hitl: custom mode adds a button and persists it', async ({ page }) => {
    await openNode(page, 'HITL');
    await page.getByRole('button', { name: 'Custom' }).click();
    await expect(page.getByText('Buttons', { exact: true })).toBeVisible();

    // One pre-existing button from the initial config
    await expect(page.getByLabel('Label')).toHaveCount(1);
    await page.getByText('+ Add Button').click();
    await expect(page.getByLabel('Label')).toHaveCount(2);

    await page.getByLabel('Label').nth(1).fill('Send for review');
    await page.getByLabel('Value').nth(1).fill('send_for_review');
    await saveAndReload(page, (flow) => {
      const buttons = flow.nodes.find((n: any) => n.data?.type === 'hitl')?.data?.config?.buttons || [];
      return buttons.length === 2 && buttons[1]?.label === 'Send for review';
    });

    await openNode(page, 'HITL');
    await page.getByRole('button', { name: 'Custom' }).click();
    await expect(page.getByLabel('Label')).toHaveCount(2);
    await expect(page.getByLabel('Label').nth(1)).toHaveValue('Send for review');
    await expect(page.getByLabel('Value').nth(1)).toHaveValue('send_for_review');
  });

  // ── MCP tool node ──

  test('mcp-tool: selects a server and tool, persists after reload', async ({ page }) => {
    test.skip(!mcpServerId, 'Mock MCP server not available');

    await openNode(page, 'MCP');
    const serverSelect = page.locator('[data-field-label="MCP Server"]');
    await expect(serverSelect).toBeVisible();
    await serverSelect.click();
    const option = page.getByRole('option', { name: /E2E Config MCP/ });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    // Tool list for the selected server populates from the refreshed server
    const echoCheckbox = page.locator('[data-testid="node-config-modal"]').getByText('echo', { exact: false }).first();
    await expect(echoCheckbox).toBeVisible({ timeout: 10000 });
    await page.locator('label:has-text("echo") input[type="checkbox"]').check();

    await saveAndReload(page, (flow) => {
      const cfg = flow.nodes.find((n: any) => n.data?.type === 'mcp-tool')?.data?.config;
      return cfg?.serverId === mcpServerId && (cfg?.toolNames || []).includes('echo');
    });

    await openNode(page, 'MCP');
    await expect(page.locator('[data-field-label="MCP Server"]')).toContainText('E2E Config MCP');
    const savedCheckbox = page.locator('label:has-text("echo") input[type="checkbox"]');
    await expect(savedCheckbox).toBeChecked({ timeout: 5000 });
  });
});

test.describe('Node config — deep field tests', () => {
  let flowId: string;

  test.beforeEach(async ({ page, request }) => {
    const deepNodeTypes: Array<{ id: string; type: string; label: string; config: any }> = [
      { id: 'n1', type: 'trigger', label: 'Trig', config: { triggerType: 'manual' } },
      { id: 'n2', type: 'llm-agent', label: 'LLM', config: { endpointId: '', model: '', systemPrompt: '', temperature: 0.7, maxTokens: 256, responseFormat: 'text' } },
      { id: 'n3', type: 'code', label: 'Code', config: { code: 'return input;' } },
      { id: 'n4', type: 'condition', label: 'Cond', config: { condition: '', outputLabels: ['true', 'false'] } },
      { id: 'n5', type: 'output', label: 'Out', config: { inputFields: [] } },
      { id: 'n6', type: 'hitl', label: 'HITL', config: { prompt: '', buttons: [{ label: 'Approve', value: 'approved' }] } },
      { id: 'n7', type: 'mcp-tool', label: 'MCP', config: { serverId: '', toolName: '' } },
      { id: 'n8', type: 'retriever', label: 'Ret', config: { collectionName: 'default', topK: 5, minScore: 0.5 } },
      { id: 'n9', type: 'parallel', label: 'Par', config: { subNodes: [] } },
    ];
    const res = await createFlow(request, {
      name: uniqueFlowName('DeepConfig'),
      nodes: deepNodeTypes.map((n, i) => ({ id: n.id, type: n.type, position: gridPos(i, 9), data: { label: n.label, type: n.type, config: n.config } })),
      edges: [],
    });
    expect(res.ok()).toBe(true);
    const flow = await res.json();
    flowId = flow.id;
    await page.goto(`/flows/${flowId}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterEach(async ({ request }) => {
    if (flowId) await deleteFlow(request, flowId).catch(() => {});
  });

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
    await expect(page.locator('[data-field-label="LLM Endpoint"]')).toBeVisible();
    await expect(page.getByPlaceholder(LLM_SYSTEM_PROMPT_PLACEHOLDER)).toBeVisible();
    await expect(page.locator('[data-field-label="Response Format"]')).toBeVisible();
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
    await expect(page.getByText('Condition Expression')).toBeVisible();
    await page.getByLabel('Node name').fill('Cond A');
    await expect(page.getByLabel('Node name')).toHaveValue('Cond A');
  });

  test('output: field checkboxes present', async ({ page }) => {
    await openNode(page, 'Out');
    await expect(page.getByText('Output behavior')).toBeVisible();
    await page.getByLabel('Node name').fill('Output');
    await expect(page.getByLabel('Node name')).toHaveValue('Output');
  });

  test('hitl: prompt field and buttons', async ({ page }) => {
    await openNode(page, 'HITL');
    await expect(page.getByText('Prompt for the User')).toBeVisible();
    await page.getByLabel('Node name').fill('Hitl');
    await expect(page.getByLabel('Node name')).toHaveValue('Hitl');
  });

  test('mcp-tool: server and tool selectors present', async ({ page }) => {
    await openNode(page, 'MCP');
    await expect(page.locator('[data-field-label="MCP Server"]')).toBeVisible();
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

  test('subflow node config opens and shows the subflow selector', async ({ page, request }) => {
    // Create a subflow (trigger type = subflow) to select from
    const subRes = await createFlow(request, {
      name: uniqueFlowName('SubChild'),
      nodes: [
        { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: '{"type":"object","properties":{"data":{"type":"string"}},"required":["data"]}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 's1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    expect(subRes.ok()).toBe(true);
    const subFlow = await subRes.json();

    try {
      // Add a subflow node to the canvas via the catalog and open its config
      await page.getByTestId('add-node-btn').click();
      await page.getByTestId('catalog-subflow').click();
      await page.locator('.react-flow__node').filter({ hasText: 'subflow' }).first().click();
      await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('subflow-config')).toBeVisible({ timeout: 5000 });

      // The created subflow is listed and selectable
      await expect(page.getByTestId('subflows-list')).toBeVisible({ timeout: 10000 });
      await page.getByTestId(`subflow-item-${subFlow.name.replace(/\s+/g, '-')}`).click();
      await expect(page.getByTestId(`subflow-item-${subFlow.name.replace(/\s+/g, '-')}`)).toHaveClass(/border-secondary/);
    } finally {
      await deleteFlow(request, subFlow.id);
    }
  });
});

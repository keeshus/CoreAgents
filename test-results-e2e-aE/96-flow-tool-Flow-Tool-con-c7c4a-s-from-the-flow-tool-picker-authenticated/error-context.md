# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 96-flow-tool.spec.ts >> Flow Tool config >> excludes non-webhook flows from the flow-tool picker
- Location: test/e2e/96-flow-tool.spec.ts:94:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('node-config-modal').locator('input[type="checkbox"]')
Expected: 1
Received: 5
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByTestId('node-config-modal').locator('input[type="checkbox"]')
    14 × locator resolved to 5 elements
       - unexpected value "5"

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - generic [ref=e1]:
        - link [ref=e2] [cursor=pointer]:
          - /url: /
          - generic [ref=e3]: arrow_back
          - generic [ref=e4]: Back
        - generic [ref=e5]:
          - textbox [ref=e7]:
            - /placeholder: " "
            - text: FlowToolConfig-1785659318187
          - generic: Flow name
        - generic [ref=e8]:
          - textbox [ref=e10]:
            - /placeholder: " "
          - generic: Description
        - button [ref=e11] [cursor=pointer]:
          - generic [ref=e12]: settings
      - generic:
        - generic:
          - generic:
            - application:
              - group [active] [ref=e13]:
                - generic [ref=e14]:
                  - generic [ref=e16]: Flow Tool
                  - generic [ref=e17]:
                    - generic [ref=e18]:
                      - paragraph [ref=e19]: Not configured
                      - paragraph [ref=e20]: Connect purple dot to LLM Agent ↓
                    - generic [ref=e21]: webhook→ LLM Agent
              - img
              - generic:
                - button [disabled]:
                  - img
                - button:
                  - img
                - button:
                  - img
                - button:
                  - img
              - generic:
                - img
      - generic:
        - button [ref=e23] [cursor=pointer]:
          - generic [ref=e24]: add
        - generic [ref=e25]: Add Node
      - generic [ref=e26]:
        - button [disabled] [ref=e27]:
          - generic [ref=e28]: undo
          - text: Undo
        - separator [ref=e29]
        - button [disabled] [ref=e30]:
          - generic [ref=e31]: redo
          - text: Redo
        - separator [ref=e32]
        - link [ref=e33] [cursor=pointer]:
          - /url: /flows/529e29c9-d229-460f-a63c-0570e7d2e13b/executions
          - generic [ref=e34]: history
          - text: Runs
        - button [ref=e35] [cursor=pointer]:
          - generic [ref=e36]: bug_report
          - text: Debug
        - separator [ref=e37]
        - button [ref=e38] [cursor=pointer]:
          - generic [ref=e39]: dark_mode
          - text: Dark
        - separator [ref=e40]
        - button [ref=e41] [cursor=pointer]:
          - generic [ref=e42]: save
          - text: Save
    - button:
      - generic: chat
  - button [ref=e48] [cursor=pointer]:
    - img [ref=e49]
  - generic:
    - alert: /flows/529e29c9-d229-460f-a63c-0570e7d2e13b/edit
  - dialog [ref=e53]:
    - generic [ref=e54]:
      - generic [ref=e55]:
        - generic [ref=e56]: Flow Tool
        - generic [ref=e57]:
          - textbox "Node name" [ref=e59]:
            - /placeholder: " "
            - text: Flow Tool
          - generic: Node name
      - generic [ref=e60]:
        - button "delete Delete" [ref=e61] [cursor=pointer]:
          - generic [ref=e62]: delete
          - text: Delete
        - button "close Close" [ref=e63] [cursor=pointer]:
          - generic [ref=e64]:
            - generic [ref=e65]: close
            - text: Close
    - generic [ref=e66]:
      - generic [ref=e67]:
        - generic [ref=e68]:
          - generic [ref=e69]:
            - generic [ref=e70]: Filter by group
            - button "All groups arrow_drop_down" [ref=e71] [cursor=pointer]:
              - generic [ref=e72]: All groups
              - generic [ref=e73]: arrow_drop_down
          - generic [ref=e74]:
            - generic [ref=e75]: Search
            - textbox "Search flows..." [ref=e76]
        - generic [ref=e77]:
          - generic [ref=e78] [cursor=pointer]:
            - checkbox "WeatherAPI-1785659318186 1 field Get weather for a city" [ref=e79]
            - generic [ref=e80]:
              - generic [ref=e81]:
                - generic [ref=e82]: WeatherAPI-1785659318186
                - generic [ref=e83]: 1 field
              - paragraph [ref=e84]: Get weather for a city
          - generic [ref=e85] [cursor=pointer]:
            - checkbox "KeyTest-1785659097364 ⚪" [ref=e86]
            - generic [ref=e88]:
              - generic [ref=e89]: KeyTest-1785659097364
              - generic "No input schema defined — callable without parameters." [ref=e90]: ⚪
          - generic [ref=e91] [cursor=pointer]:
            - checkbox "KeyTest-1785659033052 ⚪" [ref=e92]
            - generic [ref=e94]:
              - generic [ref=e95]: KeyTest-1785659033052
              - generic "No input schema defined — callable without parameters." [ref=e96]: ⚪
          - generic [ref=e97] [cursor=pointer]:
            - checkbox "CPWebhookSlug2-1785658927793 ⚪" [ref=e98]
            - generic [ref=e100]:
              - generic [ref=e101]: CPWebhookSlug2-1785658927793
              - generic "No input schema defined — callable without parameters." [ref=e102]: ⚪
          - generic [ref=e103] [cursor=pointer]:
            - checkbox "CPWebhookSlug1-1785658927792 ⚪" [ref=e104]
            - generic [ref=e106]:
              - generic [ref=e107]: CPWebhookSlug1-1785658927792
              - generic "No input schema defined — callable without parameters." [ref=e108]: ⚪
      - generic [ref=e109]: "{ \"flowIds\": [], \"selectedFlows\": [] }"
```

# Test source

```ts
  17  |     flowId = flow.id;
  18  |     await page.goto(`/flows/${flowId}/edit`);
  19  |   });
  20  | 
  21  |   test.afterEach(async ({ request }) => {
  22  |     if (flowId) {
  23  |       await deleteFlow(request, flowId).catch(() => {});
  24  |     }
  25  |   });
  26  | 
  27  |   test('appears in the node catalog under Tools', async ({ page }) => {
  28  |     await page.getByTestId('add-node-btn').click();
  29  |     await expect(page.getByTestId('catalog-flow-tool')).toBeVisible({ timeout: 5000 });
  30  |   });
  31  | 
  32  |   test('can be added to the canvas', async ({ page }) => {
  33  |     await page.getByTestId('add-node-btn').click();
  34  |     await page.getByTestId('catalog-flow-tool').click();
  35  |     await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
  36  |     await expect(page.getByText('Flow Tool')).toBeVisible();
  37  |   });
  38  | });
  39  | 
  40  | test.describe('Flow Tool config', () => {
  41  |   let webhookFlowId: string;
  42  |   let webhookFlowName: string;
  43  |   let flowId: string;
  44  | 
  45  |   test.beforeEach(async ({ page, request }) => {
  46  |     // Create a webhook flow to appear in the Flow Tool picker
  47  |     const webhookRes = await createFlow(request, {
  48  |       name: uniqueFlowName('WeatherAPI'),
  49  |       description: 'Get weather for a city',
  50  |       nodes: [
  51  |         {
  52  |           id: 't1', type: 'trigger', position: { x: 0, y: 0 },
  53  |           data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET, inputSchema: INPUT_SCHEMA } },
  54  |         },
  55  |         { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Process', type: 'code', config: { code: 'return { result: `Weather in ${input.message}: sunny, 22°C` };' } } },
  56  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['process.result'] } } },
  57  |       ],
  58  |       edges: [
  59  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
  60  |         { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  61  |       ],
  62  |     });
  63  |     const webhookFlow = await webhookRes.json();
  64  |     webhookFlowId = webhookFlow.id;
  65  |     webhookFlowName = webhookFlow.name;
  66  | 
  67  |     // Create the main flow with a Flow Tool node
  68  |     const res = await createFlow(request, {
  69  |       name: uniqueFlowName('FlowToolConfig'),
  70  |       nodes: [
  71  |         { id: 'ft1', type: 'flow-tool', position: { x: 0, y: 0 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [], selectedFlows: [] } } },
  72  |       ],
  73  |       edges: [],
  74  |     });
  75  |     const flow = await res.json();
  76  |     flowId = flow.id;
  77  |     await page.goto(`/flows/${flowId}/edit`);
  78  |   });
  79  | 
  80  |   test.afterEach(async ({ request }) => {
  81  |     if (webhookFlowId) await deleteFlow(request, webhookFlowId).catch(() => {});
  82  |     if (flowId) await deleteFlow(request, flowId).catch(() => {});
  83  |   });
  84  | 
  85  |   test('shows webhook flows in the config panel', async ({ page }) => {
  86  |     await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
  87  |     await page.locator('.react-flow__node').first().click();
  88  |     const modal = page.getByTestId('node-config-modal');
  89  |     await expect(modal).toBeVisible({ timeout: 5000 });
  90  |     // The webhook flow should appear in the list
  91  |     await expect(modal.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
  92  |   });
  93  | 
  94  |   test('excludes non-webhook flows from the flow-tool picker', async ({ page, request }) => {
  95  |     // Create a manual-trigger flow — it must NOT show up in the picker
  96  |     const manualRes = await createFlow(request, {
  97  |       name: uniqueFlowName('PickerManual'),
  98  |       nodes: [
  99  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
  100 |         { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
  101 |       ],
  102 |       edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
  103 |     });
  104 |     const manualFlow = await manualRes.json();
  105 |     const manualName = manualFlow.name;
  106 | 
  107 |     await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
  108 |     await page.locator('.react-flow__node').first().click();
  109 |     const modal = page.getByTestId('node-config-modal');
  110 |     await expect(modal).toBeVisible({ timeout: 5000 });
  111 | 
  112 |     // The webhook flow (created in beforeEach) is listed...
  113 |     await expect(modal.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
  114 |     // ...but the manual flow is excluded entirely
  115 |     await expect(modal.getByText(manualName, { exact: true })).toHaveCount(0);
  116 |     // Exactly one checkbox = exactly one webhook flow in the list
> 117 |     await expect(modal.locator('input[type="checkbox"]')).toHaveCount(1);
      |                                                           ^ Error: expect(locator).toHaveCount(expected) failed
  118 | 
  119 |     await deleteFlow(request, manualFlow.id);
  120 |   });
  121 | 
  122 |   test('flow-tool selection persists after save and reload', async ({ page, request }) => {
  123 |     await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
  124 |     await page.locator('.react-flow__node').first().click();
  125 |     const modal = page.getByTestId('node-config-modal');
  126 |     await expect(modal).toBeVisible({ timeout: 5000 });
  127 | 
  128 |     // Select the webhook flow
  129 |     const checkbox = modal.locator('input[type="checkbox"]').first();
  130 |     await checkbox.check();
  131 |     await expect(modal.getByText(/1 flow selected/)).toBeVisible({ timeout: 3000 });
  132 | 
  133 |     // Close the modal, then save via the editor, then reload the page
  134 |     await modal.getByRole('button', { name: 'Close' }).click();
  135 |     await expect(modal).not.toBeVisible();
  136 |     // The Save button can silently no-op when its async name-check closure
  137 |     // goes stale (app quirk) — retry the click until the API reflects it
  138 |     await expect.poll(async () => {
  139 |       const btn = page.getByRole('button', { name: 'Save' });
  140 |       if (await btn.isEnabled().catch(() => false)) {
  141 |         await btn.click({ timeout: 2000 }).catch(() => {});
  142 |       }
  143 |       await page.waitForTimeout(400);
  144 |       const res = await page.request.get(`${API_URL}/flows/${flowId}`);
  145 |       if (!res.ok()) return -1;
  146 |       const flow = await res.json();
  147 |       const ft = flow.nodes.find((n: any) => n.data?.type === 'flow-tool');
  148 |       return ft?.data?.config?.flowIds?.includes(webhookFlowId) ? 1 : 0;
  149 |     }, { timeout: 20000, message: 'save should persist the flow-tool selection' }).toBe(1);
  150 |     await page.goto(`/flows/${flowId}/edit`);
  151 |     await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
  152 | 
  153 |     // Reopen the config — the selection must still be checked
  154 |     await page.locator('.react-flow__node').first().click();
  155 |     const modal2 = page.getByTestId('node-config-modal');
  156 |     await expect(modal2).toBeVisible({ timeout: 5000 });
  157 |     await expect(modal2.getByText(webhookFlowName, { exact: true })).toBeVisible({ timeout: 5000 });
  158 |     await expect(modal2.locator('input[type="checkbox"]').first()).toBeChecked();
  159 |     await expect(modal2.getByText(/1 flow selected/)).toBeVisible({ timeout: 3000 });
  160 | 
  161 |     // And the flow-tool node config on the server carries the selection
  162 |     const savedRes = await request.get(`${API_URL}/flows/${flowId}`);
  163 |     expect(savedRes.ok()).toBe(true);
  164 |     const saved = await savedRes.json();
  165 |     const ftNode = saved.nodes.find((n: any) => n.data?.type === 'flow-tool');
  166 |     expect(ftNode.data?.config?.flowIds).toContain(webhookFlowId);
  167 |     expect(ftNode.data?.config?.selectedFlows?.length).toBe(1);
  168 |   });
  169 | 
  170 |   test('allows selecting a webhook flow', async ({ page }) => {
  171 |     await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 5000 });
  172 |     await page.locator('.react-flow__node').first().click();
  173 |     const modal = page.getByTestId('node-config-modal');
  174 |     await expect(modal).toBeVisible({ timeout: 5000 });
  175 |     // Click the checkbox for the webhook flow
  176 |     const checkbox = modal.locator('input[type="checkbox"]').first();
  177 |     await checkbox.check();
  178 |     // Summary text should appear
  179 |     await expect(modal.getByText(/flow.*selected/)).toBeVisible({ timeout: 3000 });
  180 |   });
  181 | });
  182 | 
  183 | test.describe('Flow Tool execution', () => {
  184 |   let mockEndpointId: string | null = null;
  185 |   const webhookFlowIds: string[] = [];
  186 |   const mainFlowIds: string[] = [];
  187 | 
  188 |   test.beforeAll(async ({ request }) => {
  189 |     const res = await request.post(`${API_URL}/llm-endpoints`, {
  190 |       data: { name: 'E2E Mock LLM', providerType: 'openai', baseUrl: 'http://mock-llm-e2e:3002/v1', apiKey: 'mock-key', defaultModel: 'mock-gpt-4', models: ['mock-gpt-4'] },
  191 |     });
  192 |     if (res.ok()) { const ep = await res.json(); mockEndpointId = ep.id; }
  193 |   });
  194 | 
  195 |   test.afterAll(async ({ request }) => {
  196 |     for (const id of webhookFlowIds) await deleteFlow(request, id).catch(() => {});
  197 |     for (const id of mainFlowIds) await deleteFlow(request, id).catch(() => {});
  198 |     if (mockEndpointId) await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`);
  199 |   });
  200 | 
  201 |   const cookie = getAuthCookie() || undefined;
  202 | 
  203 |   test('executes a webhook flow via Flow Tool when LLM Agent calls it', async ({ request }) => {
  204 |     test.skip(!mockEndpointId, 'Mock LLM endpoint not available');
  205 | 
  206 |     // Create a webhook flow (the "tool" to be called)
  207 |     const slug = 'weather_api';
  208 |     const webhookRes = await createFlow(request, {
  209 |       name: 'Weather API',
  210 |       description: 'Get weather for a city',
  211 |       nodes: [
  212 |         {
  213 |           id: 't1', type: 'trigger', position: { x: 0, y: 0 },
  214 |           data: { label: 'Webhook', type: 'trigger', config: { triggerType: 'webhook', webhookSecret: WEBHOOK_SECRET, inputSchema: INPUT_SCHEMA } },
  215 |         },
  216 |         { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Process', type: 'code', config: { code: 'return { result: `Weather in ${input.message}: sunny, 22°C` };' } } },
  217 |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['process.result'] } } },
```
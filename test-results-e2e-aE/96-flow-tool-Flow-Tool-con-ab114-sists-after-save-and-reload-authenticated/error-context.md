# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 96-flow-tool.spec.ts >> Flow Tool config >> flow-tool selection persists after save and reload
- Location: test/e2e/96-flow-tool.spec.ts:122:3

# Error details

```
Error: save should persist the flow-tool selection

save should persist the flow-tool selection

expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - link "arrow_back Back" [ref=e5] [cursor=pointer]:
          - /url: /
          - generic [ref=e6]: arrow_back
          - generic [ref=e7]: Back
        - generic [ref=e8]:
          - textbox "Flow name" [ref=e10]:
            - /placeholder: " "
            - text: FlowToolConfig-1785659352851
          - generic: Flow name
        - generic [ref=e11]:
          - textbox "Description" [ref=e13]:
            - /placeholder: " "
          - generic: Description
        - button "settings" [ref=e14] [cursor=pointer]:
          - generic [ref=e15]: settings
      - application [ref=e19]:
        - group [ref=e22]:
          - generic [ref=e23]:
            - generic [ref=e25]: Flow Tool
            - generic [ref=e26]:
              - generic [ref=e27]:
                - paragraph [ref=e28]: 1 flow selected
                - paragraph [ref=e29]: AllNodesConfig-1785659225511
                - paragraph [ref=e30]: Connect purple dot to LLM Agent ↓
              - generic [ref=e31]: webhook→ LLM Agent
        - img
        - generic "Control Panel" [ref=e33]:
          - button "Zoom In" [disabled]:
            - img
          - button "Zoom Out" [ref=e34] [cursor=pointer]:
            - img [ref=e35]
          - button "Fit View" [ref=e37] [cursor=pointer]:
            - img [ref=e38]
          - button "Toggle Interactivity" [ref=e40] [cursor=pointer]:
            - img [ref=e41]
        - img "Mini Map" [ref=e44]
      - generic:
        - button "add" [ref=e47] [cursor=pointer]:
          - generic [ref=e48]: add
        - generic [ref=e49]: Add Node
      - generic [ref=e50]:
        - button "undo Undo" [ref=e51] [cursor=pointer]:
          - generic [ref=e52]: undo
          - text: Undo
        - separator [ref=e53]
        - button "redo Redo" [disabled] [ref=e54]:
          - generic [ref=e55]: redo
          - text: Redo
        - separator [ref=e56]
        - link "history Runs" [ref=e57] [cursor=pointer]:
          - /url: /flows/e8e25f67-1cfe-4dce-a903-1eaedd75bcbc/executions
          - generic [ref=e58]: history
          - text: Runs
        - button "bug_report Debug" [ref=e59] [cursor=pointer]:
          - generic [ref=e60]: bug_report
          - text: Debug
        - separator [ref=e61]
        - button "dark_mode Dark" [ref=e62] [cursor=pointer]:
          - generic [ref=e63]: dark_mode
          - text: Dark
        - separator [ref=e64]
        - button "save Save" [ref=e65] [cursor=pointer]:
          - generic [ref=e66]: save
          - text: Save
    - button "chat" [ref=e67] [cursor=pointer]:
      - generic [ref=e68]: chat
  - button "Open Next.js Dev Tools" [ref=e74] [cursor=pointer]:
    - img [ref=e75]
  - alert [ref=e78]: /flows/e8e25f67-1cfe-4dce-a903-1eaedd75bcbc/edit
```

# Test source

```ts
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
  117 |     await expect(modal.locator('input[type="checkbox"]')).toHaveCount(1);
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
> 149 |     }, { timeout: 20000, message: 'save should persist the flow-tool selection' }).toBe(1);
      |                                                                                    ^ Error: save should persist the flow-tool selection
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
  218 |       ],
  219 |       edges: [
  220 |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
  221 |         { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  222 |       ],
  223 |     });
  224 |     const webhookFlow = await webhookRes.json();
  225 |     webhookFlowIds.push(webhookFlow.id);
  226 | 
  227 |     // Create the main flow with manual trigger → LLM Agent → Output, and a Flow Tool node
  228 |     const mainRes = await createFlow(request, {
  229 |       name: uniqueFlowName('FlowToolExec'),
  230 |       nodes: [
  231 |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
  232 |         {
  233 |           id: 'l1', type: 'llm-agent', position: { x: 300, y: 0 },
  234 |           data: {
  235 |             label: 'LLM Agent',
  236 |             type: 'llm-agent',
  237 |             config: {
  238 |               endpointId: mockEndpointId,
  239 |               model: 'mock-gpt-4',
  240 |               systemPrompt: `You have weather tools. MOCK_TOOL_CALL: flow_${slug} {"message":"Amsterdam"} MOCK_RESPONSE: "Done! Weather retrieved."`,
  241 |               temperature: 0.7,
  242 |               maxTokens: 256,
  243 |               responseFormat: 'text',
  244 |             },
  245 |           },
  246 |         },
  247 |         { id: 'ft1', type: 'flow-tool', position: { x: 150, y: 200 }, data: { label: 'Flow Tool', type: 'flow-tool', config: { flowIds: [webhookFlow.id], selectedFlows: [{ id: webhookFlow.id, name: 'Weather API' }] } } },
  248 |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['llm_agent.content'] } } },
  249 |       ],
```
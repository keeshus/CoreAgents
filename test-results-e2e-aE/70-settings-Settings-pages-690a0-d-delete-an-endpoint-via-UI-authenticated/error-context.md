# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 70-settings.spec.ts >> Settings pages >> endpoints page: create, edit and delete an endpoint via UI
- Location: test/e2e/70-settings.spec.ts:84:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('mock-gpt-4')
Expected: visible
Error: strict mode violation: getByText('mock-gpt-4') resolved to 2 elements:
    1) <span class="font-mono text-on-surface-variant">mock-gpt-4</span> aka getByText('mock-gpt-').first()
    2) <span class="font-mono text-on-surface-variant">mock-gpt-4</span> aka getByText('mock-gpt-').nth(1)

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('mock-gpt-4')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "arrow_back Back" [ref=e6] [cursor=pointer]:
          - /url: /settings
          - generic [ref=e7]: arrow_back
          - generic [ref=e8]: Back
        - generic [ref=e9]:
          - heading "LLM Endpoints" [level=1] [ref=e10]
          - paragraph [ref=e11]: Manage your LLM provider connections
          - paragraph [ref=e12]: ⭐ The default endpoint is used by the Co-Pilot AI assistant for system-wide tasks like answering questions and helping you build flows.
        - button "add Add Endpoint" [ref=e13] [cursor=pointer]:
          - generic [ref=e14]: add
          - text: Add Endpoint
      - generic [ref=e16]:
        - generic [ref=e17]: Filter by group
        - button "All items arrow_drop_down" [ref=e18] [cursor=pointer]:
          - generic [ref=e19]: All items
          - generic [ref=e20]: arrow_drop_down
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e24]: memory
          - generic [ref=e25]:
            - generic [ref=e26]:
              - heading "E2E Chat Flow LLM" [level=3] [ref=e27]
              - generic [ref=e28]: OpenAI
              - generic [ref=e29]: App
            - paragraph [ref=e30]: "Model: mock-gpt-4"
            - generic [ref=e32]: 1 model
          - generic [ref=e33]:
            - button "Set as default" [ref=e34] [cursor=pointer]
            - button "edit Edit" [ref=e35] [cursor=pointer]:
              - generic [ref=e36]: edit
              - text: Edit
            - button "delete Delete" [ref=e37] [cursor=pointer]:
              - generic [ref=e38]: delete
              - text: Delete
        - generic [ref=e39]:
          - generic [ref=e41]: memory
          - generic [ref=e42]:
            - generic [ref=e43]:
              - heading "E2E Endpoint 1785659145751" [level=3] [ref=e44]
              - generic [ref=e45]: Anthropic
              - generic [ref=e46]: App
            - paragraph [ref=e47]: "Model: mock-gpt-4"
            - generic [ref=e49]: 1 model
          - generic [ref=e50]:
            - button "Set as default" [ref=e51] [cursor=pointer]
            - button "edit Edit" [ref=e52] [cursor=pointer]:
              - generic [ref=e53]: edit
              - text: Edit
            - button "delete Delete" [ref=e54] [cursor=pointer]:
              - generic [ref=e55]: delete
              - text: Delete
    - button "chat" [ref=e56] [cursor=pointer]:
      - generic [ref=e57]: chat
    - button "dark_mode" [ref=e58] [cursor=pointer]:
      - generic [ref=e59]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e65] [cursor=pointer]:
    - img [ref=e66]
  - alert [ref=e69]
```

# Test source

```ts
  5   | test.describe('Settings pages', () => {
  6   |   const cleanupGroupIds: string[] = [];
  7   |   const cleanupEndpointIds: string[] = [];
  8   |   const cleanupMcpIds: string[] = [];
  9   | 
  10  |   test.afterEach(async ({ request }) => {
  11  |     for (const id of cleanupGroupIds) {
  12  |       await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
  13  |     }
  14  |     cleanupGroupIds.length = 0;
  15  |     for (const id of cleanupEndpointIds) {
  16  |       await request.delete(`${API_URL}/llm-endpoints/${id}`).catch(() => {});
  17  |     }
  18  |     cleanupEndpointIds.length = 0;
  19  |     for (const id of cleanupMcpIds) {
  20  |       await request.delete(`${API_URL}/mcp-servers/${id}`).catch(() => {});
  21  |     }
  22  |     cleanupMcpIds.length = 0;
  23  |   });
  24  | 
  25  |   test('settings page loads with navigation', async ({ page }) => {
  26  |     await page.goto('/settings');
  27  |     await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  28  |   });
  29  | 
  30  |   test('LLM endpoints page loads', async ({ page }) => {
  31  |     await page.goto('/settings/endpoints');
  32  |     await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  33  |   });
  34  | 
  35  |   test('MCP servers page loads', async ({ page }) => {
  36  |     await page.goto('/settings/mcp-servers');
  37  |     await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  38  |   });
  39  | 
  40  |   test('users page loads', async ({ page }) => {
  41  |     await page.goto('/settings/users');
  42  |     await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  43  |   });
  44  | 
  45  |   test('knowledge page loads', async ({ page }) => {
  46  |     await page.goto('/settings/knowledge');
  47  |     await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  48  |   });
  49  | 
  50  |   // ═══════════════════════════════════════════════════════════════
  51  |   // ─── Settings hub navigation ──────────────────────────────────
  52  |   // ═══════════════════════════════════════════════════════════════
  53  | 
  54  |   test('settings hub tiles link to the right pages', async ({ page }) => {
  55  |     // Admin sees all tiles (admin user from the auth state)
  56  |     const expectedTiles: Array<[string, string]> = [
  57  |       ['Secrets', '/settings/secrets'],
  58  |       ['Environment Variables', '/settings/env-vars'],
  59  |       ['LLM Endpoints', '/settings/endpoints'],
  60  |       ['MCP Servers', '/settings/mcp-servers'],
  61  |       ['Knowledge Bases', '/settings/knowledge'],
  62  |       ['Secret Vaults', '/settings/secret-vaults'],
  63  |       ['Users', '/settings/users'],
  64  |       ['Groups', '/settings/groups'],
  65  |       ['Global Context', '/settings/global-context'],
  66  |       ['Pending Approvals', '/settings/executions'],
  67  |       ['SSO / OIDC', '/settings/sso'],
  68  |     ];
  69  | 
  70  |     await page.goto('/settings');
  71  |     await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });
  72  | 
  73  |     for (const [title, href] of expectedTiles) {
  74  |       const link = page.getByRole('link', { name: title });
  75  |       await expect(link).toBeVisible({ timeout: 5000 });
  76  |       await expect(link).toHaveAttribute('href', href);
  77  |     }
  78  |   });
  79  | 
  80  |   // ═══════════════════════════════════════════════════════════════
  81  |   // ─── LLM Endpoints CRUD via UI ────────────────────────────────
  82  |   // ═══════════════════════════════════════════════════════════════
  83  | 
  84  |   test('endpoints page: create, edit and delete an endpoint via UI', async ({ page, request }) => {
  85  |     const name = `E2E Endpoint ${Date.now()}`;
  86  |     const editedName = `${name} Edited`;
  87  | 
  88  |     await page.goto('/settings/endpoints');
  89  |     await expect(page.locator('[data-testid="endpoints-heading"]')).toBeVisible({ timeout: 10000 });
  90  | 
  91  |     // ── Create ──
  92  |     await page.locator('[data-testid="add-endpoint-btn"]').click();
  93  |     await expect(page.getByLabel('Name')).toBeVisible({ timeout: 5000 });
  94  |     await page.getByLabel('Name').fill(name);
  95  |     await page.getByLabel('API Key').fill('e2e-key');
  96  |     await page.getByLabel('Base URL').fill('http://mock-llm-e2e:3002/v1');
  97  |     // Add a model and mark it default (required by the backend)
  98  |     await page.getByRole('button', { name: '+ Add model' }).click();
  99  |     await page.getByLabel('Model', { exact: true }).fill('mock-gpt-4');
  100 |     await page.getByText('Set default', { exact: true }).click();
  101 |     await page.getByRole('button', { name: 'Create Endpoint' }).click();
  102 | 
  103 |     // Row appears in the list with the model shown
  104 |     await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });
> 105 |     await expect(page.getByText('mock-gpt-4')).toBeVisible({ timeout: 5000 });
      |                                                ^ Error: expect(locator).toBeVisible() failed
  106 | 
  107 |     // Verified via API
  108 |     const listRes = await request.get(`${API_URL}/llm-endpoints`);
  109 |     const endpoints = await listRes.json();
  110 |     const created = endpoints.find((e: any) => e.name === name);
  111 |     expect(created).toBeDefined();
  112 |     expect(created.default_model).toBe('mock-gpt-4');
  113 |     expect(created.base_url).toBe('http://mock-llm-e2e:3002/v1');
  114 |     cleanupEndpointIds.push(created.id);
  115 | 
  116 |     // ── Edit ──
  117 |     const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
  118 |     await row.getByRole('button', { name: 'Edit' }).click();
  119 |     await expect(page.getByLabel('Name')).toHaveValue(name, { timeout: 5000 });
  120 |     await page.getByLabel('Name').fill(editedName);
  121 |     await page.getByRole('button', { name: 'Update Endpoint' }).click();
  122 |     await expect(page.getByRole('heading', { name: editedName })).toBeVisible({ timeout: 5000 });
  123 | 
  124 |     const edited = await (await request.get(`${API_URL}/llm-endpoints/${created.id}`)).json();
  125 |     expect(edited.name).toBe(editedName);
  126 |     expect(edited.default_model).toBe('mock-gpt-4');
  127 | 
  128 |     // ── Delete ──
  129 |     const editedRow = page.locator('div.bg-surface.rounded-lg', { hasText: editedName }).first();
  130 |     await editedRow.getByRole('button', { name: 'Delete' }).click();
  131 |     const dialog = page.getByRole('dialog');
  132 |     await expect(dialog.getByText('Delete endpoint?')).toBeVisible({ timeout: 5000 });
  133 |     await dialog.getByRole('button', { name: 'Delete' }).click();
  134 | 
  135 |     await expect(page.getByRole('heading', { name: editedName })).not.toBeVisible({ timeout: 5000 });
  136 | 
  137 |     const afterDelete = await (await request.get(`${API_URL}/llm-endpoints`)).json();
  138 |     expect(afterDelete.find((e: any) => e.id === created.id)).toBeUndefined();
  139 |   });
  140 | 
  141 |   // ═══════════════════════════════════════════════════════════════
  142 |   // ─── MCP Servers CRUD via UI ──────────────────────────────────
  143 |   // ═══════════════════════════════════════════════════════════════
  144 | 
  145 |   test('mcp servers page: create, refresh tools and delete a server via UI', async ({ page, request }) => {
  146 |     const name = `E2E MCP ${Date.now()}`;
  147 |     const url = 'http://mock-mcp-e2e:3003/sse';
  148 | 
  149 |     await page.goto('/settings/mcp-servers');
  150 |     await expect(page.locator('[data-testid="mcp-servers-heading"]')).toBeVisible({ timeout: 10000 });
  151 | 
  152 |     // ── Create ──
  153 |     await page.locator('[data-testid="add-mcp-server-btn"]').click();
  154 |     await expect(page.getByLabel('Name')).toBeVisible({ timeout: 5000 });
  155 |     await page.getByLabel('Name').fill(name);
  156 |     await page.getByLabel('URL').fill(url);
  157 |     await page.getByRole('button', { name: 'Create Server' }).click();
  158 | 
  159 |     // Row appears with name and url
  160 |     const row = page.locator('div.bg-surface.rounded-lg', { hasText: name }).first();
  161 |     await expect(row.getByRole('heading', { name })).toBeVisible({ timeout: 5000 });
  162 |     await expect(row.getByText(url, { exact: true })).toBeVisible({ timeout: 5000 });
  163 | 
  164 |     // Verified via API
  165 |     const listRes = await request.get(`${API_URL}/mcp-servers`);
  166 |     const servers = await listRes.json();
  167 |     const created = servers.find((s: any) => s.name === name);
  168 |     expect(created).toBeDefined();
  169 |     expect(created.url).toBe(url);
  170 |     expect(created.enabled).toBe(true);
  171 |     cleanupMcpIds.push(created.id);
  172 | 
  173 |     // ── Refresh tools (mock-mcp advertises the 'echo' tool) ──
  174 |     await row.getByRole('button', { name: 'Refresh' }).click();
  175 |     await expect
  176 |       .poll(async () => {
  177 |         const res = await request.get(`${API_URL}/mcp-servers/${created.id}`);
  178 |         const srv = await res.json();
  179 |         return srv.tools && srv.tools.length > 0;
  180 |       }, { timeout: 15000 })
  181 |       .toBe(true);
  182 | 
  183 |     const refreshed = await (await request.get(`${API_URL}/mcp-servers/${created.id}`)).json();
  184 |     expect(refreshed.tools.map((t: any) => t.name)).toContain('echo');
  185 | 
  186 |     // UI reflects the tool count
  187 |     await expect(row.getByText('1 tool', { exact: true })).toBeVisible({ timeout: 5000 });
  188 | 
  189 |     // ── Delete ──
  190 |     await row.getByRole('button', { name: 'Delete' }).click();
  191 |     const dialog = page.getByRole('dialog');
  192 |     await expect(dialog.getByText('Delete MCP server?')).toBeVisible({ timeout: 5000 });
  193 |     await dialog.getByRole('button', { name: 'Delete' }).click();
  194 |     await expect(row).not.toBeVisible({ timeout: 5000 });
  195 | 
  196 |     const afterDelete = await (await request.get(`${API_URL}/mcp-servers`)).json();
  197 |     expect(afterDelete.find((s: any) => s.id === created.id)).toBeUndefined();
  198 |   });
  199 | 
  200 |   // ═══════════════════════════════════════════════════════════════
  201 |   // ─── Group filter tests ──────────────────────────────────────
  202 |   // ═══════════════════════════════════════════════════════════════
  203 | 
  204 |   test('endpoints page group filter works', async ({ page, request }) => {
  205 |     const gRes = await request.post(`${API_URL}/groups`, { data: { name: `EP-Group-${Date.now()}` } });
```
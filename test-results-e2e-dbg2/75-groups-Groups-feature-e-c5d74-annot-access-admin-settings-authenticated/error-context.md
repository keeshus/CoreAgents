# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> editor role can create flows but cannot access admin settings
- Location: test/e2e/75-groups.spec.ts:452:3

# Error details

```
TypeError: request.newContext is not a function
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "arrow_back Back" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e7]: arrow_back
          - generic [ref=e8]: Back
        - generic [ref=e9]:
          - heading "Settings" [level=1] [ref=e10]
          - paragraph [ref=e11]: Manage your central resources
      - generic [ref=e12]:
        - link "key Secrets Manage app-wide, group, and flow-scoped secrets for secure credential storage" [ref=e13] [cursor=pointer]:
          - /url: /settings/secrets
          - generic [ref=e14]:
            - generic [ref=e15]: key
            - generic [ref=e16]:
              - paragraph [ref=e17]: Secrets
              - paragraph [ref=e18]: Manage app-wide, group, and flow-scoped secrets for secure credential storage
        - link "settings_applications Environment Variables Manage environment variables for app-wide and group-level configuration" [ref=e19] [cursor=pointer]:
          - /url: /settings/env-vars
          - generic [ref=e20]:
            - generic [ref=e21]: settings_applications
            - generic [ref=e22]:
              - paragraph [ref=e23]: Environment Variables
              - paragraph [ref=e24]: Manage environment variables for app-wide and group-level configuration
        - link "memory LLM Endpoints Manage your LLM provider connections — Anthropic, OpenAI, and LiteLLM" [ref=e25] [cursor=pointer]:
          - /url: /settings/endpoints
          - generic [ref=e26]:
            - generic [ref=e27]: memory
            - generic [ref=e28]:
              - paragraph [ref=e29]: LLM Endpoints
              - paragraph [ref=e30]: Manage your LLM provider connections — Anthropic, OpenAI, and LiteLLM
        - link "dns MCP Servers Configure Model Context Protocol servers and their available tools" [ref=e31] [cursor=pointer]:
          - /url: /settings/mcp-servers
          - generic [ref=e32]:
            - generic [ref=e33]: dns
            - generic [ref=e34]:
              - paragraph [ref=e35]: MCP Servers
              - paragraph [ref=e36]: Configure Model Context Protocol servers and their available tools
        - link "book Knowledge Bases Upload documents, manage collections, and configure RAG retrieval" [ref=e37] [cursor=pointer]:
          - /url: /settings/knowledge
          - generic [ref=e38]:
            - generic [ref=e39]: book
            - generic [ref=e40]:
              - paragraph [ref=e41]: Knowledge Bases
              - paragraph [ref=e42]: Upload documents, manage collections, and configure RAG retrieval
        - link "group Groups Manage user groups for flow visibility and HITL assignment" [ref=e43] [cursor=pointer]:
          - /url: /settings/groups
          - generic [ref=e44]:
            - generic [ref=e45]: group
            - generic [ref=e46]:
              - paragraph [ref=e47]: Groups
              - paragraph [ref=e48]: Manage user groups for flow visibility and HITL assignment
    - button "chat" [ref=e49] [cursor=pointer]:
      - generic [ref=e50]: chat
    - button "dark_mode" [ref=e51] [cursor=pointer]:
      - generic [ref=e52]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e58] [cursor=pointer]:
    - img [ref=e59]
  - alert [ref=e62]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { registerUser, createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
  3   | import { getAuthCookie, getAdminAuthFile } from './helpers/auth';
  4   | 
  5   | const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
  6   | 
  7   | test.describe('Groups feature', () => {
  8   |   let createdGroupIds: string[] = [];
  9   |   let cleanupUserIds: string[] = [];
  10  | 
  11  |   test.afterEach(async ({ request }) => {
  12  |     // The shared `request` fixture may hold a non-admin session if the test
  13  |     // logged the browser in as a reader/editor — admin-only deletes (groups,
  14  |     // users) need a dedicated admin context from the saved auth state.
> 15  |     const adminCtx = await request.newContext({ storageState: getAdminAuthFile() });
      |                                    ^ TypeError: request.newContext is not a function
  16  |     try {
  17  |       for (const gId of createdGroupIds) {
  18  |         await adminCtx.delete(`${API_URL}/groups/${gId}`).catch(() => {});
  19  |       }
  20  |       createdGroupIds = [];
  21  |       for (const uId of cleanupUserIds) {
  22  |         await adminCtx.delete(`${API_URL}/users/${uId}`).catch(() => {});
  23  |       }
  24  |       cleanupUserIds = [];
  25  |     } finally {
  26  |       await adminCtx.dispose();
  27  |     }
  28  |   });
  29  | 
  30  |   // ─── Settings page navigation ──────────────────────────────────────
  31  | 
  32  |   test('settings page shows Groups link', async ({ page }) => {
  33  |     await page.goto('/settings');
  34  |     const link = page.locator('a').filter({ hasText: 'Groups' }).first();
  35  |     await expect(link).toBeVisible();
  36  |     await expect(link).toHaveAttribute('href', '/settings/groups');
  37  |   });
  38  | 
  39  |   test('settings page shows SSO link for admin', async ({ page }) => {
  40  |     await page.goto('/settings');
  41  |     const link = page.locator('a').filter({ hasText: 'SSO / OIDC' }).first();
  42  |     await expect(link).toBeVisible();
  43  |     await expect(link).toHaveAttribute('href', '/settings/sso');
  44  |   });
  45  | 
  46  |   test('groups settings page loads', async ({ page }) => {
  47  |     await page.goto('/settings/groups');
  48  |     await expect(page.locator('h1').filter({ hasText: 'Groups' }).first()).toBeVisible({ timeout: 10000 });
  49  |   });
  50  | 
  51  |   test('SSO config page loads for admin', async ({ page }) => {
  52  |     await page.goto('/settings/sso');
  53  |     await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });
  54  |   });
  55  | 
  56  |   // ─── Group CRUD via UI ─────────────────────────────────────────────
  57  | 
  58  |   test('create a group via UI', async ({ page }) => {
  59  |     await page.goto('/settings/groups');
  60  |     await expect(page.locator('h1').filter({ hasText: 'Groups' }).first()).toBeVisible({ timeout: 10000 });
  61  | 
  62  |     await page.getByRole('button', { name: 'Create Group' }).first().click();
  63  |     await page.getByLabel('Name').fill('E2E UI Group');
  64  |     await page.getByLabel('Description').fill('Created during E2E test');
  65  |     await page.getByRole('button', { name: 'Create Group' }).last().click();
  66  | 
  67  |     await expect(page.getByText('E2E UI Group')).toBeVisible({ timeout: 5000 });
  68  |   });
  69  | 
  70  |   test('edit a group name via UI', async ({ page, request }) => {
  71  |     const res = await request.post(`${API_URL}/groups`, {
  72  |       data: { name: 'Edit Test Group', description: 'Will be renamed' },
  73  |     });
  74  |     expect(res.status()).toBe(201);
  75  |     const group = await res.json();
  76  |     createdGroupIds.push(group.id);
  77  | 
  78  |     await page.goto('/settings/groups');
  79  |     await expect(page.getByText('Edit Test Group')).toBeVisible({ timeout: 10000 });
  80  | 
  81  |     // Click the edit icon button (first button containing "edit" material icon)
  82  |     await page.locator('[data-testid="group-edit-btn"]').first().click();
  83  |     await expect(page.getByText('Edit Group')).toBeVisible();
  84  |     await page.getByLabel('Name').fill('Renamed Group');
  85  |     await page.getByRole('button', { name: 'Save' }).click();
  86  | 
  87  |     await expect(page.getByText('Renamed Group')).toBeVisible({ timeout: 5000 });
  88  |   });
  89  | 
  90  |   test('delete a group via UI', async ({ page, request }) => {
  91  |     const res = await request.post(`${API_URL}/groups`, {
  92  |       data: { name: 'Delete Test Group' },
  93  |     });
  94  |     expect(res.status()).toBe(201);
  95  |     const group = await res.json();
  96  |     createdGroupIds.push(group.id);
  97  | 
  98  |     await page.goto('/settings/groups');
  99  |     await expect(page.getByText('Delete Test Group')).toBeVisible({ timeout: 10000 });
  100 | 
  101 |     // Click delete button
  102 |     await page.locator('[data-testid="group-delete-btn"]').first().click();
  103 |     await expect(page.getByText('Delete group?')).toBeVisible();
  104 |     await page.getByRole('button', { name: 'Delete' }).click();
  105 | 
  106 |     await expect(page.getByText('Delete Test Group')).not.toBeVisible({ timeout: 5000 });
  107 |     createdGroupIds = createdGroupIds.filter(id => id !== group.id);
  108 |   });
  109 | 
  110 |   test('expand group shows no members message', async ({ page, request }) => {
  111 |     const res = await request.post(`${API_URL}/groups`, {
  112 |       data: { name: 'Member Test Group' },
  113 |     });
  114 |     expect(res.status()).toBe(201);
  115 |     const group = await res.json();
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> flow editor group selector saves group_id on save
- Location: test/e2e/75-groups.spec.ts:595:3

# Error details

```
TypeError: request.newContext is not a function
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
            - text: Editor-Group-Save-1785587492114
          - generic: Flow name
        - generic [ref=e11]:
          - textbox "Description" [ref=e13]:
            - /placeholder: " "
          - generic: Description
        - button "settings" [ref=e14] [cursor=pointer]:
          - generic [ref=e15]: settings
      - application [ref=e19]:
        - img
        - generic "Control Panel" [ref=e22]:
          - button "Zoom In" [ref=e23] [cursor=pointer]:
            - img [ref=e24]
          - button "Zoom Out" [ref=e26] [cursor=pointer]:
            - img [ref=e27]
          - button "Fit View" [ref=e29] [cursor=pointer]:
            - img [ref=e30]
          - button "Toggle Interactivity" [ref=e32] [cursor=pointer]:
            - img [ref=e33]
        - img "Mini Map" [ref=e36]
      - generic:
        - button "add" [ref=e38] [cursor=pointer]:
          - generic [ref=e39]: add
        - generic [ref=e40]: Add Node
      - generic [ref=e41]:
        - button "undo Undo" [disabled] [ref=e42]:
          - generic [ref=e43]: undo
          - text: Undo
        - separator [ref=e44]
        - button "redo Redo" [disabled] [ref=e45]:
          - generic [ref=e46]: redo
          - text: Redo
        - separator [ref=e47]
        - link "history Runs" [ref=e48] [cursor=pointer]:
          - /url: /flows/1b12d7d2-ef71-4abc-bf50-9155a1a10f0e/executions
          - generic [ref=e49]: history
          - text: Runs
        - button "bug_report Debug" [ref=e50] [cursor=pointer]:
          - generic [ref=e51]: bug_report
          - text: Debug
        - separator [ref=e52]
        - button "dark_mode Dark" [ref=e53] [cursor=pointer]:
          - generic [ref=e54]: dark_mode
          - text: Dark
        - separator [ref=e55]
        - button "save Save" [disabled] [ref=e56]:
          - generic [ref=e57]: save
          - text: Save
      - generic [ref=e59]:
        - generic [ref=e60]:
          - heading "Flow Settings" [level=2] [ref=e61]
          - button "close" [ref=e62] [cursor=pointer]:
            - generic [ref=e63]: close
        - generic [ref=e64]:
          - generic [ref=e65]:
            - generic [ref=e66]:
              - textbox "Flow name" [ref=e68]:
                - /placeholder: " "
                - text: Editor-Group-Save-1785587492114
              - generic: Flow name
            - generic [ref=e69]:
              - generic [ref=e70]: Group
              - button "Editor-Save-Group-1785587492272 arrow_drop_down" [ref=e71] [cursor=pointer]:
                - generic [ref=e72]: Editor-Save-Group-1785587492272
                - generic [ref=e73]: arrow_drop_down
          - generic [ref=e74]:
            - textbox "Description" [ref=e76]:
              - /placeholder: " "
            - generic: Description
          - generic [ref=e77]:
            - generic [ref=e78]: Flow Context
            - textbox "Context for this specific flow..." [ref=e79]
            - paragraph [ref=e80]: This context is injected between the group context and the agent contexts.
          - generic [ref=e81]:
            - generic [ref=e82]: Flow Secrets
            - generic [ref=e83]:
              - textbox "Secret name" [ref=e84]
              - generic [ref=e85]:
                - button "Core" [ref=e86] [cursor=pointer]
                - button "CyberArk" [ref=e87] [cursor=pointer]
              - textbox "Value" [ref=e88]
              - button "add" [ref=e89] [cursor=pointer]:
                - generic [ref=e90]: add
            - paragraph [ref=e91]: "Secrets are encrypted at rest. Use {{secrets.core.flow:NAME}} in templates."
          - generic [ref=e92]:
            - generic [ref=e93]: Environment Variables
            - paragraph [ref=e94]: "Available as {{env.NAME}} in templates and $NAME in bash commands."
            - generic [ref=e95]:
              - textbox "Variable name" [ref=e96]
              - combobox [ref=e97]:
                - option "Static" [selected]
                - option "Core Secret"
                - option "CyberArk"
              - textbox "Value" [ref=e98]
              - button "add" [ref=e99] [cursor=pointer]:
                - generic [ref=e100]: add
    - button "chat" [ref=e101] [cursor=pointer]:
      - generic [ref=e102]: chat
  - button "Open Next.js Dev Tools" [ref=e108] [cursor=pointer]:
    - img [ref=e109]
  - alert [ref=e112]: /flows/1b12d7d2-ef71-4abc-bf50-9155a1a10f0e/edit
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
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> HITL node config shows group assignment option
- Location: test/e2e/75-groups.spec.ts:225:3

# Error details

```
TypeError: request.newContext is not a function
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
            - text: HITL-Group-Test-1785587296322
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
              - generic:
                - generic:
                  - generic:
                    - img:
                      - group [ref=e13] [cursor=pointer]
                    - generic:
                      - group [ref=e16]:
                        - generic [ref=e17]:
                          - generic [ref=e19]: Trigger
                          - generic [ref=e20]:
                            - generic [ref=e21]:
                              - generic [ref=e22]: Manual
                              - paragraph [ref=e23]: Run/Debug button
                            - generic [ref=e24]: "{ message, ... }→ next node"
                      - group [ref=e26]:
                        - generic [ref=e27]:
                          - generic [ref=e31]: HITL
                          - generic [ref=e32]:
                            - generic [ref=e33]:
                              - paragraph [ref=e34]: Flow pauses here for human approval
                              - paragraph [ref=e35]: Approve?
                            - generic [ref=e36]:
                              - generic [ref=e37]:
                                - generic [ref=e38]: pause
                                - text: pause → route
                              - generic [ref=e39]: 1 path · unlimited
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
        - button [ref=e42] [cursor=pointer]:
          - generic [ref=e43]: add
        - generic [ref=e44]: Add Node
      - generic [ref=e45]:
        - button [disabled] [ref=e46]:
          - generic [ref=e47]: undo
          - text: Undo
        - separator [ref=e48]
        - button [disabled] [ref=e49]:
          - generic [ref=e50]: redo
          - text: Redo
        - separator [ref=e51]
        - link [ref=e52] [cursor=pointer]:
          - /url: /flows/ed24cce7-292b-49a9-8f84-ef7bbfb1fc62/executions
          - generic [ref=e53]: history
          - text: Runs
        - button [ref=e54] [cursor=pointer]:
          - generic [ref=e55]: bug_report
          - text: Debug
        - separator [ref=e56]
        - button [ref=e57] [cursor=pointer]:
          - generic [ref=e58]: dark_mode
          - text: Dark
        - separator [ref=e59]
        - button [ref=e60] [cursor=pointer]:
          - generic [ref=e61]: save
          - text: Save
    - button:
      - generic: chat
  - button [ref=e67] [cursor=pointer]:
    - img [ref=e68]
  - generic:
    - alert: /flows/ed24cce7-292b-49a9-8f84-ef7bbfb1fc62/edit
  - dialog:
    - generic:
      - generic:
        - generic: Human in the Loop
        - generic:
          - generic:
            - textbox:
              - /placeholder: " "
              - text: HITL
          - generic: Node name
      - generic:
        - button:
          - generic: delete
          - text: Delete
        - button:
          - generic:
            - generic: close
            - text: Close
    - generic:
      - generic:
        - heading [level=4]: Available Variables
        - paragraph:
          - text: Use these as
          - code: "{{input.Label.field}}"
          - text: in templates below.
        - generic:
          - generic:
            - generic:
              - generic: input
              - generic: Trigger
              - generic: (1 fields)
            - generic:
              - generic:
                - generic: message
                - generic: ": any"
      - generic:
        - generic:
          - generic: Mode
          - generic:
            - button: Simple
            - button: Custom
        - generic:
          - text: Prompt for the User
          - generic:
            - generic:
              - generic:
                - textbox:
                  - /placeholder: Please review the generated content before proceeding...
                  - text: Approve?
        - generic:
          - generic: Assignment
          - generic:
            - combobox [expanded]:
              - generic: Specific user
              - generic:
                - generic: arrow_drop_down
            - generic: Assignment type
        - generic:
          - checkbox [checked]
          - generic: Allow reviewer feedback
          - generic: (text input field)
        - generic:
          - generic:
            - spinbutton: "0"
          - generic: Max iterations
          - paragraph: When exceeded, flow exits through the red max iterations handle. (0 = unlimited)
  - listbox [ref=e72]:
    - option "Specific user" [active] [selected] [ref=e73] [cursor=pointer]
    - option "Specific group" [ref=e74] [cursor=pointer]
    - option "Specific role" [ref=e75] [cursor=pointer]
    - option "Multi-approver" [ref=e76] [cursor=pointer]
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
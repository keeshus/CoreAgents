# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> users page shows Groups column for admin
- Location: test/e2e/75-groups.spec.ts:216:3

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
          - /url: /settings
          - generic [ref=e7]: arrow_back
          - generic [ref=e8]: Back
        - generic [ref=e9]:
          - heading "Users" [level=1] [ref=e10]
          - paragraph [ref=e11]: Manage user accounts and roles
        - button "add Create User" [ref=e12] [cursor=pointer]:
          - generic [ref=e13]: add
          - text: Create User
      - table [ref=e15]:
        - rowgroup [ref=e16]:
          - row "Name Email Role Provider Groups Last Login" [ref=e17]:
            - columnheader "Name" [ref=e18]
            - columnheader "Email" [ref=e19]
            - columnheader "Role" [ref=e20]
            - columnheader "Provider" [ref=e21]
            - columnheader "Groups" [ref=e22]
            - columnheader "Last Login" [ref=e23]
            - columnheader [ref=e24]
        - rowgroup [ref=e25]:
          - row "Role-Change-User-1785587477098 rolechange-1785587477098@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e26]:
            - cell "Role-Change-User-1785587477098" [ref=e27]
            - cell "rolechange-1785587477098@test.local" [ref=e28]
            - cell "Role" [ref=e29]:
              - generic [ref=e30]:
                - combobox [ref=e31] [cursor=pointer]:
                  - generic [ref=e32]: editor
                  - generic [ref=e34]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e35]
            - cell "—" [ref=e36]:
              - generic [ref=e38]: —
            - cell "1-8-2026" [ref=e39]
            - cell "group Groups delete Delete" [ref=e40]:
              - generic [ref=e41]:
                - button "group Groups" [ref=e42] [cursor=pointer]:
                  - generic [ref=e43]: group
                  - text: Groups
                - button "delete Delete" [ref=e44] [cursor=pointer]:
                  - generic [ref=e45]: delete
                  - text: Delete
          - row "Add-Remove-User-1785587475613 addremove-1785587475614@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e46]:
            - cell "Add-Remove-User-1785587475613" [ref=e47]
            - cell "addremove-1785587475614@test.local" [ref=e48]
            - cell "Role" [ref=e49]:
              - generic [ref=e50]:
                - combobox [ref=e51] [cursor=pointer]:
                  - generic [ref=e52]: reader
                  - generic [ref=e54]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e55]
            - cell "—" [ref=e56]:
              - generic [ref=e58]: —
            - cell "1-8-2026" [ref=e59]
            - cell "group Groups delete Delete" [ref=e60]:
              - generic [ref=e61]:
                - button "group Groups" [ref=e62] [cursor=pointer]:
                  - generic [ref=e63]: group
                  - text: Groups
                - button "delete Delete" [ref=e64] [cursor=pointer]:
                  - generic [ref=e65]: delete
                  - text: Delete
          - row "E2E Register User e2e-register-1785587422621@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e66]:
            - cell "E2E Register User" [ref=e67]
            - cell "e2e-register-1785587422621@test.local" [ref=e68]
            - cell "Role" [ref=e69]:
              - generic [ref=e70]:
                - combobox [ref=e71] [cursor=pointer]:
                  - generic [ref=e72]: reader
                  - generic [ref=e74]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e75]
            - cell "—" [ref=e76]:
              - generic [ref=e78]: —
            - cell "1-8-2026" [ref=e79]
            - cell "group Groups delete Delete" [ref=e80]:
              - generic [ref=e81]:
                - button "group Groups" [ref=e82] [cursor=pointer]:
                  - generic [ref=e83]: group
                  - text: Groups
                - button "delete Delete" [ref=e84] [cursor=pointer]:
                  - generic [ref=e85]: delete
                  - text: Delete
          - row "Outsider outsider-1785587315369@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e86]:
            - cell "Outsider" [ref=e87]
            - cell "outsider-1785587315369@test.local" [ref=e88]
            - cell "Role" [ref=e89]:
              - generic [ref=e90]:
                - combobox [ref=e91] [cursor=pointer]:
                  - generic [ref=e92]: reader
                  - generic [ref=e94]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e95]
            - cell "—" [ref=e96]:
              - generic [ref=e98]: —
            - cell "1-8-2026" [ref=e99]
            - cell "group Groups delete Delete" [ref=e100]:
              - generic [ref=e101]:
                - button "group Groups" [ref=e102] [cursor=pointer]:
                  - generic [ref=e103]: group
                  - text: Groups
                - button "delete Delete" [ref=e104] [cursor=pointer]:
                  - generic [ref=e105]: delete
                  - text: Delete
          - row "HITL Member hitl-member-1785587314728@test.local Role local HITL-Group-1785587314680 1-8-2026 group Groups delete Delete" [ref=e106]:
            - cell "HITL Member" [ref=e107]
            - cell "hitl-member-1785587314728@test.local" [ref=e108]
            - cell "Role" [ref=e109]:
              - generic [ref=e110]:
                - combobox [ref=e111] [cursor=pointer]:
                  - generic [ref=e112]: reader
                  - generic [ref=e114]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e115]
            - cell "HITL-Group-1785587314680" [ref=e116]:
              - generic [ref=e118]: HITL-Group-1785587314680
            - cell "1-8-2026" [ref=e119]
            - cell "group Groups delete Delete" [ref=e120]:
              - generic [ref=e121]:
                - button "group Groups" [ref=e122] [cursor=pointer]:
                  - generic [ref=e123]: group
                  - text: Groups
                - button "delete Delete" [ref=e124] [cursor=pointer]:
                  - generic [ref=e125]: delete
                  - text: Delete
          - row "Visibility Reader visibility-1785587311770@test.local Role local Group-A-1785587311722 1-8-2026 group Groups delete Delete" [ref=e126]:
            - cell "Visibility Reader" [ref=e127]
            - cell "visibility-1785587311770@test.local" [ref=e128]
            - cell "Role" [ref=e129]:
              - generic [ref=e130]:
                - combobox [ref=e131] [cursor=pointer]:
                  - generic [ref=e132]: reader
                  - generic [ref=e134]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e135]
            - cell "Group-A-1785587311722" [ref=e136]:
              - generic [ref=e138]: Group-A-1785587311722
            - cell "1-8-2026" [ref=e139]
            - cell "group Groups delete Delete" [ref=e140]:
              - generic [ref=e141]:
                - button "group Groups" [ref=e142] [cursor=pointer]:
                  - generic [ref=e143]: group
                  - text: Groups
                - button "delete Delete" [ref=e144] [cursor=pointer]:
                  - generic [ref=e145]: delete
                  - text: Delete
          - row "Editor Perm Test editor-1785587305579@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e146]:
            - cell "Editor Perm Test" [ref=e147]
            - cell "editor-1785587305579@test.local" [ref=e148]
            - cell "Role" [ref=e149]:
              - generic [ref=e150]:
                - combobox [ref=e151] [cursor=pointer]:
                  - generic [ref=e152]: editor
                  - generic [ref=e154]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e155]
            - cell "—" [ref=e156]:
              - generic [ref=e158]: —
            - cell "1-8-2026" [ref=e159]
            - cell "group Groups delete Delete" [ref=e160]:
              - generic [ref=e161]:
                - button "group Groups" [ref=e162] [cursor=pointer]:
                  - generic [ref=e163]: group
                  - text: Groups
                - button "delete Delete" [ref=e164] [cursor=pointer]:
                  - generic [ref=e165]: delete
                  - text: Delete
          - row "Reader Perm Test reader-1785587304131@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e166]:
            - cell "Reader Perm Test" [ref=e167]
            - cell "reader-1785587304131@test.local" [ref=e168]
            - cell "Role" [ref=e169]:
              - generic [ref=e170]:
                - combobox [ref=e171] [cursor=pointer]:
                  - generic [ref=e172]: reader
                  - generic [ref=e174]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e175]
            - cell "—" [ref=e176]:
              - generic [ref=e178]: —
            - cell "1-8-2026" [ref=e179]
            - cell "group Groups delete Delete" [ref=e180]:
              - generic [ref=e181]:
                - button "group Groups" [ref=e182] [cursor=pointer]:
                  - generic [ref=e183]: group
                  - text: Groups
                - button "delete Delete" [ref=e184] [cursor=pointer]:
                  - generic [ref=e185]: delete
                  - text: Delete
          - row "Remove API removeapi-1785587302295@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e186]:
            - cell "Remove API" [ref=e187]
            - cell "removeapi-1785587302295@test.local" [ref=e188]
            - cell "Role" [ref=e189]:
              - generic [ref=e190]:
                - combobox [ref=e191] [cursor=pointer]:
                  - generic [ref=e192]: reader
                  - generic [ref=e194]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e195]
            - cell "—" [ref=e196]:
              - generic [ref=e198]: —
            - cell "1-8-2026" [ref=e199]
            - cell "group Groups delete Delete" [ref=e200]:
              - generic [ref=e201]:
                - button "group Groups" [ref=e202] [cursor=pointer]:
                  - generic [ref=e203]: group
                  - text: Groups
                - button "delete Delete" [ref=e204] [cursor=pointer]:
                  - generic [ref=e205]: delete
                  - text: Delete
          - row "API Member apimember-1785587301776@test.local Role local Member-API-1785587301756 1-8-2026 group Groups delete Delete" [ref=e206]:
            - cell "API Member" [ref=e207]
            - cell "apimember-1785587301776@test.local" [ref=e208]
            - cell "Role" [ref=e209]:
              - generic [ref=e210]:
                - combobox [ref=e211] [cursor=pointer]:
                  - generic [ref=e212]: reader
                  - generic [ref=e214]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e215]
            - cell "Member-API-1785587301756" [ref=e216]:
              - generic [ref=e218]: Member-API-1785587301756
            - cell "1-8-2026" [ref=e219]
            - cell "group Groups delete Delete" [ref=e220]:
              - generic [ref=e221]:
                - button "group Groups" [ref=e222] [cursor=pointer]:
                  - generic [ref=e223]: group
                  - text: Groups
                - button "delete Delete" [ref=e224] [cursor=pointer]:
                  - generic [ref=e225]: delete
                  - text: Delete
          - row "Role-Change-User-1785587293785 rolechange-1785587293785@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e226]:
            - cell "Role-Change-User-1785587293785" [ref=e227]
            - cell "rolechange-1785587293785@test.local" [ref=e228]
            - cell "Role" [ref=e229]:
              - generic [ref=e230]:
                - combobox [ref=e231] [cursor=pointer]:
                  - generic [ref=e232]: editor
                  - generic [ref=e234]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e235]
            - cell "—" [ref=e236]:
              - generic [ref=e238]: —
            - cell "1-8-2026" [ref=e239]
            - cell "group Groups delete Delete" [ref=e240]:
              - generic [ref=e241]:
                - button "group Groups" [ref=e242] [cursor=pointer]:
                  - generic [ref=e243]: group
                  - text: Groups
                - button "delete Delete" [ref=e244] [cursor=pointer]:
                  - generic [ref=e245]: delete
                  - text: Delete
          - row "Add-Remove-User-1785587292494 addremove-1785587292494@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e246]:
            - cell "Add-Remove-User-1785587292494" [ref=e247]
            - cell "addremove-1785587292494@test.local" [ref=e248]
            - cell "Role" [ref=e249]:
              - generic [ref=e250]:
                - combobox [ref=e251] [cursor=pointer]:
                  - generic [ref=e252]: reader
                  - generic [ref=e254]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e255]
            - cell "—" [ref=e256]:
              - generic [ref=e258]: —
            - cell "1-8-2026" [ref=e259]
            - cell "group Groups delete Delete" [ref=e260]:
              - generic [ref=e261]:
                - button "group Groups" [ref=e262] [cursor=pointer]:
                  - generic [ref=e263]: group
                  - text: Groups
                - button "delete Delete" [ref=e264] [cursor=pointer]:
                  - generic [ref=e265]: delete
                  - text: Delete
          - row "E2E Register User e2e-register-1785587239745@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e266]:
            - cell "E2E Register User" [ref=e267]
            - cell "e2e-register-1785587239745@test.local" [ref=e268]
            - cell "Role" [ref=e269]:
              - generic [ref=e270]:
                - combobox [ref=e271] [cursor=pointer]:
                  - generic [ref=e272]: reader
                  - generic [ref=e274]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e275]
            - cell "—" [ref=e276]:
              - generic [ref=e278]: —
            - cell "1-8-2026" [ref=e279]
            - cell "group Groups delete Delete" [ref=e280]:
              - generic [ref=e281]:
                - button "group Groups" [ref=e282] [cursor=pointer]:
                  - generic [ref=e283]: group
                  - text: Groups
                - button "delete Delete" [ref=e284] [cursor=pointer]:
                  - generic [ref=e285]: delete
                  - text: Delete
          - row "E2E Test User e2e@test.local Role local — 1-8-2026 group Groups delete Delete" [ref=e286]:
            - cell "E2E Test User" [ref=e287]
            - cell "e2e@test.local" [ref=e288]
            - cell "Role" [ref=e289]:
              - generic [ref=e290]:
                - combobox [ref=e291] [cursor=pointer]:
                  - generic [ref=e292]: admin
                  - generic [ref=e294]: arrow_drop_down
                - generic: Role
            - cell "local" [ref=e295]
            - cell "—" [ref=e296]:
              - generic [ref=e298]: —
            - cell "1-8-2026" [ref=e299]
            - cell "group Groups delete Delete" [ref=e300]:
              - generic [ref=e301]:
                - button "group Groups" [ref=e302] [cursor=pointer]:
                  - generic [ref=e303]: group
                  - text: Groups
                - button "delete Delete" [ref=e304] [cursor=pointer]:
                  - generic [ref=e305]: delete
                  - text: Delete
    - button "chat" [ref=e306] [cursor=pointer]:
      - generic [ref=e307]: chat
    - button "dark_mode" [ref=e308] [cursor=pointer]:
      - generic [ref=e309]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e315] [cursor=pointer]:
    - img [ref=e316]
  - alert [ref=e319]
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
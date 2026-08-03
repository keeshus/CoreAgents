# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> groups settings page loads
- Location: test/e2e/75-groups.spec.ts:46:3

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
          - heading "Groups" [level=1] [ref=e10]
          - paragraph [ref=e11]: Manage user groups for flow visibility and HITL assignment
        - button "add Create Group" [ref=e12] [cursor=pointer]:
          - generic [ref=e13]: add
          - text: Create Group
      - generic [ref=e15]:
        - textbox "Search groups" [ref=e17]:
          - /placeholder: " "
        - generic: Search groups
      - generic [ref=e18]:
        - button "expand_more Conjur-Group-1785587323037 local No description 0 members edit delete" [ref=e20] [cursor=pointer]:
          - generic [ref=e21]:
            - generic [ref=e22]: expand_more
            - generic [ref=e23]:
              - text: Conjur-Group-1785587323037
              - generic [ref=e24]: local
              - paragraph [ref=e25]: No description
          - generic [ref=e26]:
            - generic [ref=e27]: 0 members
            - generic [ref=e28]:
              - button "edit" [ref=e29]:
                - generic [ref=e30]: edit
              - button "delete" [ref=e31]:
                - generic [ref=e32]: delete
        - button "expand_more Exec-Group-1785587316469 local No description 0 members edit delete" [ref=e34] [cursor=pointer]:
          - generic [ref=e35]:
            - generic [ref=e36]: expand_more
            - generic [ref=e37]:
              - text: Exec-Group-1785587316469
              - generic [ref=e38]: local
              - paragraph [ref=e39]: No description
          - generic [ref=e40]:
            - generic [ref=e41]: 0 members
            - generic [ref=e42]:
              - button "edit" [ref=e43]:
                - generic [ref=e44]: edit
              - button "delete" [ref=e45]:
                - generic [ref=e46]: delete
        - button "expand_more HITL-Group-1785587314680 local No description 0 members edit delete" [ref=e48] [cursor=pointer]:
          - generic [ref=e49]:
            - generic [ref=e50]: expand_more
            - generic [ref=e51]:
              - text: HITL-Group-1785587314680
              - generic [ref=e52]: local
              - paragraph [ref=e53]: No description
          - generic [ref=e54]:
            - generic [ref=e55]: 0 members
            - generic [ref=e56]:
              - button "edit" [ref=e57]:
                - generic [ref=e58]: edit
              - button "delete" [ref=e59]:
                - generic [ref=e60]: delete
        - button "expand_more Group-B-1785587311748 local No description 0 members edit delete" [ref=e62] [cursor=pointer]:
          - generic [ref=e63]:
            - generic [ref=e64]: expand_more
            - generic [ref=e65]:
              - text: Group-B-1785587311748
              - generic [ref=e66]: local
              - paragraph [ref=e67]: No description
          - generic [ref=e68]:
            - generic [ref=e69]: 0 members
            - generic [ref=e70]:
              - button "edit" [ref=e71]:
                - generic [ref=e72]: edit
              - button "delete" [ref=e73]:
                - generic [ref=e74]: delete
        - button "expand_more Group-A-1785587311722 local No description 0 members edit delete" [ref=e76] [cursor=pointer]:
          - generic [ref=e77]:
            - generic [ref=e78]: expand_more
            - generic [ref=e79]:
              - text: Group-A-1785587311722
              - generic [ref=e80]: local
              - paragraph [ref=e81]: No description
          - generic [ref=e82]:
            - generic [ref=e83]: 0 members
            - generic [ref=e84]:
              - button "edit" [ref=e85]:
                - generic [ref=e86]: edit
              - button "delete" [ref=e87]:
                - generic [ref=e88]: delete
        - button "expand_more Editor-Save-Group-1785587310438 local No description 0 members edit delete" [ref=e90] [cursor=pointer]:
          - generic [ref=e91]:
            - generic [ref=e92]: expand_more
            - generic [ref=e93]:
              - text: Editor-Save-Group-1785587310438
              - generic [ref=e94]: local
              - paragraph [ref=e95]: No description
          - generic [ref=e96]:
            - generic [ref=e97]: 0 members
            - generic [ref=e98]:
              - button "edit" [ref=e99]:
                - generic [ref=e100]: edit
              - button "delete" [ref=e101]:
                - generic [ref=e102]: delete
        - button "expand_more Unique Group Name For Dup Test local No description 0 members edit delete" [ref=e104] [cursor=pointer]:
          - generic [ref=e105]:
            - generic [ref=e106]: expand_more
            - generic [ref=e107]:
              - text: Unique Group Name For Dup Test
              - generic [ref=e108]: local
              - paragraph [ref=e109]: No description
          - generic [ref=e110]:
            - generic [ref=e111]: 0 members
            - generic [ref=e112]:
              - button "edit" [ref=e113]:
                - generic [ref=e114]: edit
              - button "delete" [ref=e115]:
                - generic [ref=e116]: delete
        - button "expand_more Searchable Beta Group local No description 0 members edit delete" [ref=e118] [cursor=pointer]:
          - generic [ref=e119]:
            - generic [ref=e120]: expand_more
            - generic [ref=e121]:
              - text: Searchable Beta Group
              - generic [ref=e122]: local
              - paragraph [ref=e123]: No description
          - generic [ref=e124]:
            - generic [ref=e125]: 0 members
            - generic [ref=e126]:
              - button "edit" [ref=e127]:
                - generic [ref=e128]: edit
              - button "delete" [ref=e129]:
                - generic [ref=e130]: delete
        - button "expand_more Searchable Alpha Group local No description 0 members edit delete" [ref=e132] [cursor=pointer]:
          - generic [ref=e133]:
            - generic [ref=e134]: expand_more
            - generic [ref=e135]:
              - text: Searchable Alpha Group
              - generic [ref=e136]: local
              - paragraph [ref=e137]: No description
          - generic [ref=e138]:
            - generic [ref=e139]: 0 members
            - generic [ref=e140]:
              - button "edit" [ref=e141]:
                - generic [ref=e142]: edit
              - button "delete" [ref=e143]:
                - generic [ref=e144]: delete
        - button "expand_more Flow-Group-1785587307252 local No description 0 members edit delete" [ref=e146] [cursor=pointer]:
          - generic [ref=e147]:
            - generic [ref=e148]: expand_more
            - generic [ref=e149]:
              - text: Flow-Group-1785587307252
              - generic [ref=e150]: local
              - paragraph [ref=e151]: No description
          - generic [ref=e152]:
            - generic [ref=e153]: 0 members
            - generic [ref=e154]:
              - button "edit" [ref=e155]:
                - generic [ref=e156]: edit
              - button "delete" [ref=e157]:
                - generic [ref=e158]: delete
        - button "expand_more Remove-API-1785587302275 local No description 0 members edit delete" [ref=e160] [cursor=pointer]:
          - generic [ref=e161]:
            - generic [ref=e162]: expand_more
            - generic [ref=e163]:
              - text: Remove-API-1785587302275
              - generic [ref=e164]: local
              - paragraph [ref=e165]: No description
          - generic [ref=e166]:
            - generic [ref=e167]: 0 members
            - generic [ref=e168]:
              - button "edit" [ref=e169]:
                - generic [ref=e170]: edit
              - button "delete" [ref=e171]:
                - generic [ref=e172]: delete
        - button "expand_more Member-API-1785587301756 local No description 0 members edit delete" [ref=e174] [cursor=pointer]:
          - generic [ref=e175]:
            - generic [ref=e176]: expand_more
            - generic [ref=e177]:
              - text: Member-API-1785587301756
              - generic [ref=e178]: local
              - paragraph [ref=e179]: No description
          - generic [ref=e180]:
            - generic [ref=e181]: 0 members
            - generic [ref=e182]:
              - button "edit" [ref=e183]:
                - generic [ref=e184]: edit
              - button "delete" [ref=e185]:
                - generic [ref=e186]: delete
        - button "expand_more Updated Name local Updated desc 0 members edit delete" [ref=e188] [cursor=pointer]:
          - generic [ref=e189]:
            - generic [ref=e190]: expand_more
            - generic [ref=e191]:
              - text: Updated Name
              - generic [ref=e192]: local
              - paragraph [ref=e193]: Updated desc
          - generic [ref=e194]:
            - generic [ref=e195]: 0 members
            - generic [ref=e196]:
              - button "edit" [ref=e197]:
                - generic [ref=e198]: edit
              - button "delete" [ref=e199]:
                - generic [ref=e200]: delete
        - button "expand_more Dup-Group-1785587300418 local No description 0 members edit delete" [ref=e202] [cursor=pointer]:
          - generic [ref=e203]:
            - generic [ref=e204]: expand_more
            - generic [ref=e205]:
              - text: Dup-Group-1785587300418
              - generic [ref=e206]: local
              - paragraph [ref=e207]: No description
          - generic [ref=e208]:
            - generic [ref=e209]: 0 members
            - generic [ref=e210]:
              - button "edit" [ref=e211]:
                - generic [ref=e212]: edit
              - button "delete" [ref=e213]:
                - generic [ref=e214]: delete
        - button "expand_more API-Group-1785587299501 local API created 0 members edit delete" [ref=e216] [cursor=pointer]:
          - generic [ref=e217]:
            - generic [ref=e218]: expand_more
            - generic [ref=e219]:
              - text: API-Group-1785587299501
              - generic [ref=e220]: local
              - paragraph [ref=e221]: API created
          - generic [ref=e222]:
            - generic [ref=e223]: 0 members
            - generic [ref=e224]:
              - button "edit" [ref=e225]:
                - generic [ref=e226]: edit
              - button "delete" [ref=e227]:
                - generic [ref=e228]: delete
        - button "expand_more Flow-Editor-Group-1785587297865 local No description 0 members edit delete" [ref=e230] [cursor=pointer]:
          - generic [ref=e231]:
            - generic [ref=e232]: expand_more
            - generic [ref=e233]:
              - text: Flow-Editor-Group-1785587297865
              - generic [ref=e234]: local
              - paragraph [ref=e235]: No description
          - generic [ref=e236]:
            - generic [ref=e237]: 0 members
            - generic [ref=e238]:
              - button "edit" [ref=e239]:
                - generic [ref=e240]: edit
              - button "delete" [ref=e241]:
                - generic [ref=e242]: delete
        - button "expand_more Member-Add-Remove-1785587292474 local No description 0 members edit delete" [ref=e244] [cursor=pointer]:
          - generic [ref=e245]:
            - generic [ref=e246]: expand_more
            - generic [ref=e247]:
              - text: Member-Add-Remove-1785587292474
              - generic [ref=e248]: local
              - paragraph [ref=e249]: No description
          - generic [ref=e250]:
            - generic [ref=e251]: 0 members
            - generic [ref=e252]:
              - button "edit" [ref=e253]:
                - generic [ref=e254]: edit
              - button "delete" [ref=e255]:
                - generic [ref=e256]: delete
        - button "expand_more Member Test Group local No description 0 members edit delete" [ref=e258] [cursor=pointer]:
          - generic [ref=e259]:
            - generic [ref=e260]: expand_more
            - generic [ref=e261]:
              - text: Member Test Group
              - generic [ref=e262]: local
              - paragraph [ref=e263]: No description
          - generic [ref=e264]:
            - generic [ref=e265]: 0 members
            - generic [ref=e266]:
              - button "edit" [ref=e267]:
                - generic [ref=e268]: edit
              - button "delete" [ref=e269]:
                - generic [ref=e270]: delete
        - button "expand_more Renamed Group local Will be renamed 0 members edit delete" [ref=e272] [cursor=pointer]:
          - generic [ref=e273]:
            - generic [ref=e274]: expand_more
            - generic [ref=e275]:
              - text: Renamed Group
              - generic [ref=e276]: local
              - paragraph [ref=e277]: Will be renamed
          - generic [ref=e278]:
            - generic [ref=e279]: 0 members
            - generic [ref=e280]:
              - button "edit" [ref=e281]:
                - generic [ref=e282]: edit
              - button "delete" [ref=e283]:
                - generic [ref=e284]: delete
        - button "expand_more E2E UI Group local Created during E2E test 0 members edit delete" [ref=e286] [cursor=pointer]:
          - generic [ref=e287]:
            - generic [ref=e288]: expand_more
            - generic [ref=e289]:
              - text: E2E UI Group
              - generic [ref=e290]: local
              - paragraph [ref=e291]: Created during E2E test
          - generic [ref=e292]:
            - generic [ref=e293]: 0 members
            - generic [ref=e294]:
              - button "edit" [ref=e295]:
                - generic [ref=e296]: edit
              - button "delete" [ref=e297]:
                - generic [ref=e298]: delete
    - button "chat" [ref=e299] [cursor=pointer]:
      - generic [ref=e300]: chat
    - button "dark_mode" [ref=e301] [cursor=pointer]:
      - generic [ref=e302]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e308] [cursor=pointer]:
    - img [ref=e309]
  - alert [ref=e312]
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
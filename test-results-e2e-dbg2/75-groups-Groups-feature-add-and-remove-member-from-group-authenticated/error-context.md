# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> add and remove member from group
- Location: test/e2e/75-groups.spec.ts:126:3

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
        - generic [ref=e19]:
          - button "expand_less Member-Add-Remove-1785587475595 local No description 0 members edit delete" [ref=e20] [cursor=pointer]:
            - generic [ref=e21]:
              - generic [ref=e22]: expand_less
              - generic [ref=e23]:
                - text: Member-Add-Remove-1785587475595
                - generic [ref=e24]: local
                - paragraph [ref=e25]: No description
            - generic [ref=e26]:
              - generic [ref=e27]: 0 members
              - generic [ref=e28]:
                - button "edit" [ref=e29]:
                  - generic [ref=e30]: edit
                - button "delete" [ref=e31]:
                  - generic [ref=e32]: delete
          - generic [ref=e33]:
            - generic [ref=e34]:
              - generic [ref=e35]: Members
              - button "+ Add member" [ref=e36] [cursor=pointer]
            - paragraph [ref=e37]: No members
        - button "expand_more Edit Test Group local Will be renamed 0 members edit delete" [ref=e39] [cursor=pointer]:
          - generic [ref=e40]:
            - generic [ref=e41]: expand_more
            - generic [ref=e42]:
              - text: Edit Test Group
              - generic [ref=e43]: local
              - paragraph [ref=e44]: Will be renamed
          - generic [ref=e45]:
            - generic [ref=e46]: 0 members
            - generic [ref=e47]:
              - button "edit" [ref=e48]:
                - generic [ref=e49]: edit
              - button "delete" [ref=e50]:
                - generic [ref=e51]: delete
        - button "expand_more Conjur-Group-1785587323037 local No description 0 members edit delete" [ref=e53] [cursor=pointer]:
          - generic [ref=e54]:
            - generic [ref=e55]: expand_more
            - generic [ref=e56]:
              - text: Conjur-Group-1785587323037
              - generic [ref=e57]: local
              - paragraph [ref=e58]: No description
          - generic [ref=e59]:
            - generic [ref=e60]: 0 members
            - generic [ref=e61]:
              - button "edit" [ref=e62]:
                - generic [ref=e63]: edit
              - button "delete" [ref=e64]:
                - generic [ref=e65]: delete
        - button "expand_more Exec-Group-1785587316469 local No description 0 members edit delete" [ref=e67] [cursor=pointer]:
          - generic [ref=e68]:
            - generic [ref=e69]: expand_more
            - generic [ref=e70]:
              - text: Exec-Group-1785587316469
              - generic [ref=e71]: local
              - paragraph [ref=e72]: No description
          - generic [ref=e73]:
            - generic [ref=e74]: 0 members
            - generic [ref=e75]:
              - button "edit" [ref=e76]:
                - generic [ref=e77]: edit
              - button "delete" [ref=e78]:
                - generic [ref=e79]: delete
        - button "expand_more HITL-Group-1785587314680 local No description 0 members edit delete" [ref=e81] [cursor=pointer]:
          - generic [ref=e82]:
            - generic [ref=e83]: expand_more
            - generic [ref=e84]:
              - text: HITL-Group-1785587314680
              - generic [ref=e85]: local
              - paragraph [ref=e86]: No description
          - generic [ref=e87]:
            - generic [ref=e88]: 0 members
            - generic [ref=e89]:
              - button "edit" [ref=e90]:
                - generic [ref=e91]: edit
              - button "delete" [ref=e92]:
                - generic [ref=e93]: delete
        - button "expand_more Group-B-1785587311748 local No description 0 members edit delete" [ref=e95] [cursor=pointer]:
          - generic [ref=e96]:
            - generic [ref=e97]: expand_more
            - generic [ref=e98]:
              - text: Group-B-1785587311748
              - generic [ref=e99]: local
              - paragraph [ref=e100]: No description
          - generic [ref=e101]:
            - generic [ref=e102]: 0 members
            - generic [ref=e103]:
              - button "edit" [ref=e104]:
                - generic [ref=e105]: edit
              - button "delete" [ref=e106]:
                - generic [ref=e107]: delete
        - button "expand_more Group-A-1785587311722 local No description 0 members edit delete" [ref=e109] [cursor=pointer]:
          - generic [ref=e110]:
            - generic [ref=e111]: expand_more
            - generic [ref=e112]:
              - text: Group-A-1785587311722
              - generic [ref=e113]: local
              - paragraph [ref=e114]: No description
          - generic [ref=e115]:
            - generic [ref=e116]: 0 members
            - generic [ref=e117]:
              - button "edit" [ref=e118]:
                - generic [ref=e119]: edit
              - button "delete" [ref=e120]:
                - generic [ref=e121]: delete
        - button "expand_more Editor-Save-Group-1785587310438 local No description 0 members edit delete" [ref=e123] [cursor=pointer]:
          - generic [ref=e124]:
            - generic [ref=e125]: expand_more
            - generic [ref=e126]:
              - text: Editor-Save-Group-1785587310438
              - generic [ref=e127]: local
              - paragraph [ref=e128]: No description
          - generic [ref=e129]:
            - generic [ref=e130]: 0 members
            - generic [ref=e131]:
              - button "edit" [ref=e132]:
                - generic [ref=e133]: edit
              - button "delete" [ref=e134]:
                - generic [ref=e135]: delete
        - button "expand_more Unique Group Name For Dup Test local No description 0 members edit delete" [ref=e137] [cursor=pointer]:
          - generic [ref=e138]:
            - generic [ref=e139]: expand_more
            - generic [ref=e140]:
              - text: Unique Group Name For Dup Test
              - generic [ref=e141]: local
              - paragraph [ref=e142]: No description
          - generic [ref=e143]:
            - generic [ref=e144]: 0 members
            - generic [ref=e145]:
              - button "edit" [ref=e146]:
                - generic [ref=e147]: edit
              - button "delete" [ref=e148]:
                - generic [ref=e149]: delete
        - button "expand_more Searchable Beta Group local No description 0 members edit delete" [ref=e151] [cursor=pointer]:
          - generic [ref=e152]:
            - generic [ref=e153]: expand_more
            - generic [ref=e154]:
              - text: Searchable Beta Group
              - generic [ref=e155]: local
              - paragraph [ref=e156]: No description
          - generic [ref=e157]:
            - generic [ref=e158]: 0 members
            - generic [ref=e159]:
              - button "edit" [ref=e160]:
                - generic [ref=e161]: edit
              - button "delete" [ref=e162]:
                - generic [ref=e163]: delete
        - button "expand_more Searchable Alpha Group local No description 0 members edit delete" [ref=e165] [cursor=pointer]:
          - generic [ref=e166]:
            - generic [ref=e167]: expand_more
            - generic [ref=e168]:
              - text: Searchable Alpha Group
              - generic [ref=e169]: local
              - paragraph [ref=e170]: No description
          - generic [ref=e171]:
            - generic [ref=e172]: 0 members
            - generic [ref=e173]:
              - button "edit" [ref=e174]:
                - generic [ref=e175]: edit
              - button "delete" [ref=e176]:
                - generic [ref=e177]: delete
        - button "expand_more Flow-Group-1785587307252 local No description 0 members edit delete" [ref=e179] [cursor=pointer]:
          - generic [ref=e180]:
            - generic [ref=e181]: expand_more
            - generic [ref=e182]:
              - text: Flow-Group-1785587307252
              - generic [ref=e183]: local
              - paragraph [ref=e184]: No description
          - generic [ref=e185]:
            - generic [ref=e186]: 0 members
            - generic [ref=e187]:
              - button "edit" [ref=e188]:
                - generic [ref=e189]: edit
              - button "delete" [ref=e190]:
                - generic [ref=e191]: delete
        - button "expand_more Remove-API-1785587302275 local No description 0 members edit delete" [ref=e193] [cursor=pointer]:
          - generic [ref=e194]:
            - generic [ref=e195]: expand_more
            - generic [ref=e196]:
              - text: Remove-API-1785587302275
              - generic [ref=e197]: local
              - paragraph [ref=e198]: No description
          - generic [ref=e199]:
            - generic [ref=e200]: 0 members
            - generic [ref=e201]:
              - button "edit" [ref=e202]:
                - generic [ref=e203]: edit
              - button "delete" [ref=e204]:
                - generic [ref=e205]: delete
        - button "expand_more Member-API-1785587301756 local No description 0 members edit delete" [ref=e207] [cursor=pointer]:
          - generic [ref=e208]:
            - generic [ref=e209]: expand_more
            - generic [ref=e210]:
              - text: Member-API-1785587301756
              - generic [ref=e211]: local
              - paragraph [ref=e212]: No description
          - generic [ref=e213]:
            - generic [ref=e214]: 0 members
            - generic [ref=e215]:
              - button "edit" [ref=e216]:
                - generic [ref=e217]: edit
              - button "delete" [ref=e218]:
                - generic [ref=e219]: delete
        - button "expand_more Updated Name local Updated desc 0 members edit delete" [ref=e221] [cursor=pointer]:
          - generic [ref=e222]:
            - generic [ref=e223]: expand_more
            - generic [ref=e224]:
              - text: Updated Name
              - generic [ref=e225]: local
              - paragraph [ref=e226]: Updated desc
          - generic [ref=e227]:
            - generic [ref=e228]: 0 members
            - generic [ref=e229]:
              - button "edit" [ref=e230]:
                - generic [ref=e231]: edit
              - button "delete" [ref=e232]:
                - generic [ref=e233]: delete
        - button "expand_more Dup-Group-1785587300418 local No description 0 members edit delete" [ref=e235] [cursor=pointer]:
          - generic [ref=e236]:
            - generic [ref=e237]: expand_more
            - generic [ref=e238]:
              - text: Dup-Group-1785587300418
              - generic [ref=e239]: local
              - paragraph [ref=e240]: No description
          - generic [ref=e241]:
            - generic [ref=e242]: 0 members
            - generic [ref=e243]:
              - button "edit" [ref=e244]:
                - generic [ref=e245]: edit
              - button "delete" [ref=e246]:
                - generic [ref=e247]: delete
        - button "expand_more API-Group-1785587299501 local API created 0 members edit delete" [ref=e249] [cursor=pointer]:
          - generic [ref=e250]:
            - generic [ref=e251]: expand_more
            - generic [ref=e252]:
              - text: API-Group-1785587299501
              - generic [ref=e253]: local
              - paragraph [ref=e254]: API created
          - generic [ref=e255]:
            - generic [ref=e256]: 0 members
            - generic [ref=e257]:
              - button "edit" [ref=e258]:
                - generic [ref=e259]: edit
              - button "delete" [ref=e260]:
                - generic [ref=e261]: delete
        - button "expand_more Flow-Editor-Group-1785587297865 local No description 0 members edit delete" [ref=e263] [cursor=pointer]:
          - generic [ref=e264]:
            - generic [ref=e265]: expand_more
            - generic [ref=e266]:
              - text: Flow-Editor-Group-1785587297865
              - generic [ref=e267]: local
              - paragraph [ref=e268]: No description
          - generic [ref=e269]:
            - generic [ref=e270]: 0 members
            - generic [ref=e271]:
              - button "edit" [ref=e272]:
                - generic [ref=e273]: edit
              - button "delete" [ref=e274]:
                - generic [ref=e275]: delete
        - button "expand_more Member-Add-Remove-1785587292474 local No description 0 members edit delete" [ref=e277] [cursor=pointer]:
          - generic [ref=e278]:
            - generic [ref=e279]: expand_more
            - generic [ref=e280]:
              - text: Member-Add-Remove-1785587292474
              - generic [ref=e281]: local
              - paragraph [ref=e282]: No description
          - generic [ref=e283]:
            - generic [ref=e284]: 0 members
            - generic [ref=e285]:
              - button "edit" [ref=e286]:
                - generic [ref=e287]: edit
              - button "delete" [ref=e288]:
                - generic [ref=e289]: delete
        - button "expand_more Member Test Group local No description 0 members edit delete" [ref=e291] [cursor=pointer]:
          - generic [ref=e292]:
            - generic [ref=e293]: expand_more
            - generic [ref=e294]:
              - text: Member Test Group
              - generic [ref=e295]: local
              - paragraph [ref=e296]: No description
          - generic [ref=e297]:
            - generic [ref=e298]: 0 members
            - generic [ref=e299]:
              - button "edit" [ref=e300]:
                - generic [ref=e301]: edit
              - button "delete" [ref=e302]:
                - generic [ref=e303]: delete
        - button "expand_more Renamed Group local Will be renamed 0 members edit delete" [ref=e305] [cursor=pointer]:
          - generic [ref=e306]:
            - generic [ref=e307]: expand_more
            - generic [ref=e308]:
              - text: Renamed Group
              - generic [ref=e309]: local
              - paragraph [ref=e310]: Will be renamed
          - generic [ref=e311]:
            - generic [ref=e312]: 0 members
            - generic [ref=e313]:
              - button "edit" [ref=e314]:
                - generic [ref=e315]: edit
              - button "delete" [ref=e316]:
                - generic [ref=e317]: delete
        - button "expand_more E2E UI Group local Created during E2E test 0 members edit delete" [ref=e319] [cursor=pointer]:
          - generic [ref=e320]:
            - generic [ref=e321]: expand_more
            - generic [ref=e322]:
              - text: E2E UI Group
              - generic [ref=e323]: local
              - paragraph [ref=e324]: Created during E2E test
          - generic [ref=e325]:
            - generic [ref=e326]: 0 members
            - generic [ref=e327]:
              - button "edit" [ref=e328]:
                - generic [ref=e329]: edit
              - button "delete" [ref=e330]:
                - generic [ref=e331]: delete
    - button "chat" [ref=e332] [cursor=pointer]:
      - generic [ref=e333]: chat
    - button "dark_mode" [ref=e334] [cursor=pointer]:
      - generic [ref=e335]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e341] [cursor=pointer]:
    - img [ref=e342]
  - alert [ref=e345]
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
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> expand group shows no members message
- Location: test/e2e/75-groups.spec.ts:110:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 409
```

# Test source

```ts
  14  |     // users) need a dedicated admin context from the saved auth state.
  15  |     const adminCtx = await playwright.request.newContext({ storageState: getAdminAuthFile() });
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
> 114 |     expect(res.status()).toBe(201);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  115 |     const group = await res.json();
  116 |     createdGroupIds.push(group.id);
  117 | 
  118 |     await page.goto('/settings/groups');
  119 |     await expect(page.getByText('Member Test Group')).toBeVisible({ timeout: 10000 });
  120 | 
  121 |     // Click group name to expand
  122 |     await page.getByText('Member Test Group').click();
  123 |     await expect(page.getByText('No members')).toBeVisible({ timeout: 5000 });
  124 |   });
  125 | 
  126 |   test('add and remove member from group', async ({ page, request }) => {
  127 |     const groupName = `Member-Add-Remove-${Date.now()}`;
  128 |     const gRes = await request.post(`${API_URL}/groups`, {
  129 |       data: { name: groupName },
  130 |     });
  131 |     expect(gRes.status()).toBe(201);
  132 |     const group = await gRes.json();
  133 |     createdGroupIds.push(group.id);
  134 | 
  135 |     const userName = `Add-Remove-User-${Date.now()}`;
  136 |     const userEmail = `addremove-${Date.now()}@test.local`;
  137 | 
  138 |     // Use fetch directly so the request fixture's admin cookie is preserved
  139 |     const regRes = await fetch(`${API_URL}/auth/register`, {
  140 |       method: 'POST', headers: { 'Content-Type': 'application/json' },
  141 |       body: JSON.stringify({ name: userName, email: userEmail, password: 'Test1234!' }),
  142 |     });
  143 |     expect(regRes.status).toBe(201);
  144 |     const regData = await regRes.json();
  145 |     cleanupUserIds.push(regData.user.id);
  146 | 
  147 |     await page.goto('/settings/groups');
  148 |     await expect(page.getByText(groupName)).toBeVisible({ timeout: 10000 });
  149 | 
  150 |     // Expand
  151 |     await page.getByText(groupName).click();
  152 |     await expect(page.getByText('No members')).toBeVisible();
  153 | 
  154 |     // Add member
  155 |     await page.getByText('+ Add member').click();
  156 |     await expect(page.getByText('Select a user to add')).toBeVisible();
  157 |     await page.getByText(userName).click();
  158 |     await expect(page.getByText(userName).first()).toBeVisible({ timeout: 5000 });
  159 | 
  160 |     // Remove the member via the UI — the member row has a close-icon button
  161 |     const memberRow = page.locator('div.flex.items-center.justify-between.px-2').filter({ hasText: userName }).first();
  162 |     await expect(memberRow).toBeVisible();
  163 |     await memberRow
  164 |       .locator('button')
  165 |       .filter({ has: page.locator('span.material-symbols-outlined', { hasText: 'close' }) })
  166 |       .click();
  167 | 
  168 |     // The member should disappear and the empty state returns
  169 |     await expect(page.getByText(userName)).not.toBeVisible({ timeout: 5000 });
  170 |     await expect(page.getByText('No members')).toBeVisible({ timeout: 5000 });
  171 | 
  172 |     // Backend state matches the UI
  173 |     const getRes = await request.get(`${API_URL}/groups/${group.id}`);
  174 |     expect(getRes.status()).toBe(200);
  175 |     const detail = await getRes.json();
  176 |     expect(detail.members.length).toBe(0);
  177 |   });
  178 | 
  179 |   test('user role can be updated via the users page role dropdown', async ({ page, request }) => {
  180 |     const userName = `Role-Change-User-${Date.now()}`;
  181 |     const userEmail = `rolechange-${Date.now()}@test.local`;
  182 |     const regRes = await fetch(`${API_URL}/auth/register`, {
  183 |       method: 'POST', headers: { 'Content-Type': 'application/json' },
  184 |       body: JSON.stringify({ name: userName, email: userEmail, password: 'Test1234!' }),
  185 |     });
  186 |     expect(regRes.status).toBe(201);
  187 |     const regData = await regRes.json();
  188 |     cleanupUserIds.push(regData.user.id);
  189 | 
  190 |     // Sanity check: a newly registered user has the reader role
  191 |     const rolesRes = await request.get(`${API_URL}/roles`);
  192 |     expect(rolesRes.status()).toBe(200);
  193 |     const roles = await rolesRes.json();
  194 |     const editorRole = roles.find((r: any) => r.name === 'editor');
  195 |     expect(editorRole).toBeDefined();
  196 | 
  197 |     await page.goto('/settings/users');
  198 |     await expect(page.locator('h1').filter({ hasText: 'Users' }).first()).toBeVisible({ timeout: 10000 });
  199 | 
  200 |     // Find the user's row and change the role via the row's role dropdown
  201 |     const userRow = page.locator('tr').filter({ hasText: userEmail }).first();
  202 |     await expect(userRow).toBeVisible({ timeout: 5000 });
  203 |     await userRow.locator('[role="combobox"]').click();
  204 |     await page.getByRole('option', { name: 'editor' }).click();
  205 | 
  206 |     // The role change is persisted to the backend
  207 |     await expect.poll(async () => {
  208 |       const res = await request.get(`${API_URL}/users`);
  209 |       if (res.status() !== 200) return null;
  210 |       const users = await res.json();
  211 |       const u = users.find((x: any) => x.id === regData.user.id);
  212 |       return u?.role_name || null;
  213 |     }, { timeout: 5000 }).toBe('editor');
  214 |   });
```
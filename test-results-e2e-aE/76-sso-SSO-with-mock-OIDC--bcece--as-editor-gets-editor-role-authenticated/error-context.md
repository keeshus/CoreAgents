# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 76-sso.spec.ts >> SSO with mock OIDC >> SSO login as editor gets editor role
- Location: test/e2e/76-sso.spec.ts:70:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "editor"
Received: "admin"
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e5]:
    - heading "Sign In" [level=1] [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e9]:
        - textbox "Email" [ref=e11]:
          - /placeholder: " "
        - generic: Email
      - generic [ref=e13]:
        - textbox "Password" [ref=e15]:
          - /placeholder: " "
        - generic: Password
      - button "Sign In" [ref=e16] [cursor=pointer]
    - paragraph [ref=e17]:
      - text: Don't have an account?
      - link "Register" [ref=e18] [cursor=pointer]:
        - /url: /register
  - button "dark_mode" [ref=e19] [cursor=pointer]:
    - generic [ref=e20]: dark_mode
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
  4   | 
  5   | test.describe('SSO with mock OIDC', () => {
  6   |   test.beforeEach(async ({ request }) => {
  7   |     // Configure SSO with mock OIDC before each test
  8   |     const res = await request.put(`${API_URL}/admin/sso-config`, {
  9   |       data: {
  10  |         provider: 'mock-oidc',
  11  |         clientId: 'core-agents',
  12  |         clientSecret: 'e2e-test-secret',
  13  |         issuer: 'http://mock-oidc-e2e:3004/dex',
  14  |         redirectUri: 'http://localhost:3001/api/auth/sso/callback',
  15  |         groupClaim: 'groups',
  16  |         adminGroupMapping: ['core-agents-admin'],
  17  |         editorGroupMapping: ['core-agents-editor'],
  18  |         enabled: true,
  19  |       },
  20  |     });
  21  |     expect(res.ok()).toBe(true);
  22  |   });
  23  | 
  24  |   test.afterEach(async ({ request }) => {
  25  |     await request.put(`${API_URL}/admin/sso-config`, {
  26  |       data: { enabled: false },
  27  |     });
  28  |   });
  29  | 
  30  |   // ─── Page visibility ─────────────────────────────────
  31  | 
  32  |   test('login page shows SSO button when configured', async ({ page }) => {
  33  |     await page.goto('/login');
  34  |     await expect(page.getByText('Sign in with SSO')).toBeVisible({ timeout: 10000 });
  35  |   });
  36  | 
  37  |   test('login page hides SSO button when disabled', async ({ request, page }) => {
  38  |     await request.put(`${API_URL}/admin/sso-config`, {
  39  |       data: { enabled: false },
  40  |     });
  41  |     await page.goto('/login');
  42  |     await expect(page.getByText('Sign in with SSO')).not.toBeVisible({ timeout: 5000 });
  43  |   });
  44  | 
  45  |   // ─── Role mapping via DeX group claims ───────────────
  46  | 
  47  |   test('SSO login as admin gets admin role', async ({ page, request }) => {
  48  |     await page.goto('/login');
  49  |     await page.getByText('Sign in with SSO').click();
  50  | 
  51  |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  52  |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  53  | 
  54  |     await page.locator('#login').fill('admin@mock.local');
  55  |     await page.locator('#password').fill('password');
  56  |     await page.locator('#submit-login').click();
  57  | 
  58  |     // Admin user is part of 'core-agents-admin' group → mapped to admin role
  59  |     await expect(page).toHaveURL(/localhost:3000/);
  60  |     await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible({ timeout: 10000 });
  61  | 
  62  |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  63  |     const me = await meRes.json();
  64  |     expect(me.user?.role).toBe('admin');
  65  |     expect(me.user?.permissions).toContain('group:write');
  66  | 
  67  |     await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  68  |   });
  69  | 
  70  |   test('SSO login as editor gets editor role', async ({ page, request }) => {
  71  |     await page.goto('/login');
  72  |     await page.getByText('Sign in with SSO').click();
  73  |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  74  |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  75  | 
  76  |     await page.locator('#login').fill('editor@mock.local');
  77  |     await page.locator('#password').fill('password');
  78  |     await page.locator('#submit-login').click();
  79  | 
  80  |     // Editor user is part of 'core-agents-editor' group → mapped to editor role
  81  |     await expect(page).toHaveURL(/localhost:3000/);
  82  | 
  83  |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  84  |     const me = await meRes.json();
> 85  |     expect(me.user?.role).toBe('editor');
      |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  86  |     expect(me.user?.permissions).toContain('flow:create');
  87  |     expect(me.user?.permissions).not.toContain('group:write');
  88  | 
  89  |     await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  90  |   });
  91  | 
  92  |   test('SSO login as reader (unmapped group) gets reader role', async ({ page, request }) => {
  93  |     await page.goto('/login');
  94  |     await page.getByText('Sign in with SSO').click();
  95  |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  96  |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  97  | 
  98  |     await page.locator('#login').fill('reader@mock.local');
  99  |     await page.locator('#password').fill('password');
  100 |     await page.locator('#submit-login').click();
  101 | 
  102 |     // Reader is in 'some-other-group' which doesn't match admin or editor mapping
  103 |     await expect(page).toHaveURL(/\/approvals/);
  104 | 
  105 |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  106 |     const me = await meRes.json();
  107 |     expect(me.user?.role).toBe('reader');
  108 | 
  109 |     await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  110 |   });
  111 | 
  112 |   test('SSO login as no-group user gets reader role', async ({ page, request }) => {
  113 |     await page.goto('/login');
  114 |     await page.getByText('Sign in with SSO').click();
  115 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  116 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  117 | 
  118 |     await page.locator('#login').fill('nogroup@mock.local');
  119 |     await page.locator('#password').fill('password');
  120 |     await page.locator('#submit-login').click();
  121 | 
  122 |     // No groups → reader role
  123 |     await expect(page).toHaveURL(/\/approvals/);
  124 | 
  125 |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  126 |     const me = await meRes.json();
  127 |     expect(me.user?.role).toBe('reader');
  128 | 
  129 |     await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  130 |   });
  131 | 
  132 |   // ─── Group sync ──────────────────────────────────────
  133 | 
  134 |   test('SSO login syncs groups from userinfo', async ({ page, request }) => {
  135 |     await page.goto('/login');
  136 |     await page.getByText('Sign in with SSO').click();
  137 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  138 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  139 | 
  140 |     await page.locator('#login').fill('admin@mock.local');
  141 |     await page.locator('#password').fill('password');
  142 |     await page.locator('#submit-login').click();
  143 |     await expect(page).toHaveURL(/localhost:3000/);
  144 | 
  145 |     // Verify synced groups in /auth/me
  146 |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  147 |     const me = await meRes.json();
  148 |     const groupNames = (me.user?.groups || []).map((g: any) => g.name);
  149 |     expect(groupNames).toContain('core-agents-admin');
  150 | 
  151 |     // Verify group exists in DB with provider=mock-oidc
  152 |     const groupsRes = await request.get(`${API_URL}/groups`);
  153 |     const groups = await groupsRes.json();
  154 |     const syncedGroup = groups.find((g: any) => g.name === 'core-agents-admin');
  155 |     expect(syncedGroup).toBeDefined();
  156 |     expect(syncedGroup.provider).toBe('mock-oidc');
  157 | 
  158 |     await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  159 |   });
  160 | 
  161 |   // ─── Re-login ────────────────────────────────────────
  162 | 
  163 |   test('SSO re-login preserves existing user', async ({ page, request }) => {
  164 |     // First login
  165 |     await page.goto('/login');
  166 |     await page.getByText('Sign in with SSO').click();
  167 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  168 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  169 |     await page.locator('#login').fill('admin@mock.local');
  170 |     await page.locator('#password').fill('password');
  171 |     await page.locator('#submit-login').click();
  172 |     await expect(page).toHaveURL(/localhost:3000/);
  173 | 
  174 |     const me1 = await (await page.request.get(`${API_URL}/auth/me`)).json();
  175 |     const userId = me1.user?.userId;
  176 | 
  177 |     // Logout by clearing cookie
  178 |     await page.goto('/login');
  179 | 
  180 |     // Second login
  181 |     await page.getByText('Sign in with SSO').click();
  182 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  183 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  184 |     await page.locator('#login').fill('admin@mock.local');
  185 |     await page.locator('#password').fill('password');
```
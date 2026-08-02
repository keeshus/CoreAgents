# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 76-sso.spec.ts >> SSO with mock OIDC >> SSO logout via UI clears the session and redirects to /login
- Location: test/e2e/76-sso.spec.ts:198:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Sign Out' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
    - button "chat" [ref=e19] [cursor=pointer]:
      - generic [ref=e20]: chat
    - button "dark_mode" [ref=e21] [cursor=pointer]:
      - generic [ref=e22]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e28] [cursor=pointer]:
    - img [ref=e29]
  - alert [ref=e32]
```

# Test source

```ts
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
  186 |     await page.locator('#submit-login').click();
  187 |     await expect(page).toHaveURL(/localhost:3000/);
  188 | 
  189 |     const me2 = await (await page.request.get(`${API_URL}/auth/me`)).json();
  190 |     expect(me2.user?.userId).toBe(userId);
  191 |     expect(me2.user?.role).toBe('admin');
  192 | 
  193 |     await request.delete(`${API_URL}/users/${userId}`).catch(() => {});
  194 |   });
  195 | 
  196 |   // ─── Logout ─────────────────────────────────────────────
  197 | 
  198 |   test('SSO logout via UI clears the session and redirects to /login', async ({ page, request }) => {
  199 |     await page.goto('/login');
  200 |     await page.getByText('Sign in with SSO').click();
  201 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  202 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  203 |     await page.locator('#login').fill('admin@mock.local');
  204 |     await page.locator('#password').fill('password');
  205 |     await page.locator('#submit-login').click();
  206 |     await expect(page).toHaveURL(/localhost:3000/);
  207 | 
  208 |     // Session is active as the SSO admin
  209 |     const me = await (await page.request.get(`${API_URL}/auth/me`)).json();
  210 |     expect(me.user?.role).toBe('admin');
  211 |     const userId = me.user?.userId;
  212 | 
  213 |     // Sign out through the header
> 214 |     await page.getByRole('button', { name: 'Sign Out' }).click();
      |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  215 |     await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  216 |     await expect(page.getByLabel('Email')).toBeVisible({ timeout: 5000 });
  217 | 
  218 |     // No session left behind
  219 |     const afterRes = await page.request.get(`${API_URL}/auth/me`);
  220 |     expect(afterRes.status()).toBe(401);
  221 | 
  222 |     await request.delete(`${API_URL}/users/${userId}`).catch(() => {});
  223 |   });
  224 | 
  225 |   // ─── SSO settings page UI ───────────────────────────────
  226 | 
  227 |   test('SSO settings page reflects saved config and can be edited via UI', async ({ page, request }) => {
  228 |     await page.goto('/settings/sso');
  229 |     await expect(page.getByRole('heading', { name: 'SSO / OIDC Configuration' })).toBeVisible({ timeout: 10000 });
  230 | 
  231 |     // Form reflects the config saved in beforeEach
  232 |     await expect(page.getByLabel('Provider name')).toHaveValue('mock-oidc', { timeout: 5000 });
  233 |     await expect(page.getByLabel('Client ID')).toHaveValue('core-agents');
  234 |     await expect(page.getByLabel('Issuer URL')).toHaveValue('http://mock-oidc-e2e:3004/dex');
  235 |     await expect(page.getByLabel('Redirect URI')).toHaveValue('http://localhost:3001/api/auth/sso/callback');
  236 |     await expect(page.getByLabel('Group claim name')).toHaveValue('groups');
  237 |     await expect(page.getByLabel('Admin group mapping')).toHaveValue('core-agents-admin');
  238 |     await expect(page.getByLabel('Editor group mapping')).toHaveValue('core-agents-editor');
  239 |     await expect(page.getByText('Enable SSO')).toBeVisible();
  240 | 
  241 |     // Edit via UI and save
  242 |     await page.getByLabel('Provider name').fill('mock-oidc-edited');
  243 |     await page.getByLabel('Admin group mapping').fill('core-agents-admin, extra-admin-group');
  244 |     await page.getByRole('button', { name: 'Save Configuration' }).click();
  245 |     await expect(page.getByText('SSO configuration saved')).toBeVisible({ timeout: 5000 });
  246 | 
  247 |     // API reflects the UI edits
  248 |     const res = await request.get(`${API_URL}/admin/sso-config`);
  249 |     expect(res.ok()).toBe(true);
  250 |     const config = await res.json();
  251 |     expect(config.provider).toBe('mock-oidc-edited');
  252 |     expect(config.adminGroupMapping).toEqual(['core-agents-admin', 'extra-admin-group']);
  253 |     expect(config.editorGroupMapping).toEqual(['core-agents-editor']);
  254 | 
  255 |     // Restore the original values for subsequent tests
  256 |     await request.put(`${API_URL}/admin/sso-config`, {
  257 |       data: { provider: 'mock-oidc', adminGroupMapping: ['core-agents-admin'], editorGroupMapping: ['core-agents-editor'] },
  258 |     });
  259 |   });
  260 | 
  261 |   // ─── IdP failure paths ──────────────────────────────────
  262 | 
  263 |   test('SSO login with wrong IdP credentials shows error from provider', async ({ page }) => {
  264 |     await page.goto('/login');
  265 |     await page.getByText('Sign in with SSO').click();
  266 |     await expect(page).toHaveURL(/localhost:3004\/dex/);
  267 |     await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
  268 | 
  269 |     await page.locator('#login').fill('admin@mock.local');
  270 |     await page.locator('#password').fill('wrong-password');
  271 |     await page.locator('#submit-login').click();
  272 | 
  273 |     // The mock IdP rejects the credentials — no redirect back to the app
  274 |     await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 10000 });
  275 |   });
  276 | 
  277 |   test('SSO login fails cleanly when issuer is unreachable', async ({ request, page }) => {
  278 |     // Point SSO at a non-existent issuer path → OIDC discovery fails
  279 |     await request.put(`${API_URL}/admin/sso-config`, {
  280 |       data: { issuer: 'http://mock-oidc-e2e:3004/nonexistent' },
  281 |     });
  282 | 
  283 |     const res = await request.get(`${API_URL}/auth/sso/login`);
  284 |     expect(res.status()).toBe(500);
  285 |     const body = await res.json();
  286 |     expect(body.error).toContain('Failed to initiate SSO login');
  287 | 
  288 |     // Login page still renders and offers local sign-in
  289 |     await page.goto('/login');
  290 |     await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
  291 | 
  292 |     // Restore the working issuer
  293 |     await request.put(`${API_URL}/admin/sso-config`, {
  294 |       data: { issuer: 'http://mock-oidc-e2e:3004/dex' },
  295 |     });
  296 |   });
  297 | });
  298 | 
```
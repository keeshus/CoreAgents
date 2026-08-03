# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 10-auth.spec.ts >> Auth flows >> registers a new user via /register and logs in as them
- Location: test/e2e/10-auth.spec.ts:66:3

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
        - generic [ref=e6]:
          - heading "Pending Approvals" [level=1] [ref=e7]
          - paragraph [ref=e8]: Review and respond to Human-in-the-Loop requests
        - generic [ref=e9]:
          - generic [ref=e10]: E2E Register User
          - link "person Profile" [ref=e11] [cursor=pointer]:
            - /url: /profile
            - generic [ref=e12]: person
            - text: Profile
          - button "logout Sign Out" [ref=e13] [cursor=pointer]:
            - generic [ref=e14]: logout
            - text: Sign Out
      - generic [ref=e15]:
        - generic [ref=e16]: thumb_up
        - paragraph [ref=e17]: All caught up!
        - paragraph [ref=e18]: No pending approvals
    - button "chat" [ref=e19] [cursor=pointer]:
      - generic [ref=e20]: chat
    - button "dark_mode" [ref=e21] [cursor=pointer]:
      - generic [ref=e22]: dark_mode
  - button "Open Next.js Dev Tools" [ref=e28] [cursor=pointer]:
    - img [ref=e29]
  - alert [ref=e32]: Pending Approvals
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { E2E_USER } from './helpers/api';
  3   | import { getAdminAuthFile } from './helpers/auth';
  4   | 
  5   | const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
  6   | 
  7   | test.describe('Auth flows', () => {
  8   |   test('protected /api/flows returns 401 without auth', async () => {
  9   |     const res = await fetch('http://localhost:3001/api/flows');
  10  |     expect(res.status).toBe(401);
  11  |   });
  12  | 
  13  |   test('protected /api/settings returns 401 without auth', async () => {
  14  |     const res = await fetch('http://localhost:3001/api/llm-endpoints');
  15  |     expect(res.status).toBe(401);
  16  |   });
  17  | 
  18  |   test('register page has link to login', async ({ page }) => {
  19  |     await page.goto('/register');
  20  |     const loginLink = page.getByRole('link', { name: /sign.?in/i });
  21  |     await expect(loginLink).toBeVisible();
  22  |     await loginLink.click();
  23  |     await expect(page).toHaveURL(/\/login/);
  24  |   });
  25  | 
  26  |   test('session persists across page reload', async ({ page }) => {
  27  |     await page.goto('/');
  28  |     await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
  29  |     await page.reload();
  30  |     await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
  31  |   });
  32  | 
  33  |   // ─── Login error UI ─────────────────────────────────────
  34  | 
  35  |   test('login form shows error UI on wrong password', async ({ page }) => {
  36  |     await page.goto('/login');
  37  |     await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
  38  |     await page.getByLabel('Email').fill(E2E_USER.email);
  39  |     await page.getByLabel('Password', { exact: true }).fill('WrongPassword123!');
  40  |     await page.getByRole('button', { name: 'Sign In' }).click();
  41  | 
  42  |     await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5000 });
  43  |     // Still on the login page — no session was created
  44  |     await expect(page).toHaveURL(/\/login/);
  45  |     // The failed attempt must not leave the user signed in
  46  |     await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 5000 });
  47  |   });
  48  | 
  49  |   // ─── Logout via UI ──────────────────────────────────────
  50  | 
  51  |   test('UI logout redirects to /login and invalidates the session', async ({ page }) => {
  52  |     await page.goto('/');
  53  |     await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible({ timeout: 10000 });
  54  | 
  55  |     await page.getByRole('button', { name: 'Sign Out' }).click();
  56  |     await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  57  |     await expect(page.getByLabel('Email')).toBeVisible({ timeout: 5000 });
  58  | 
  59  |     // The session cookie is gone — protected APIs reject the request
  60  |     const flowsRes = await page.request.get(`${API_URL}/flows`);
  61  |     expect(flowsRes.status()).toBe(401);
  62  |   });
  63  | 
  64  |   // ─── Registration via UI ────────────────────────────────
  65  | 
  66  |   test('registers a new user via /register and logs in as them', async ({ page, request }) => {
  67  |     const email = `e2e-register-${Date.now()}@test.local`;
  68  | 
  69  |     await page.goto('/register');
  70  |     await expect(page.getByLabel('Name')).toBeVisible({ timeout: 10000 });
  71  |     await page.getByLabel('Name').fill('E2E Register User');
  72  |     await page.getByLabel('Email').fill(email);
  73  |     await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
  74  |     await page.getByLabel('Confirm Password').fill(E2E_USER.password);
  75  |     await expect(page.getByText('Passwords match')).toBeVisible({ timeout: 5000 });
  76  |     await page.getByRole('button', { name: 'Create Account' }).click();
  77  | 
  78  |     // Non-first users get the reader role → redirected to the approvals page
  79  |     await expect(page).toHaveURL(/\/approvals/, { timeout: 10000 });
  80  |     await expect(page.getByRole('heading', { name: 'Pending Approvals' })).toBeVisible({ timeout: 5000 });
  81  | 
  82  |     // Sign out, then sign back in via UI with the new credentials
  83  |     await page.getByRole('button', { name: 'Sign Out' }).click();
  84  |     await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  85  |     await page.getByLabel('Email').fill(email);
  86  |     await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
  87  |     await page.getByRole('button', { name: 'Sign In' }).click();
  88  |     await expect(page).toHaveURL(/\/approvals/, { timeout: 10000 });
  89  | 
  90  |     const meRes = await page.request.get(`${API_URL}/auth/me`);
  91  |     const me = await meRes.json();
  92  |     expect(me.user?.email).toBe(email);
  93  |     expect(me.user?.role).toBe('reader');
  94  | 
  95  |     // Cleanup — the shared `request` fixture now holds the READER's cookies
  96  |     // (browser signed in as the new user), so DELETE /api/users/:id (admin-only)
  97  |     // would 403. Use a dedicated admin context from the saved auth state instead.
> 98  |     const adminCtx = await request.newContext({ storageState: getAdminAuthFile() });
      |                                    ^ TypeError: request.newContext is not a function
  99  |     try {
  100 |       const delRes = await adminCtx.delete(`${API_URL}/users/${me.user.userId}`);
  101 |       expect(delRes.status()).toBe(204);
  102 |     } finally {
  103 |       await adminCtx.dispose();
  104 |     }
  105 |   });
  106 | });
  107 | 
```
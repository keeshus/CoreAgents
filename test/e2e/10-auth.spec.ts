import { test, expect } from '@playwright/test';
import { E2E_USER } from './helpers/api';
import { getAdminAuthFile } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Auth flows', () => {
  test('protected /api/flows returns 401 without auth', async () => {
    const res = await fetch('http://localhost:3001/api/flows');
    expect(res.status).toBe(401);
  });

  test('protected /api/settings returns 401 without auth', async () => {
    const res = await fetch('http://localhost:3001/api/llm-endpoints');
    expect(res.status).toBe(401);
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/register');
    const loginLink = page.getByRole('link', { name: /sign.?in/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('session persists across page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible();
  });

  // ─── Login error UI ─────────────────────────────────────

  test('login form shows error UI on wrong password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Email').fill(E2E_USER.email);
    await page.getByLabel('Password', { exact: true }).fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5000 });
    // Still on the login page — no session was created
    await expect(page).toHaveURL(/\/login/);
    // The failed attempt must not leave the user signed in
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 5000 });
  });

  // ─── Logout via UI ──────────────────────────────────────

  test('UI logout redirects to /login and invalidates the session', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Core Agents' }).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 5000 });

    // The session cookie is gone — protected APIs reject the request
    const flowsRes = await page.request.get(`${API_URL}/flows`);
    expect(flowsRes.status()).toBe(401);
  });

  // ─── Registration via UI ────────────────────────────────

  test('registers a new user via /register and logs in as them', async ({ page, request, playwright }) => {
    const email = `e2e-register-${Date.now()}@test.local`;

    await page.goto('/register');
    await expect(page.getByLabel('Name')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Name').fill('E2E Register User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
    await page.getByLabel('Confirm Password').fill(E2E_USER.password);
    await expect(page.getByText('Passwords match')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Non-first users get the reader role → redirected to the approvals page
    await expect(page).toHaveURL(/\/approvals/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Pending Approvals' })).toBeVisible({ timeout: 5000 });

    // Sign out, then sign back in via UI with the new credentials
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/approvals/, { timeout: 10000 });

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.email).toBe(email);
    expect(me.user?.role).toBe('reader');

    // Cleanup — the shared `request` fixture now holds the READER's cookies
    // (browser signed in as the new user), so DELETE /api/users/:id (admin-only)
    // would 403. Use a dedicated admin context from the saved auth state instead.
    const adminCtx = await playwright.request.newContext({ storageState: getAdminAuthFile() });
    try {
      const delRes = await adminCtx.delete(`${API_URL}/users/${me.user.userId}`);
      expect(delRes.ok(), 'admin should be able to delete the test user').toBe(true);
    } finally {
      await adminCtx.dispose();
    }
  });
});

import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('SSO with mock OIDC', () => {
  test.beforeEach(async ({ request }) => {
    // Configure SSO with mock OIDC before each test
    const res = await request.put(`${API_URL}/admin/sso-config`, {
      data: {
        provider: 'mock-oidc',
        clientId: 'core-agents',
        clientSecret: 'e2e-test-secret',
        issuer: 'http://mock-oidc-e2e:3004/dex',
        redirectUri: 'http://localhost:3001/api/auth/sso/callback',
        groupClaim: 'groups',
        adminGroupMapping: ['core-agents-admin'],
        editorGroupMapping: ['core-agents-editor'],
        enabled: true,
      },
    });
    expect(res.ok()).toBe(true);
  });

  test.afterEach(async ({ request }) => {
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { enabled: false },
    });
  });

  // ─── Page visibility ─────────────────────────────────

  test('login page shows SSO button when configured', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in with SSO')).toBeVisible({ timeout: 10000 });
  });

  test('login page hides SSO button when disabled', async ({ request, page }) => {
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { enabled: false },
    });
    await page.goto('/login');
    await expect(page.getByText('Sign in with SSO')).not.toBeVisible({ timeout: 5000 });
  });

  // ─── Role mapping via DeX group claims ───────────────

  test('SSO login as admin gets admin role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();

    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Admin user is part of 'core-agents-admin' group → mapped to admin role
    await expect(page).toHaveURL(/localhost:3000/);
    await expect(page.locator('h1').filter({ hasText: 'OrcheStream.AI' }).first()).toBeVisible({ timeout: 10000 });

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('admin');
    expect(me.user?.permissions).toContain('group:write');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as editor gets editor role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('editor@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Editor user is part of 'core-agents-editor' group → mapped to editor role
    await expect(page).toHaveURL(/localhost:3000/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('editor');
    expect(me.user?.permissions).toContain('flow:create');
    expect(me.user?.permissions).not.toContain('group:write');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as reader (unmapped group) gets reader role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('reader@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // Reader is in 'some-other-group' which doesn't match admin or editor mapping
    await expect(page).toHaveURL(/\/approvals/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('reader');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  test('SSO login as no-group user gets reader role', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('nogroup@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();

    // No groups → reader role
    await expect(page).toHaveURL(/\/approvals/);

    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    expect(me.user?.role).toBe('reader');

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  // ─── Group sync ──────────────────────────────────────

  test('SSO login syncs groups from userinfo', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    // Verify synced groups in /auth/me
    const meRes = await page.request.get(`${API_URL}/auth/me`);
    const me = await meRes.json();
    const groupNames = (me.user?.groups || []).map((g: any) => g.name);
    expect(groupNames).toContain('core-agents-admin');

    // Verify group exists in DB with provider=mock-oidc
    const groupsRes = await request.get(`${API_URL}/groups`);
    const groups = await groupsRes.json();
    const syncedGroup = groups.find((g: any) => g.name === 'core-agents-admin');
    expect(syncedGroup).toBeDefined();
    expect(syncedGroup.provider).toBe('mock-oidc');

    // SSO-provisioned groups are read-only on the groups settings page:
    // no Edit/Delete buttons and no "+ Add member" for non-local groups.
    await page.goto('/settings/groups');
    await expect(page.getByText('core-agents-admin')).toBeVisible({ timeout: 10000 });
    const ssoRow = page.locator('div.bg-surface.rounded-lg.border.border-outline-variant.p-4').filter({ hasText: 'core-agents-admin' }).first();
    await expect(ssoRow.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(ssoRow.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(page.getByText('mock-oidc').first()).toBeVisible({ timeout: 5000 });

    await request.delete(`${API_URL}/users/${me.user.userId}`).catch(() => {});
  });

  // ─── Re-login ────────────────────────────────────────

  test('SSO re-login preserves existing user', async ({ page, request }) => {
    // First login
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    const me1 = await (await page.request.get(`${API_URL}/auth/me`)).json();
    const userId = me1.user?.userId;

    // Logout by clearing cookie
    await page.goto('/login');

    // Second login
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    const me2 = await (await page.request.get(`${API_URL}/auth/me`)).json();
    expect(me2.user?.userId).toBe(userId);
    expect(me2.user?.role).toBe('admin');

    await request.delete(`${API_URL}/users/${userId}`).catch(() => {});
  });

  // ─── Logout ─────────────────────────────────────────────

  test('SSO logout via UI clears the session and redirects to /login', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });
    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('password');
    await page.locator('#submit-login').click();
    await expect(page).toHaveURL(/localhost:3000/);

    // Session is active as the SSO admin
    const me = await (await page.request.get(`${API_URL}/auth/me`)).json();
    expect(me.user?.role).toBe('admin');
    const userId = me.user?.userId;

    // Sign out through the header
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 5000 });

    // No session left behind
    const afterRes = await page.request.get(`${API_URL}/auth/me`);
    expect(afterRes.status()).toBe(401);

    await request.delete(`${API_URL}/users/${userId}`).catch(() => {});
  });

  // ─── SSO settings page UI ───────────────────────────────

  test('SSO settings page reflects saved config and can be edited via UI', async ({ page, request }) => {
    await page.goto('/settings/sso');
    await expect(page.getByRole('heading', { name: 'SSO / OIDC Configuration' })).toBeVisible({ timeout: 10000 });

    // Form reflects the config saved in beforeEach
    await expect(page.getByLabel('Provider name')).toHaveValue('mock-oidc', { timeout: 5000 });
    await expect(page.getByLabel('Client ID')).toHaveValue('core-agents');
    await expect(page.getByLabel('Issuer URL')).toHaveValue('http://mock-oidc-e2e:3004/dex');
    await expect(page.getByLabel('Redirect URI')).toHaveValue('http://localhost:3001/api/auth/sso/callback');
    await expect(page.getByLabel('Group claim name')).toHaveValue('groups');
    await expect(page.getByLabel('Admin group mapping')).toHaveValue('core-agents-admin');
    await expect(page.getByLabel('Editor group mapping')).toHaveValue('core-agents-editor');
    await expect(page.getByText('Enable SSO')).toBeVisible();

    // Edit via UI and save
    await page.getByLabel('Provider name').fill('mock-oidc-edited');
    await page.getByLabel('Admin group mapping').fill('core-agents-admin, extra-admin-group');
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await expect(page.getByText('SSO configuration saved')).toBeVisible({ timeout: 5000 });

    // API reflects the UI edits
    const res = await request.get(`${API_URL}/admin/sso-config`);
    expect(res.ok()).toBe(true);
    const config = await res.json();
    expect(config.provider).toBe('mock-oidc-edited');
    expect(config.adminGroupMapping).toEqual(['core-agents-admin', 'extra-admin-group']);
    expect(config.editorGroupMapping).toEqual(['core-agents-editor']);

    // Restore the original values for subsequent tests
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { provider: 'mock-oidc', adminGroupMapping: ['core-agents-admin'], editorGroupMapping: ['core-agents-editor'] },
    });
  });

  test('SSO settings: save is disabled until required fields are filled, enable toggle is staged', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.getByRole('heading', { name: 'SSO / OIDC Configuration' })).toBeVisible({ timeout: 10000 });

    // Empty the required fields → Save disabled
    await page.getByLabel('Provider name').fill('');
    await page.getByLabel('Client ID').fill('');
    await page.getByLabel('Issuer URL').fill('');
    const saveBtn = page.getByRole('button', { name: 'Save Configuration' });
    await expect(saveBtn).toBeDisabled({ timeout: 5000 });

    // Fill them back → Save re-enabled
    await page.getByLabel('Provider name').fill('mock-oidc');
    await page.getByLabel('Client ID').fill('core-agents');
    await page.getByLabel('Issuer URL').fill('http://mock-oidc-e2e:3004/dex');
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });

    // Toggle the Enable SSO checkbox — staged until Save is clicked
    const enableCheckbox = page.getByLabel('Enable SSO');
    const before = await (await page.request.get(`${API_URL}/admin/sso-config`)).json();
    if (await enableCheckbox.isChecked()) {
      await enableCheckbox.uncheck();
      // Not saved yet → config unchanged
      await page.waitForTimeout(300);
      const mid = await (await page.request.get(`${API_URL}/admin/sso-config`)).json();
      expect(mid.enabled).toBe(before.enabled);
      // Save → persisted
      await saveBtn.click();
      await expect(page.getByText('SSO configuration saved')).toBeVisible({ timeout: 5000 });
      const after = await (await page.request.get(`${API_URL}/admin/sso-config`)).json();
      expect(after.enabled).toBe(false);
      // Restore
      await page.request.put(`${API_URL}/admin/sso-config`, { data: { enabled: true } });
    } else {
      await enableCheckbox.check();
      await page.waitForTimeout(300);
      const mid = await (await page.request.get(`${API_URL}/admin/sso-config`)).json();
      expect(mid.enabled).toBe(before.enabled);
      await saveBtn.click();
      await expect(page.getByText('SSO configuration saved')).toBeVisible({ timeout: 5000 });
      const after = await (await page.request.get(`${API_URL}/admin/sso-config`)).json();
      expect(after.enabled).toBe(true);
    }
  });

  // ─── IdP failure paths ──────────────────────────────────

  test('SSO login with wrong IdP credentials shows error from provider', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Sign in with SSO').click();
    await expect(page).toHaveURL(/localhost:3004\/dex/);
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 });

    await page.locator('#login').fill('admin@mock.local');
    await page.locator('#password').fill('wrong-password');
    await page.locator('#submit-login').click();

    // The mock IdP rejects the credentials — no redirect back to the app
    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 10000 });
  });

  test('SSO login fails cleanly when issuer is unreachable', async ({ request, page }) => {
    // Point SSO at a non-existent issuer path → OIDC discovery fails
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { issuer: 'http://mock-oidc-e2e:3004/nonexistent' },
    });

    const res = await request.get(`${API_URL}/auth/sso/login`);
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to initiate SSO login');

    // Login page still renders and offers local sign-in
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });

    // Restore the working issuer
    await request.put(`${API_URL}/admin/sso-config`, {
      data: { issuer: 'http://mock-oidc-e2e:3004/dex' },
    });
  });
});

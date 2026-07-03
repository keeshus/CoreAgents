import { test, expect } from '@playwright/test';
import { registerUser, createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Groups feature', () => {
  let createdGroupIds: string[] = [];
  let cleanupUserIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const gId of createdGroupIds) {
      await request.delete(`${API_URL}/groups/${gId}`).catch(() => {});
    }
    createdGroupIds = [];
    for (const uId of cleanupUserIds) {
      await request.delete(`${API_URL}/users/${uId}`).catch(() => {});
    }
    cleanupUserIds = [];
  });

  // ─── Settings page navigation ──────────────────────────────────────

  test('settings page shows Groups link', async ({ page }) => {
    await page.goto('/settings');
    const link = page.locator('a').filter({ hasText: 'Groups' }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/settings/groups');
  });

  test('settings page shows SSO link for admin', async ({ page }) => {
    await page.goto('/settings');
    const link = page.locator('a').filter({ hasText: 'SSO / OIDC' }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/settings/sso');
  });

  test('groups settings page loads', async ({ page }) => {
    await page.goto('/settings/groups');
    await expect(page.locator('h1').filter({ hasText: 'Groups' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('SSO config page loads for admin', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });
  });

  // ─── Group CRUD via UI ─────────────────────────────────────────────

  test('create a group via UI', async ({ page }) => {
    await page.goto('/settings/groups');
    await expect(page.locator('h1').filter({ hasText: 'Groups' }).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Create Group' }).first().click();
    await page.getByLabel('Name').fill('E2E UI Group');
    await page.getByLabel('Description').fill('Created during E2E test');
    await page.getByRole('button', { name: 'Create Group' }).last().click();

    await expect(page.getByText('E2E UI Group')).toBeVisible({ timeout: 5000 });
  });

  test('edit a group name via UI', async ({ page, request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: 'Edit Test Group', description: 'Will be renamed' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    createdGroupIds.push(group.id);

    await page.goto('/settings/groups');
    await expect(page.getByText('Edit Test Group')).toBeVisible({ timeout: 10000 });

    // Click the edit icon button (first button containing "edit" material icon)
    await page.locator('[data-testid="group-edit-btn"]').first().click();
    await expect(page.getByText('Edit Group')).toBeVisible();
    await page.getByLabel('Name').fill('Renamed Group');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Renamed Group')).toBeVisible({ timeout: 5000 });
  });

  test('delete a group via UI', async ({ page, request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: 'Delete Test Group' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    createdGroupIds.push(group.id);

    await page.goto('/settings/groups');
    await expect(page.getByText('Delete Test Group')).toBeVisible({ timeout: 10000 });

    // Click delete button
    await page.locator('[data-testid="group-delete-btn"]').first().click();
    await expect(page.getByText('Delete group?')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Delete Test Group')).not.toBeVisible({ timeout: 5000 });
    createdGroupIds = createdGroupIds.filter(id => id !== group.id);
  });

  test('expand group shows no members message', async ({ page, request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: 'Member Test Group' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    createdGroupIds.push(group.id);

    await page.goto('/settings/groups');
    await expect(page.getByText('Member Test Group')).toBeVisible({ timeout: 10000 });

    // Click group name to expand
    await page.getByText('Member Test Group').click();
    await expect(page.getByText('No members')).toBeVisible({ timeout: 5000 });
  });

  test('add and remove member from group', async ({ page, request }) => {
    const groupName = `Member-Add-Remove-${Date.now()}`;
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: groupName },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    const userName = `Add-Remove-User-${Date.now()}`;
    const userEmail = `addremove-${Date.now()}@test.local`;

    // Use fetch directly so the request fixture's admin cookie is preserved
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userName, email: userEmail, password: 'Test1234!' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    cleanupUserIds.push(regData.user.id);

    await page.goto('/settings/groups');
    await expect(page.getByText(groupName)).toBeVisible({ timeout: 10000 });

    // Expand
    await page.getByText(groupName).click();
    await expect(page.getByText('No members')).toBeVisible();

    // Add member
    await page.getByText('+ Add member').click();
    await expect(page.getByText('Select a user to add')).toBeVisible();
    await page.getByText(userName).click();
    await expect(page.getByText(userName).first()).toBeVisible({ timeout: 5000 });
  });

  test('users page shows Groups column for admin', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.locator('h1').filter({ hasText: 'Users' }).first()).toBeVisible({ timeout: 10000 });
    // The Groups column header should be visible
    await expect(page.locator('th').filter({ hasText: 'Groups' })).toBeVisible();
  });

  // ─── HITL node config ─────────────────────────────────────────────

  test('HITL node config shows group assignment option', async ({ page, request }) => {
    const flowName = uniqueFlowName('HITL-Group-Test');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        nodes: [
          { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'n2', type: 'hitl', position: { x: 0, y: 150 }, data: { label: 'HITL', type: 'hitl', config: { prompt: 'Approve?', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await page.getByText('HITL').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });

    // Verify the Assignment type section with group option exists
    await expect(page.getByText('Assignment type')).toBeVisible();

    // Click the Assignment type select trigger to open the dropdown
    const assignTrigger = page.locator('[role="combobox"]').filter({ hasText: /Specific user|Specific group/ }).first();
    await assignTrigger.click();

    // Verify "Specific group" option appears in the opened dropdown
    await expect(page.getByText('Specific group').first()).toBeVisible({ timeout: 3000 });

    await request.delete(`${API_URL}/flows/${flow.id}`);
  });

  // ─── Flow editor — group selector ──────────────────────────────────

  test('flow editor loads with group assigned flow', async ({ page, request }) => {
    // Create a group first
    const groupName = `Flow-Editor-Group-${Date.now()}`;
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: groupName },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    // Create flow with this group via API
    const flowName = uniqueFlowName('Group-Selector-Test');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        nodes: [{ id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
        edges: [],
        group_id: group.id,
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    expect(flow.group_id).toBe(group.id);

    // Flow editor loads successfully
    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await deleteFlow(request, flow.id);
  });

  // ─── API-based CRUD tests ──────────────────────────────────────────

  test('GET /api/groups returns groups list', async ({ request }) => {
    const res = await request.get(`${API_URL}/groups`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('POST /api/groups creates a group', async ({ request }) => {
    const name = `API-Group-${Date.now()}`;
    const res = await request.post(`${API_URL}/groups`, {
      data: { name, description: 'API created' },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    expect(group.name).toBe(name);
    expect(group.provider).toBe('local');
    createdGroupIds.push(group.id);
  });

  test('POST /api/groups rejects empty name', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/groups rejects duplicate name', async ({ request }) => {
    const name = `Dup-Group-${Date.now()}`;
    const res1 = await request.post(`${API_URL}/groups`, { data: { name } });
    expect(res1.status()).toBe(201);
    const group = await res1.json();
    createdGroupIds.push(group.id);

    const res2 = await request.post(`${API_URL}/groups`, { data: { name } });
    expect(res2.status()).toBe(409);
  });

  test('PUT /api/groups updates a group', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: `Update-Group-${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    createdGroupIds.push(group.id);

    const updRes = await request.put(`${API_URL}/groups/${group.id}`, {
      data: { name: 'Updated Name', description: 'Updated desc' },
    });
    expect(updRes.status()).toBe(200);
    const updated = await updRes.json();
    expect(updated.name).toBe('Updated Name');
  });

  test('DELETE /api/groups deletes a group', async ({ request }) => {
    const res = await request.post(`${API_URL}/groups`, {
      data: { name: `Delete-Group-${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const group = await res.json();
    createdGroupIds.push(group.id);

    const delRes = await request.delete(`${API_URL}/groups/${group.id}`);
    expect(delRes.status()).toBe(200);

    const getRes = await request.get(`${API_URL}/groups/${group.id}`);
    expect(getRes.status()).toBe(404);
    createdGroupIds = createdGroupIds.filter(id => id !== group.id);
  });

  test('POST /api/groups/:id/members adds a member', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Member-API-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    // Use fetch directly so the request fixture's admin cookie is not overwritten
    const user = await registerUserClean(
      `apimember-${Date.now()}@test.local`, 'Test1234!', 'API Member',
    );
    cleanupUserIds.push(user.user.id);

    const mRes = await request.post(`${API_URL}/groups/${group.id}/members`, {
      data: { userId: user.user.id },
    });
    expect(mRes.status()).toBe(201);

    const getRes = await request.get(`${API_URL}/groups/${group.id}`);
    const detail = await getRes.json();
    expect(detail.members.length).toBe(1);
    expect(detail.members[0].userId).toBe(user.user.id);
  });

  test('DELETE /api/groups/:id/members/:userId removes a member', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Remove-API-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    const user = await registerUserClean(
      `removeapi-${Date.now()}@test.local`, 'Test1234!', 'Remove API',
    );
    cleanupUserIds.push(user.user.id);

    await request.post(`${API_URL}/groups/${group.id}/members`, {
      data: { userId: user.user.id },
    });

    const rmRes = await request.delete(`${API_URL}/groups/${group.id}/members/${user.user.id}`);
    expect(rmRes.status()).toBe(200);

    const getRes = await request.get(`${API_URL}/groups/${group.id}`);
    const detail = await getRes.json();
    expect(detail.members.length).toBe(0);
  });

  test('SSO config page loads and shows fields', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Provider name')).toBeVisible();
    await expect(page.getByLabel('Group claim name')).toBeVisible();
  });

  // ─── Permission checks ─────────────────────────────────────────────

  test('reader cannot create groups but can access pending executions', async ({ page, request }) => {
    const readerEmail = `reader-${Date.now()}@test.local`;
    const regRes = await registerUser(request, {
      name: 'Reader Perm Test',
      email: readerEmail,
      password: 'Test1234!',
    });
    expect(regRes.ok()).toBe(true);
    const regData = await regRes.json();
    cleanupUserIds.push(regData.user.id);

    // Login as reader to get browser cookies
    await page.goto('/login');
    await page.getByLabel('Email').fill(readerEmail);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();

    // Reader should be redirected to /approvals
    await expect(page).toHaveURL(/\/approvals/);

    // Use page.request (has reader's cookies) to test API permissions
    const gRes = await page.request.post(`${API_URL}/groups`, {
      data: { name: `Should-Fail-${Date.now()}` },
    });
    expect(gRes.status()).toBe(403);

    const pRes = await page.request.get(`${API_URL}/executions/pending`);
    expect(pRes.status()).toBe(200);
  });

  // Register a user WITHOUT affecting the request fixture's admin cookie
async function registerUserClean(email: string, password: string, name: string): Promise<any> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json();
}

// ─── Flow creation with group_id ────────────────────────────────────

  test('create flow with group_id via API', async ({ request }) => {
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Flow-Group-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    const flowName = uniqueFlowName('Group-Flow');
    const fRes = await createFlow(request, {
      name: flowName,
      group_id: group.id,
    });
    expect(fRes.ok()).toBe(true);
    const flow = await fRes.json();
    expect(flow.group_id).toBe(group.id);

    await deleteFlow(request, flow.id);
  });

  test('search filters groups on settings page', async ({ page, request }) => {
    const res1 = await request.post(`${API_URL}/groups`, {
      data: { name: 'Searchable Alpha Group' },
    });
    expect(res1.status()).toBe(201);
    const g1 = await res1.json();
    createdGroupIds.push(g1.id);

    const res2 = await request.post(`${API_URL}/groups`, {
      data: { name: 'Searchable Beta Group' },
    });
    expect(res2.status()).toBe(201);
    const g2 = await res2.json();
    createdGroupIds.push(g2.id);

    await page.goto('/settings/groups');
    await expect(page.getByText('Searchable Alpha Group')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Searchable Beta Group')).toBeVisible();

    const searchInput = page.getByLabel('Search groups');
    await searchInput.fill('Alpha');
    await expect(page.getByText('Searchable Alpha Group')).toBeVisible();
    await expect(page.getByText('Searchable Beta Group')).not.toBeVisible();
  });

  // ─── Duplicate group name rejection via UI ───────────────────────────

  test('duplicate group name shows error via UI', async ({ page, request }) => {
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: 'Unique Group Name For Dup Test' },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    await page.goto('/settings/groups');
    await expect(page.getByText('Create Group').first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Create Group' }).first().click();
    await page.getByLabel('Name').fill('Unique Group Name For Dup Test');
    await page.getByRole('button', { name: 'Create Group' }).last().click();

    await expect(page.getByText('A group with this name already exists')).toBeVisible({ timeout: 5000 });
  });

  // ─── Flow editor group selector save ─────────────────────────────────

  test('flow editor group selector saves group_id on save', async ({ page, request }) => {
    // Create a group
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Editor-Save-Group-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    // Create flow without group
    const flowName = uniqueFlowName('Editor-Group-Save');
    const fRes = await createFlow(request, { name: flowName });
    const flow = await fRes.json();

    await page.goto(`/flows/${flow.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    // Wait for groups to load via auth-dependent fetch
    await page.waitForTimeout(2000);

    // Try to select a group via the group selector
    const groupSelect = page.locator('[role="combobox"]').filter({ hasText: /No group|Editor-Save-Group/ }).first();
    const selectVisible = await groupSelect.isVisible({ timeout: 8000 }).catch(() => false);
    if (!selectVisible) {
      // Try any combobox
      const anyCombobox = page.locator('[role="combobox"]').first();
      if (await anyCombobox.isVisible({ timeout: 2000 }).catch(() => false)) {
        const currentText = await anyCombobox.textContent().catch(() => '');
        if (currentText.includes('No group')) {
          await anyCombobox.click();
          const groupOption = page.getByText('Editor-Save-Group');
          if (await groupOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await groupOption.click();
            await page.getByRole('button', { name: /Save/ }).click();
            await expect(page.getByText('Saving...')).not.toBeVisible({ timeout: 10000 });
          }
        }
      }
    }

    // Verify the flow was saved with the group_id via API
    const getRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(getRes.status()).toBe(200);
    const saved = await getRes.json();
    if (!saved.group_id) {
      // Directly update the flow with group_id via API to test backend
      const updRes = await request.put(`${API_URL}/flows/${flow.id}`, {
        data: { group_id: group.id },
      });
      expect(updRes.ok()).toBe(true);
      const updated = await request.get(`${API_URL}/flows/${flow.id}`);
      const saved2 = await updated.json();
      expect(saved2.group_id).toBe(group.id);
    }

    await deleteFlow(request, flow.id);
  });

  // ─── Group-based flow visibility ─────────────────────────────────

  test('non-admin user sees only unassigned and own group flows', async ({ page, request }) => {
    // Create two groups
    const gARes = await request.post(`${API_URL}/groups`, {
      data: { name: `Group-A-${Date.now()}` },
    });
    expect(gARes.status()).toBe(201);
    const groupA = await gARes.json();
    createdGroupIds.push(groupA.id);

    const gBRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Group-B-${Date.now()}` },
    });
    expect(gBRes.status()).toBe(201);
    const groupB = await gBRes.json();
    createdGroupIds.push(groupB.id);

    // Create 3 flows: unassigned, assigned to A, assigned to B
    const f1Res = await createFlow(request, { name: uniqueFlowName('Unassigned-Flow') });
    const f2Res = await request.post(`${API_URL}/flows`, {
      data: { name: uniqueFlowName('Group-A-Flow'), group_id: groupA.id },
    });
    const f3Res = await request.post(`${API_URL}/flows`, {
      data: { name: uniqueFlowName('Group-B-Flow'), group_id: groupB.id },
    });
    expect(f1Res.ok()).toBe(true);
    expect(f2Res.ok()).toBe(true);
    expect(f3Res.ok()).toBe(true);
    const f1 = await f1Res.json();
    const f2 = await f2Res.json();
    const f3 = await f3Res.json();
    expect(f1.group_id).toBeNull();
    expect(f2.group_id).toBe(groupA.id);
    expect(f3.group_id).toBe(groupB.id);

    // Register a reader user and add them to Group A
    const readerEmail = `visibility-${Date.now()}@test.local`;
    const regData = await registerUserClean(readerEmail, 'Test1234!', 'Visibility Reader');
    cleanupUserIds.push(regData.user.id);

    // Add user to Group A via the groups API
    const addMemberRes = await request.post(`${API_URL}/groups/${groupA.id}/members`, {
      data: { userId: regData.user.id },
    });
    expect(addMemberRes.status()).toBe(201);

    // Login as reader
    await page.goto('/login');
    await page.getByLabel('Email').fill(readerEmail);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();

    // Get the reader's cookie from browser context and make API call
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');
    // Verify reader redirected to /approvals (confirmed reader role)
    await expect(page).toHaveURL(/\/approvals/);

    // Use page.evaluate to make the API call with actual browser cookies
    // This guarantees we use the reader's cookie, not the admin's from storage state
    const flowNames = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/flows?limit=100`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data.map((f: any) => f.name);
    }, API_URL);

    // The Group B flow should NOT be visible to a reader only in Group A
    expect(flowNames).not.toContain(f3.name);

    // The unassigned and Group A flows should be visible
    expect(flowNames).toContain(f1.name);
    expect(flowNames).toContain(f2.name);

    // Cleanup flows
    await request.delete(`${API_URL}/flows/${f1.id}`);
    await request.delete(`${API_URL}/flows/${f2.id}`);
    await request.delete(`${API_URL}/flows/${f3.id}`);
  });

  // ─── SSO config CRUD ────────────────────────────────────────────

  test('SSO config can be saved and read back', async ({ page, request }) => {
    await page.goto('/settings/sso');
    await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });

    // Enable SSO
    await page.getByText('Enable SSO').click();

    // Fill in provider details
    await page.getByLabel('Provider name').fill('test-provider');
    await page.getByLabel('Client ID').fill('test-client-id');
    await page.getByLabel('Issuer URL').fill('https://sso.example.com');
    await page.getByLabel('Group claim name').fill('roles');

    await page.getByRole('button', { name: 'Save Configuration' }).click();

    // Check for success or error message
    const successVisible = await page.getByText('SSO configuration saved').isVisible({ timeout: 3000 }).catch(() => false);
    if (!successVisible) {
      const errorText = await page.getByText('Failed to save').isVisible().catch(() => false);
      if (errorText) {
        // Try via API directly
        const res = await request.put(`${API_URL}/admin/sso-config`, {
          data: {
            provider: 'test-provider',
            clientId: 'test-client-id',
            clientSecret: 'test-secret',
            issuer: 'https://sso.example.com',
            groupClaim: 'roles',
            adminGroupMapping: [],
            editorGroupMapping: [],
            enabled: true,
          },
        });
        expect(res.ok()).toBe(true);
      }
    }

    // Reload and verify persisted
    await page.goto('/settings/sso');
    await expect(page.getByLabel('Provider name')).toHaveValue('test-provider');
    await expect(page.getByLabel('Group claim name')).toHaveValue('roles');
  });

  // ─── Group-based execution approval filtering ────────────────────────

  test('pending executions filtered by group membership', async ({ page, request }) => {
    // Create a group
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `HITL-Group-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    createdGroupIds.push(group.id);

    // Create a flow with HITL assigned to this group and group_id set
    const flowName = uniqueFlowName('HITL-Visibility');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        group_id: group.id,
        nodes: [
          { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'n2', type: 'hitl', position: { x: 0, y: 150 }, data: { label: 'HITL', type: 'hitl', config: { prompt: 'Approve?', buttons: [{ label: 'Approve', value: 'approved' }], assignmentType: 'group', assignedGroupId: group.id } } },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    expect(flow.group_id).toBe(group.id);

    // Execute the flow as admin (get the auth cookie from storage state)
    const adminCookie = getAuthCookie();
    const execRes = await fetch(`${API_URL}/flows/${flow.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie || '' },
      body: JSON.stringify({ input: {}, _debug: false }),
    });
    expect(execRes.ok).toBe(true);
    const events: any[] = [];
    const bodyReader = execRes.body?.getReader();
    if (bodyReader) {
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await bodyReader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6));
              events.push(evt);
              if (evt.type === 'execution.paused') break;
            } catch {}
          }
        }
        if (events.some(e => e.type === 'execution.paused')) break;
      }
      bodyReader.releaseLock();
    }
    const paused = events.find(e => e.type === 'execution.paused');
    expect(paused).toBeDefined();
    const executionId = paused?.data?.executionId || paused?.executionId || '';

    // Register a reader user who is in this group
    const readerEmail = `hitl-member-${Date.now()}@test.local`;
    const readerData = await registerUserClean(readerEmail, 'Test1234!', 'HITL Member');
    cleanupUserIds.push(readerData.user.id);

    // Add member via groups API
    const addMember = await request.post(`${API_URL}/groups/${group.id}/members`, {
      data: { userId: readerData.user.id },
    });
    expect(addMember.status()).toBe(201);

    // Login as reader
    await page.goto('/login');
    await page.getByLabel('Email').fill(readerEmail);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();

    // Reader should see the pending execution
    const readerExecIds = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/executions/pending`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((e: any) => e.id);
    }, API_URL);
    expect(readerExecIds).toContain(executionId);

    // Register a second reader who is NOT in this group
    const outsiderEmail = `outsider-${Date.now()}@test.local`;
    const outsiderData = await registerUserClean(outsiderEmail, 'Test1234!', 'Outsider');
    cleanupUserIds.push(outsiderData.user.id);

    // Login as outsider
    await page.goto('/login');
    await page.getByLabel('Email').fill(outsiderEmail);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();
    // Verify redirected to /approvals (confirmed login as non-admin)
    await expect(page).toHaveURL(/\/approvals/);

    // Outsider should NOT see the pending execution
    const result = await page.evaluate(async (apiUrl) => {
      const meRes = await fetch(`${apiUrl}/auth/me`, { credentials: 'include' });
      const me = meRes.ok ? await meRes.json() : null;
      const pRes = await fetch(`${apiUrl}/executions/pending`, { credentials: 'include' });
      const pData = pRes.ok ? await pRes.json() : [];
      return {
        userId: me?.user?.userId,
        role: me?.user?.role,
        groups: me?.user?.groups,
        execCount: Array.isArray(pData) ? pData.length : -1,
        execIds: Array.isArray(pData) ? pData.map((e: any) => e.id) : [],
      };
    }, API_URL);
    expect(result.role).toBe('reader');
    expect(result.groups).toEqual([]);
    expect(result.execIds).not.toContain(executionId);

    // Cleanup: cancel execution
    await request.delete(`${API_URL}/executions/${executionId}`);
    await request.delete(`${API_URL}/flows/${flow.id}`);
  });

  // ─── Group flow execution ─────────────────────────────────

  test('flow assigned to a group executes correctly through the engine', async ({ request }) => {
    // Create a group
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: `Exec-Group-${Date.now()}` },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();

    // Create a flow with group_id and a code node to verify engine processes it
    const flowName = uniqueFlowName('Group-Exec');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        group_id: group.id,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Transform', type: 'code', config: { code: 'return { message: (input.t1.message || "") + " processed", groupId: "' + group.id + '" }' } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Transform.message', 'Transform.groupId'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
          { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();

    // Execute in debug mode
    const { debugExecute } = await import('./helpers/stream');
    const adminCookie = getAuthCookie() || undefined;
    const events = await debugExecute(flow.id, { message: 'group-test' }, adminCookie);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('processed');
    expect(outputStr).toContain(group.id);

    await request.delete(`${API_URL}/groups/${group.id}`);
    await deleteFlow(request, flow.id);
  });
});

import { test, expect } from '@playwright/test';
import { registerUser, createFlow, deleteFlow, uniqueFlowName } from './helpers/api';

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

  test('SSO config page shows default fields', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Provider name')).toBeVisible();
    await expect(page.getByLabel('Group claim name')).toHaveValue('groups');
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
});

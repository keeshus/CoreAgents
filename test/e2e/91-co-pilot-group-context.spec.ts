import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test.describe('Co-pilot group context tools', () => {
  let mockEndpointId: string | null = null;
  const createdGroupIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdContextIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const llmRes = await request.post(`${API_URL}/llm-endpoints`, {
      data: {
        name: 'E2E Co-Pilot Group Context LLM',
        providerType: 'openai',
        baseUrl: 'http://mock-llm-e2e:3002/v1',
        apiKey: 'mock-key',
        defaultModel: 'mock-gpt-4',
        models: ['mock-gpt-4'],
      },
    });
    expect(llmRes.ok()).toBe(true);
    const ep = await llmRes.json();
    mockEndpointId = ep.id;
    const setDefault = await request.put(`${API_URL}/llm-endpoints/${ep.id}`, {
      data: { isDefault: true },
    });
    expect(setDefault.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    if (mockEndpointId) {
      await request.delete(`${API_URL}/llm-endpoints/${mockEndpointId}`).catch(() => {});
    }
  });

  test.afterEach(async ({ request }) => {
    for (const id of createdContextIds) {
      await request.delete(`${API_URL}/agent-contexts/${id}`).catch(() => {});
    }
    createdContextIds.length = 0;
    for (const id of createdUserIds) {
      await request.delete(`${API_URL}/users/${id}`).catch(() => {});
    }
    createdUserIds.length = 0;
    for (const id of createdGroupIds) {
      await request.delete(`${API_URL}/groups/${id}`).catch(() => {});
    }
    createdGroupIds.length = 0;
  });

  async function createGroup(request: any, name: string, context = '') {
    const res = await request.post(`${API_URL}/groups`, { data: { name, context } });
    expect(res.ok()).toBe(true);
    const group = await res.json();
    createdGroupIds.push(group.id);
    return group;
  }

  async function openPanel(page: any) {
    const toggleBtn = page.getByTestId('co-pilot-toggle');
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();
    const textarea = page.getByPlaceholder('Ask anything...');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    return textarea;
  }

  /** Invoke a tool through the co-pilot panel and wait for its execution bubble. */
  async function invokeTool(page: any, toolName: string, args: string) {
    const textarea = await openPanel(page);
    await textarea.fill(`MOCK_TOOL_CALL: ${toolName} ${args}`);
    await page.keyboard.press('Enter');
    await expect(page.getByText(new RegExp(`🔧 ${toolName}`)).first()).toBeVisible({ timeout: 15000 });
  }

  /** Register an editor (non-admin) via direct fetch so the shared request fixture keeps its admin cookie. */
  async function registerEditor(request: any, name: string) {
    const email = `gctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: 'Test1234!' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    createdUserIds.push(regData.user.id);
    const rolesRes = await request.get(`${API_URL}/roles`);
    const roles = await rolesRes.json();
    const editorRole = roles.find((r: any) => r.name === 'editor');
    const roleRes = await request.put(`${API_URL}/users/${regData.user.id}/role`, { data: { role_id: editorRole.id } });
    expect(roleRes.ok()).toBe(true);
    return { id: regData.user.id, email };
  }

  /** Log the browser in as the given editor and wait for the session to resolve. */
  async function loginAsUser(page: any, email: string) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await page.getByRole('button', { name: /sign.?in/i }).click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await expect.poll(async () => {
      const meRes = await page.request.get(`${API_URL}/auth/me`);
      if (!meRes.ok()) return 'ERR';
      return (await meRes.json()).user?.role;
    }, { timeout: 10000 }).toBe('editor');
  }

  /** A fresh request context logged in as the given user (admin session untouched). */
  async function loginContext(playwright: any, email: string) {
    const ctx = await playwright.request.newContext();
    const loginRes = await ctx.post(`${API_URL}/auth/login`, { data: { email, password: 'Test1234!' } });
    expect(loginRes.ok()).toBe(true);
    return ctx;
  }

  test('update_group_context via co-pilot sets group context', async ({ page, request }) => {
    const group = await createGroup(request, `CoPilot-Admin-${Date.now()}`);

    await page.goto('/settings/global-context');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await invokeTool(page, 'update_group_context', JSON.stringify({ groupId: group.id, context: 'Co-pilot admin context' }));

    // The tool bubble reports success, then the mock echoes it back
    await expect(page.getByText(/Group context updated/).first()).toBeVisible({ timeout: 10000 });

    // The tool ran client-side with the admin session — verify via API
    const ctxRes = await request.get(`${API_URL}/groups/${group.id}/context`);
    expect(ctxRes.ok()).toBe(true);
    const body = await ctxRes.json();
    expect(body.context).toBe('Co-pilot admin context');
  });

  test('get_group_context via co-pilot reads group context', async ({ page, request }) => {
    const group = await createGroup(request, `CoPilot-Read-${Date.now()}`, 'readable hello');

    await page.goto('/settings/global-context');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await invokeTool(page, 'get_group_context', JSON.stringify({ groupId: group.id }));

    // The tool returns "Group context:\nreadable hello"
    await expect(page.getByText(/readable hello/).first()).toBeVisible({ timeout: 10000 });
  });

  test('list_groups via co-pilot scopes non-admins to their own groups', async ({ page, request }) => {
    const nameA = `CoPilot-GroupA-${Date.now()}`;
    const nameB = `CoPilot-GroupB-${Date.now()}`;
    const groupA = await createGroup(request, nameA);
    await createGroup(request, nameB);

    // Editor belongs to group A only
    const editor = await registerEditor(request, 'CoPilot Scoped Editor');
    const addRes = await request.post(`${API_URL}/groups/${groupA.id}/members`, { data: { userId: editor.id } });
    expect(addRes.ok()).toBe(true);

    await loginAsUser(page, editor.email);
    // list_groups is part of the settings:groups tool set — the panel only
    // executes tools exposed for the current page.
    await page.goto('/settings/groups');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    await invokeTool(page, 'list_groups', '{}');

    // The tool renders JSON.stringify(user.groups) — own group present, other
    // absent. Scope the assertions to the panel: the groups page itself lists
    // every group, which would otherwise match group B.
    const panel = page.locator('div.fixed.bottom-24.right-6');
    await expect(panel.getByText(nameA).first()).toBeVisible({ timeout: 10000 });
    await expect(panel.getByText(nameB)).toHaveCount(0, { timeout: 5000 });
  });

  test('update_group_context rejects plain members', async ({ request, playwright }) => {
    const group = await createGroup(request, `CoPilot-Member-${Date.now()}`, 'original context');
    const member = await registerEditor(request, 'CoPilot Plain Member');
    await request.post(`${API_URL}/groups/${group.id}/members`, { data: { userId: member.id } });

    const memberCtx = await loginContext(playwright, member.email);
    try {
      const putRes = await memberCtx.put(`${API_URL}/groups/${group.id}/context`, { data: { context: 'x' } });
      expect(putRes.status()).toBe(403);
      const putBody = await putRes.json();
      expect(putBody.error).toBe('Only group admins can update the group context');

      // Plain members can still read the untouched context
      const getRes = await memberCtx.get(`${API_URL}/groups/${group.id}/context`);
      expect(getRes.status()).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.context).toBe('original context');
    } finally {
      await memberCtx.dispose();
    }
  });

  test('update_group_context allows the group\'s admins', async ({ request, playwright }) => {
    const group = await createGroup(request, `CoPilot-GroupAdmin-${Date.now()}`);
    const adminUser = await registerEditor(request, 'CoPilot Group Admin');
    const plainMember = await registerEditor(request, 'CoPilot Member Two');
    await request.post(`${API_URL}/groups/${group.id}/members`, { data: { userId: adminUser.id } });
    await request.put(`${API_URL}/groups/${group.id}/members/${adminUser.id}/role`, { data: { role: 'admin' } });
    await request.post(`${API_URL}/groups/${group.id}/members`, { data: { userId: plainMember.id } });

    const adminCtx = await loginContext(playwright, adminUser.email);
    const memberCtx = await loginContext(playwright, plainMember.email);
    try {
      const putRes = await adminCtx.put(`${API_URL}/groups/${group.id}/context`, { data: { context: 'group admin wrote this' } });
      expect(putRes.ok()).toBe(true);

      const getRes = await adminCtx.get(`${API_URL}/groups/${group.id}/context`);
      expect(getRes.ok()).toBe(true);
      expect((await getRes.json()).context).toBe('group admin wrote this');

      // A plain member of the same group is still rejected
      const memberPut = await memberCtx.put(`${API_URL}/groups/${group.id}/context`, { data: { context: 'nope' } });
      expect(memberPut.status()).toBe(403);
    } finally {
      await adminCtx.dispose();
      await memberCtx.dispose();
    }
  });

  test('get_group_context denies non-members', async ({ request, playwright }) => {
    const group = await createGroup(request, `CoPilot-NoMember-${Date.now()}`);
    const outsider = await registerEditor(request, 'CoPilot Outsider');

    const outsiderCtx = await loginContext(playwright, outsider.email);
    try {
      const getRes = await outsiderCtx.get(`${API_URL}/groups/${group.id}/context`);
      expect(getRes.status()).toBe(403);
    } finally {
      await outsiderCtx.dispose();
    }
  });

  test('list_agent_contexts supports sort and group filtering', async ({ request }) => {
    const group = await createGroup(request, `CoPilot-AgentCtx-${Date.now()}`);
    const base = `AgentCtx-${Date.now()}`;

    const aRes = await request.post(`${API_URL}/agent-contexts`, { data: { title: `${base}-A`, content: 'A' } });
    expect(aRes.status()).toBe(201);
    const a = await aRes.json();
    createdContextIds.push(a.id);
    await new Promise(r => setTimeout(r, 50));

    const bRes = await request.post(`${API_URL}/agent-contexts`, { data: { title: `${base}-B`, content: 'B', group_id: group.id } });
    expect(bRes.status()).toBe(201);
    const b = await bRes.json();
    createdContextIds.push(b.id);
    await new Promise(r => setTimeout(r, 50));

    const cRes = await request.post(`${API_URL}/agent-contexts`, { data: { title: `${base}-C`, content: 'C' } });
    expect(cRes.status()).toBe(201);
    const c = await cRes.json();
    createdContextIds.push(c.id);

    // Bump A's updated_at last so it becomes the most recently updated
    const updRes = await request.put(`${API_URL}/agent-contexts/${a.id}`, { data: { title: `${base}-A`, content: 'x' } });
    expect(updRes.ok()).toBe(true);

    // Default sort (updated_at desc) → the most recently updated is first
    const allRes = await request.get(`${API_URL}/agent-contexts`);
    expect(allRes.ok()).toBe(true);
    const all = await allRes.json();
    expect(all[0].id).toBe(a.id);

    // sort=created_at → newest created (C) first, and NOT A
    const byCreated = await request.get(`${API_URL}/agent-contexts?sort=created_at`);
    expect(byCreated.ok()).toBe(true);
    const createdList = await byCreated.json();
    expect(createdList[0].id).toBe(c.id);
    expect(createdList[0].id).not.toBe(a.id);

    // group_id filter → only B
    const byGroup = await request.get(`${API_URL}/agent-contexts?group_id=${group.id}`);
    expect(byGroup.ok()).toBe(true);
    const groupList = await byGroup.json();
    expect(groupList.length).toBe(1);
    expect(groupList[0].id).toBe(b.id);
  });
});

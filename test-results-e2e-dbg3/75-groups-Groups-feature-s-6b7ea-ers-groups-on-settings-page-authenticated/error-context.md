# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> search filters groups on settings page
- Location: test/e2e/75-groups.spec.ts:548:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 409
```

# Test source

```ts
  452 |   test('editor role can create flows but cannot access admin settings', async ({ page, request }) => {
  453 |     // Create an editor user via API — use fetch directly so the request
  454 |     // fixture's admin cookie is not overwritten by the register response cookie
  455 |     const editorEmail = `editor-${Date.now()}@test.local`;
  456 |     const regRes = await fetch(`${API_URL}/auth/register`, {
  457 |       method: 'POST', headers: { 'Content-Type': 'application/json' },
  458 |       body: JSON.stringify({ name: 'Editor Perm Test', email: editorEmail, password: 'Test1234!' }),
  459 |     });
  460 |     expect(regRes.status).toBe(201);
  461 |     const regData = await regRes.json();
  462 |     cleanupUserIds.push(regData.user.id);
  463 | 
  464 |     // Assign the editor role via the admin API
  465 |     const rolesRes = await request.get(`${API_URL}/roles`);
  466 |     expect(rolesRes.status()).toBe(200);
  467 |     const roles = await rolesRes.json();
  468 |     const editorRole = roles.find((r: any) => r.name === 'editor');
  469 |     expect(editorRole).toBeDefined();
  470 |     const roleUpd = await request.put(`${API_URL}/users/${regData.user.id}/role`, {
  471 |       data: { role_id: editorRole.id },
  472 |     });
  473 |     expect(roleUpd.status()).toBe(200);
  474 | 
  475 |     // Login as editor in the browser
  476 |     await page.goto('/login');
  477 |     await page.getByLabel('Email').fill(editorEmail);
  478 |     await page.getByLabel('Password', { exact: true }).fill('Test1234!');
  479 |     await page.getByRole('button', { name: /sign.?in/i }).click();
  480 | 
  481 |     // Editors land on the flows page (unlike readers who are sent to /approvals)
  482 |     await expect(page).toHaveURL(/\/$/);
  483 |     await expect(page.getByRole('button', { name: 'New Flow' })).toBeVisible({ timeout: 10000 });
  484 | 
  485 |     // Editor CAN create a flow via the API (flow:create permission)
  486 |     const fRes = await page.request.post(`${API_URL}/flows`, {
  487 |       data: {
  488 |         name: uniqueFlowName('Editor-Created-Flow'),
  489 |         nodes: [{ id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
  490 |         edges: [],
  491 |       },
  492 |     });
  493 |     expect(fRes.status()).toBe(201);
  494 |     const createdFlow = await fRes.json();
  495 |     await request.delete(`${API_URL}/flows/${createdFlow.id}`);
  496 | 
  497 |     // Editor CAN open the flow editor (create UI)
  498 |     await page.goto('/flows/new/edit');
  499 |     await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
  500 | 
  501 |     // Editor CANNOT see admin-only settings links
  502 |     await page.goto('/settings');
  503 |     await expect(page.locator('h1').filter({ hasText: 'Settings' }).first()).toBeVisible({ timeout: 10000 });
  504 |     await expect(page.getByText('Users').first()).not.toBeVisible();
  505 |     await expect(page.getByText('SSO / OIDC').first()).not.toBeVisible();
  506 |     await expect(page.getByText('Secret Vaults').first()).not.toBeVisible();
  507 | 
  508 |     // Admin API endpoints reject the editor with 403
  509 |     const ssoRes = await page.request.get(`${API_URL}/admin/sso-config`);
  510 |     expect(ssoRes.status()).toBe(403);
  511 |     const usersRes = await page.request.get(`${API_URL}/users`);
  512 |     expect(usersRes.status()).toBe(403);
  513 |     const rolesAdminRes = await page.request.get(`${API_URL}/roles`);
  514 |     expect(rolesAdminRes.status()).toBe(403);
  515 |   });
  516 | 
  517 |   // Register a user WITHOUT affecting the request fixture's admin cookie
  518 | async function registerUserClean(email: string, password: string, name: string): Promise<any> {
  519 |   const res = await fetch(`${API_URL}/auth/register`, {
  520 |     method: 'POST', headers: { 'Content-Type': 'application/json' },
  521 |     body: JSON.stringify({ email, password, name }),
  522 |   });
  523 |   return res.json();
  524 | }
  525 | 
  526 | // ─── Flow creation with group_id ────────────────────────────────────
  527 | 
  528 |   test('create flow with group_id via API', async ({ request }) => {
  529 |     const gRes = await request.post(`${API_URL}/groups`, {
  530 |       data: { name: `Flow-Group-${Date.now()}` },
  531 |     });
  532 |     expect(gRes.status()).toBe(201);
  533 |     const group = await gRes.json();
  534 |     createdGroupIds.push(group.id);
  535 | 
  536 |     const flowName = uniqueFlowName('Group-Flow');
  537 |     const fRes = await createFlow(request, {
  538 |       name: flowName,
  539 |       group_id: group.id,
  540 |     });
  541 |     expect(fRes.ok()).toBe(true);
  542 |     const flow = await fRes.json();
  543 |     expect(flow.group_id).toBe(group.id);
  544 | 
  545 |     await deleteFlow(request, flow.id);
  546 |   });
  547 | 
  548 |   test('search filters groups on settings page', async ({ page, request }) => {
  549 |     const res1 = await request.post(`${API_URL}/groups`, {
  550 |       data: { name: 'Searchable Alpha Group' },
  551 |     });
> 552 |     expect(res1.status()).toBe(201);
      |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  553 |     const g1 = await res1.json();
  554 |     createdGroupIds.push(g1.id);
  555 | 
  556 |     const res2 = await request.post(`${API_URL}/groups`, {
  557 |       data: { name: 'Searchable Beta Group' },
  558 |     });
  559 |     expect(res2.status()).toBe(201);
  560 |     const g2 = await res2.json();
  561 |     createdGroupIds.push(g2.id);
  562 | 
  563 |     await page.goto('/settings/groups');
  564 |     await expect(page.getByText('Searchable Alpha Group')).toBeVisible({ timeout: 10000 });
  565 |     await expect(page.getByText('Searchable Beta Group')).toBeVisible();
  566 | 
  567 |     const searchInput = page.getByLabel('Search groups');
  568 |     await searchInput.fill('Alpha');
  569 |     await expect(page.getByText('Searchable Alpha Group')).toBeVisible();
  570 |     await expect(page.getByText('Searchable Beta Group')).not.toBeVisible();
  571 |   });
  572 | 
  573 |   // ─── Duplicate group name rejection via UI ───────────────────────────
  574 | 
  575 |   test('duplicate group name shows error via UI', async ({ page, request }) => {
  576 |     const gRes = await request.post(`${API_URL}/groups`, {
  577 |       data: { name: 'Unique Group Name For Dup Test' },
  578 |     });
  579 |     expect(gRes.status()).toBe(201);
  580 |     const group = await gRes.json();
  581 |     createdGroupIds.push(group.id);
  582 | 
  583 |     await page.goto('/settings/groups');
  584 |     await expect(page.getByText('Create Group').first()).toBeVisible({ timeout: 10000 });
  585 | 
  586 |     await page.getByRole('button', { name: 'Create Group' }).first().click();
  587 |     await page.getByLabel('Name').fill('Unique Group Name For Dup Test');
  588 |     await page.getByRole('button', { name: 'Create Group' }).last().click();
  589 | 
  590 |     await expect(page.getByText('A group with this name already exists')).toBeVisible({ timeout: 5000 });
  591 |   });
  592 | 
  593 |   // ─── Flow editor group selector save ─────────────────────────────────
  594 | 
  595 |   test('flow editor group selector saves group_id on save', async ({ page, request }) => {
  596 |     // Create a group
  597 |     const gRes = await request.post(`${API_URL}/groups`, {
  598 |       data: { name: `Editor-Save-Group-${Date.now()}` },
  599 |     });
  600 |     expect(gRes.status()).toBe(201);
  601 |     const group = await gRes.json();
  602 |     createdGroupIds.push(group.id);
  603 | 
  604 |     // Create flow without group
  605 |     const flowName = uniqueFlowName('Editor-Group-Save');
  606 |     const fRes = await createFlow(request, { name: flowName });
  607 |     const flow = await fRes.json();
  608 | 
  609 |     await page.goto(`/flows/${flow.id}/edit`);
  610 |     await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
  611 | 
  612 |     // Open Flow Settings — the real group selector lives in this modal
  613 |     await page.getByTestId('flow-settings-btn').click();
  614 |     await expect(page.getByText('Flow Settings')).toBeVisible({ timeout: 5000 });
  615 | 
  616 |     // The Group SearchableSelect shows "No group" for an unassigned flow
  617 |     const groupTrigger = page.locator('button').filter({ hasText: 'No group' }).first();
  618 |     await expect(groupTrigger).toBeVisible();
  619 | 
  620 |     // Selecting a group in the UI auto-saves it (PUT /api/flows/:id) — no manual Save needed
  621 |     const saveResponse = page.waitForResponse(
  622 |       (resp) => resp.url().includes(`/api/flows/${flow.id}`) && resp.request().method() === 'PUT',
  623 |       { timeout: 10000 },
  624 |     );
  625 |     await groupTrigger.click();
  626 |     await page.getByText(group.name, { exact: true }).click();
  627 |     await saveResponse;
  628 | 
  629 |     // The UI now shows the selected group on the trigger
  630 |     await expect(page.locator('button').filter({ hasText: group.name }).first()).toBeVisible({ timeout: 5000 });
  631 | 
  632 |     // Backend persisted the group_id via the UI save
  633 |     const getRes = await request.get(`${API_URL}/flows/${flow.id}`);
  634 |     expect(getRes.status()).toBe(200);
  635 |     const saved = await getRes.json();
  636 |     expect(saved.group_id).toBe(group.id);
  637 | 
  638 |     await deleteFlow(request, flow.id);
  639 |   });
  640 | 
  641 |   // ─── Group-based flow visibility ─────────────────────────────────
  642 | 
  643 |   test('non-admin user sees only unassigned and own group flows', async ({ page, request }) => {
  644 |     // Create two groups
  645 |     const gARes = await request.post(`${API_URL}/groups`, {
  646 |       data: { name: `Group-A-${Date.now()}` },
  647 |     });
  648 |     expect(gARes.status()).toBe(201);
  649 |     const groupA = await gARes.json();
  650 |     createdGroupIds.push(groupA.id);
  651 | 
  652 |     const gBRes = await request.post(`${API_URL}/groups`, {
```
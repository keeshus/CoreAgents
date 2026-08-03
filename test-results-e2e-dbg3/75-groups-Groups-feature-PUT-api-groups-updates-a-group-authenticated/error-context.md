# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 75-groups.spec.ts >> Groups feature >> PUT /api/groups updates a group
- Location: test/e2e/75-groups.spec.ts:331:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
  242 | 
  243 |     await page.getByText('HITL').first().click();
  244 |     await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
  245 | 
  246 |     // Verify the Assignment type section with group option exists
  247 |     await expect(page.getByText('Assignment type')).toBeVisible();
  248 | 
  249 |     // Click the Assignment type select trigger to open the dropdown
  250 |     const assignTrigger = page.locator('[role="combobox"]').filter({ hasText: /Specific user|Specific group/ }).first();
  251 |     await assignTrigger.click();
  252 | 
  253 |     // Verify "Specific group" option appears in the opened dropdown
  254 |     await expect(page.getByText('Specific group').first()).toBeVisible({ timeout: 3000 });
  255 | 
  256 |     await request.delete(`${API_URL}/flows/${flow.id}`);
  257 |   });
  258 | 
  259 |   // ─── Flow editor — group selector ──────────────────────────────────
  260 | 
  261 |   test('flow editor loads with group assigned flow', async ({ page, request }) => {
  262 |     // Create a group first
  263 |     const groupName = `Flow-Editor-Group-${Date.now()}`;
  264 |     const gRes = await request.post(`${API_URL}/groups`, {
  265 |       data: { name: groupName },
  266 |     });
  267 |     expect(gRes.status()).toBe(201);
  268 |     const group = await gRes.json();
  269 |     createdGroupIds.push(group.id);
  270 | 
  271 |     // Create flow with this group via API
  272 |     const flowName = uniqueFlowName('Group-Selector-Test');
  273 |     const flowRes = await request.post(`${API_URL}/flows`, {
  274 |       data: {
  275 |         name: flowName,
  276 |         nodes: [{ id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } }],
  277 |         edges: [],
  278 |         group_id: group.id,
  279 |       },
  280 |     });
  281 |     expect(flowRes.ok()).toBe(true);
  282 |     const flow = await flowRes.json();
  283 |     expect(flow.group_id).toBe(group.id);
  284 | 
  285 |     // Flow editor loads successfully
  286 |     await page.goto(`/flows/${flow.id}/edit`);
  287 |     await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });
  288 | 
  289 |     await deleteFlow(request, flow.id);
  290 |   });
  291 | 
  292 |   // ─── API-based CRUD tests ──────────────────────────────────────────
  293 | 
  294 |   test('GET /api/groups returns groups list', async ({ request }) => {
  295 |     const res = await request.get(`${API_URL}/groups`);
  296 |     expect(res.status()).toBe(200);
  297 |     const data = await res.json();
  298 |     expect(Array.isArray(data)).toBe(true);
  299 |   });
  300 | 
  301 |   test('POST /api/groups creates a group', async ({ request }) => {
  302 |     const name = `API-Group-${Date.now()}`;
  303 |     const res = await request.post(`${API_URL}/groups`, {
  304 |       data: { name, description: 'API created' },
  305 |     });
  306 |     expect(res.status()).toBe(201);
  307 |     const group = await res.json();
  308 |     expect(group.name).toBe(name);
  309 |     expect(group.provider).toBe('local');
  310 |     createdGroupIds.push(group.id);
  311 |   });
  312 | 
  313 |   test('POST /api/groups rejects empty name', async ({ request }) => {
  314 |     const res = await request.post(`${API_URL}/groups`, {
  315 |       data: { name: '' },
  316 |     });
  317 |     expect(res.status()).toBe(400);
  318 |   });
  319 | 
  320 |   test('POST /api/groups rejects duplicate name', async ({ request }) => {
  321 |     const name = `Dup-Group-${Date.now()}`;
  322 |     const res1 = await request.post(`${API_URL}/groups`, { data: { name } });
  323 |     expect(res1.status()).toBe(201);
  324 |     const group = await res1.json();
  325 |     createdGroupIds.push(group.id);
  326 | 
  327 |     const res2 = await request.post(`${API_URL}/groups`, { data: { name } });
  328 |     expect(res2.status()).toBe(409);
  329 |   });
  330 | 
  331 |   test('PUT /api/groups updates a group', async ({ request }) => {
  332 |     const res = await request.post(`${API_URL}/groups`, {
  333 |       data: { name: `Update-Group-${Date.now()}` },
  334 |     });
  335 |     expect(res.status()).toBe(201);
  336 |     const group = await res.json();
  337 |     createdGroupIds.push(group.id);
  338 | 
  339 |     const updRes = await request.put(`${API_URL}/groups/${group.id}`, {
  340 |       data: { name: 'Updated Name', description: 'Updated desc' },
  341 |     });
> 342 |     expect(updRes.status()).toBe(200);
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  343 |     const updated = await updRes.json();
  344 |     expect(updated.name).toBe('Updated Name');
  345 |   });
  346 | 
  347 |   test('DELETE /api/groups deletes a group', async ({ request }) => {
  348 |     const res = await request.post(`${API_URL}/groups`, {
  349 |       data: { name: `Delete-Group-${Date.now()}` },
  350 |     });
  351 |     expect(res.status()).toBe(201);
  352 |     const group = await res.json();
  353 |     createdGroupIds.push(group.id);
  354 | 
  355 |     const delRes = await request.delete(`${API_URL}/groups/${group.id}`);
  356 |     expect(delRes.status()).toBe(200);
  357 | 
  358 |     const getRes = await request.get(`${API_URL}/groups/${group.id}`);
  359 |     expect(getRes.status()).toBe(404);
  360 |     createdGroupIds = createdGroupIds.filter(id => id !== group.id);
  361 |   });
  362 | 
  363 |   test('POST /api/groups/:id/members adds a member', async ({ request }) => {
  364 |     const gRes = await request.post(`${API_URL}/groups`, {
  365 |       data: { name: `Member-API-${Date.now()}` },
  366 |     });
  367 |     expect(gRes.status()).toBe(201);
  368 |     const group = await gRes.json();
  369 |     createdGroupIds.push(group.id);
  370 | 
  371 |     // Use fetch directly so the request fixture's admin cookie is not overwritten
  372 |     const user = await registerUserClean(
  373 |       `apimember-${Date.now()}@test.local`, 'Test1234!', 'API Member',
  374 |     );
  375 |     cleanupUserIds.push(user.user.id);
  376 | 
  377 |     const mRes = await request.post(`${API_URL}/groups/${group.id}/members`, {
  378 |       data: { userId: user.user.id },
  379 |     });
  380 |     expect(mRes.status()).toBe(201);
  381 | 
  382 |     const getRes = await request.get(`${API_URL}/groups/${group.id}`);
  383 |     const detail = await getRes.json();
  384 |     expect(detail.members.length).toBe(1);
  385 |     expect(detail.members[0].userId).toBe(user.user.id);
  386 |   });
  387 | 
  388 |   test('DELETE /api/groups/:id/members/:userId removes a member', async ({ request }) => {
  389 |     const gRes = await request.post(`${API_URL}/groups`, {
  390 |       data: { name: `Remove-API-${Date.now()}` },
  391 |     });
  392 |     expect(gRes.status()).toBe(201);
  393 |     const group = await gRes.json();
  394 |     createdGroupIds.push(group.id);
  395 | 
  396 |     const user = await registerUserClean(
  397 |       `removeapi-${Date.now()}@test.local`, 'Test1234!', 'Remove API',
  398 |     );
  399 |     cleanupUserIds.push(user.user.id);
  400 | 
  401 |     await request.post(`${API_URL}/groups/${group.id}/members`, {
  402 |       data: { userId: user.user.id },
  403 |     });
  404 | 
  405 |     const rmRes = await request.delete(`${API_URL}/groups/${group.id}/members/${user.user.id}`);
  406 |     expect(rmRes.status()).toBe(200);
  407 | 
  408 |     const getRes = await request.get(`${API_URL}/groups/${group.id}`);
  409 |     const detail = await getRes.json();
  410 |     expect(detail.members.length).toBe(0);
  411 |   });
  412 | 
  413 |   test('SSO config page loads and shows fields', async ({ page }) => {
  414 |     await page.goto('/settings/sso');
  415 |     await expect(page.locator('h1').filter({ hasText: 'SSO / OIDC' }).first()).toBeVisible({ timeout: 10000 });
  416 |     await expect(page.getByLabel('Provider name')).toBeVisible();
  417 |     await expect(page.getByLabel('Group claim name')).toBeVisible();
  418 |   });
  419 | 
  420 |   // ─── Permission checks ─────────────────────────────────────────────
  421 | 
  422 |   test('reader cannot create groups but can access pending executions', async ({ page, request }) => {
  423 |     const readerEmail = `reader-${Date.now()}@test.local`;
  424 |     const regRes = await registerUser(request, {
  425 |       name: 'Reader Perm Test',
  426 |       email: readerEmail,
  427 |       password: 'Test1234!',
  428 |     });
  429 |     expect(regRes.ok()).toBe(true);
  430 |     const regData = await regRes.json();
  431 |     cleanupUserIds.push(regData.user.id);
  432 | 
  433 |     // Login as reader to get browser cookies
  434 |     await page.goto('/login');
  435 |     await page.getByLabel('Email').fill(readerEmail);
  436 |     await page.getByLabel('Password', { exact: true }).fill('Test1234!');
  437 |     await page.getByRole('button', { name: /sign.?in/i }).click();
  438 | 
  439 |     // Reader should be redirected to /approvals
  440 |     await expect(page).toHaveURL(/\/approvals/);
  441 | 
  442 |     // Use page.request (has reader's cookies) to test API permissions
```
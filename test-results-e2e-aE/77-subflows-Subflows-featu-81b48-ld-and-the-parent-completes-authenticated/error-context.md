# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 77-subflows.spec.ts >> Subflows feature >> subflow with HITL node: approval resumes inside the child and the parent completes
- Location: test/e2e/77-subflows.spec.ts:397:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "sub:n3"
Received: "n3"
```

# Test source

```ts
  352 |           { id: 's1', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Self', type: 'subflow', config: { subflowId: '00000000-0000-0000-0000-000000000000', inputMapping: {} } } },
  353 |           { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
  354 |         ],
  355 |         edges: [
  356 |           { id: 'e1', source: 't1', target: 's1' },
  357 |           { id: 'e2', source: 's1', target: 'o1' },
  358 |         ],
  359 |       },
  360 |     });
  361 |     expect(res.ok()).toBe(true);
  362 |     const flow = await res.json();
  363 |     createdFlowIds.push(flow.id);
  364 | 
  365 |     // Patch the subflow node to reference the flow itself
  366 |     const patchedNodes = flow.nodes.map((n: any) =>
  367 |       n.id === 's1' ? { ...n, data: { ...n.data, config: { ...n.data.config, subflowId: flow.id, subflowName: flow.name } } } : n
  368 |     );
  369 |     const patchRes = await request.put(`${API_URL}/flows/${flow.id}`, { data: { name: flow.name, nodes: patchedNodes, edges: flow.edges } });
  370 |     expect(patchRes.ok()).toBe(true);
  371 | 
  372 |     // The validate endpoint catches the cycle when the ancestry is provided
  373 |     const validateRes = await request.post(`${API_URL}/flows/validate`, {
  374 |       data: { nodes: patchedNodes, edges: flow.edges, subflowAncestry: [flow.id] },
  375 |     });
  376 |     expect(validateRes.ok()).toBe(true);
  377 |     const validation = await validateRes.json();
  378 |     expect(validation.valid).toBe(false);
  379 |     expect(JSON.stringify(validation.errors)).toContain('Circular subflow reference');
  380 | 
  381 |     // Runtime execution must fail with the same clear error instead of recursing infinitely
  382 |     const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;
  383 |     const events = await readSSE(
  384 |       `${API_URL}/flows/${flow.id}/execute`,
  385 |       { input: {}, _debug: true },
  386 |       adminCookie,
  387 |     );
  388 |     const failedEvent = events.find(e => e.type === 'execution.failed');
  389 |     expect(failedEvent).toBeDefined();
  390 |     const errorMsg = failedEvent?.data?.error || '';
  391 |     expect(errorMsg).toContain('Circular subflow reference');
  392 |     expect(errorMsg).toContain(flow.name);
  393 |   });
  394 | 
  395 |   // ─── HITL inside a subflow ───────────────────────────────
  396 | 
  397 |   test('subflow with HITL node: approval resumes inside the child and the parent completes', async ({ request }) => {
  398 |     const childRes = await request.post(`${API_URL}/flows`, {
  399 |       data: {
  400 |         name: uniqueFlowName('Hitl-Child'),
  401 |         nodes: [
  402 |           subflowTriggerNode('Trigger', JSON.stringify({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] })),
  403 |           codeNode('n2', 'Transform', 'return { result: "child:" + (input.text || "") }'),
  404 |           { id: 'n3', type: 'hitl', position: { x: 500, y: 0 }, data: { label: 'Review', type: 'hitl', config: { prompt: 'Approve child step?', buttons: [{ label: 'Approve', value: 'approved' }] } } },
  405 |           outputNode('n4', 'Output', ['Transform.result']),
  406 |         ],
  407 |         edges: [
  408 |           { id: 'e1', source: 'n1', target: 'n2' },
  409 |           { id: 'e2', source: 'n2', target: 'n3' },
  410 |           { id: 'e3', source: 'n3', target: 'n4' },
  411 |         ],
  412 |       },
  413 |     });
  414 |     expect(childRes.ok()).toBe(true);
  415 |     const child = await childRes.json();
  416 |     createdFlowIds.push(child.id);
  417 | 
  418 |     const parentRes = await request.post(`${API_URL}/flows`, {
  419 |       data: {
  420 |         name: uniqueFlowName('Hitl-Parent'),
  421 |         nodes: [
  422 |           { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
  423 |           { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Sub', type: 'subflow', config: { subflowId: child.id, subflowName: child.name, inputMapping: { text: '{{input.Trigger.text}}' } } } },
  424 |           { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: ['Sub.result'] } } },
  425 |         ],
  426 |         edges: [
  427 |           { id: 'e1', source: 'p1', target: 'p2' },
  428 |           { id: 'e2', source: 'p2', target: 'p3' },
  429 |         ],
  430 |       },
  431 |     });
  432 |     expect(parentRes.ok()).toBe(true);
  433 |     const parent = await parentRes.json();
  434 |     createdFlowIds.push(parent.id);
  435 | 
  436 |     const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;
  437 |     const { executeUntilPaused, pollExecution } = await import('./helpers/stream');
  438 |     const { events, executionId } = await executeUntilPaused(parent.id, { text: 'x' }, adminCookie);
  439 |     expect(executionId).toBeTruthy();
  440 | 
  441 |     // The pause is caused by the child's HITL node — its prompt is surfaced as pending
  442 |     const paused = events.find(e => e.type === 'execution.paused');
  443 |     expect(paused).toBeDefined();
  444 |     const execRes = await request.get(`${API_URL}/executions/${executionId}`);
  445 |     expect(execRes.ok()).toBe(true);
  446 |     const exec = await execRes.json();
  447 |     expect(exec.status).toBe('awaiting_approval');
  448 |     const pending = Array.isArray(exec.pending_hitls) ? exec.pending_hitls : JSON.parse(exec.pending_hitls || '[]');
  449 |     expect(pending[0]?.prompt).toBe('Approve child step?');
  450 |     // The pending HITL is stored with its hierarchical node id (subflow label : child node id)
  451 |     // so the replay can resume INSIDE the child subflow
> 452 |     expect(pending[0]?.nodeId).toBe('sub:n3');
      |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  453 | 
  454 |     // The child flow ran as a sub-execution of the parent
  455 |     const subStarted = events.find(e => e.type === 'subflow.started');
  456 |     expect(subStarted).toBeDefined();
  457 |     const subId = subStarted?.data?.subExecutionId;
  458 |     expect(subId).toBeTruthy();
  459 | 
  460 |     // Approve → the replay must resume inside the child, complete it, and finish the parent
  461 |     const approveRes = await fetch(`${API_URL}/executions/${executionId}/approve`, {
  462 |       method: 'POST',
  463 |       headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
  464 |       body: JSON.stringify({ decision: 'approved', hitlNodeId: pending[0]?.nodeId }),
  465 |     });
  466 |     expect(approveRes.ok).toBe(true);
  467 | 
  468 |     const completedExec = await pollExecution(request, executionId, 30000);
  469 |     expect(completedExec.status).toBe('completed');
  470 | 
  471 |     // The child's output is in the parent result
  472 |     const outStr = typeof completedExec.output === 'string' ? completedExec.output : JSON.stringify(completedExec.output);
  473 |     expect(outStr).toContain('child:x');
  474 | 
  475 |     // The replayed child sub-execution completed with the HITL approved
  476 |     const childListRes = await request.get(`${API_URL}/flows/${child.id}/executions`);
  477 |     expect(childListRes.ok()).toBe(true);
  478 |     const childList = await childListRes.json();
  479 |     const completedSub = (childList.data || []).find((e: any) => e.id !== subId && e.status === 'completed');
  480 |     expect(completedSub).toBeDefined();
  481 |     expect(completedSub.parent_execution_id).toBe(executionId);
  482 |     expect(JSON.stringify(completedSub.output)).toContain('child:x');
  483 | 
  484 |     // No HITL left pending
  485 |     const pendingAfter = Array.isArray(completedExec.pending_hitls) ? completedExec.pending_hitls : JSON.parse(completedExec.pending_hitls || '[]');
  486 |     expect(pendingAfter).toHaveLength(0);
  487 |   });
  488 | 
  489 |   // ─── Input mapping edge cases ────────────────────────────
  490 | 
  491 |   test('subflow input mapping referencing a missing upstream field resolves gracefully', async ({ page, request }) => {
  492 |     const child = await createCodeChildFlow(request, 'return { result: "text=[" + input.text + "]" }', id => createdFlowIds.push(id));
  493 | 
  494 |     const parentRes = await request.post(`${API_URL}/flows`, {
  495 |       data: {
  496 |         name: uniqueFlowName('Missing-Field-Parent'),
  497 |         nodes: [
  498 |           { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
  499 |           { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Sub', type: 'subflow', config: { subflowId: child.id, subflowName: child.name, inputMapping: { text: '{{input.Trigger.nonexistent}}' } } } },
  500 |           { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: ['Sub.result'] } } },
  501 |         ],
  502 |         edges: [
  503 |           { id: 'e1', source: 'p1', target: 'p2' },
  504 |           { id: 'e2', source: 'p2', target: 'p3' },
  505 |         ],
  506 |       },
  507 |     });
  508 |     expect(parentRes.ok()).toBe(true);
  509 |     const parent = await parentRes.json();
  510 |     createdFlowIds.push(parent.id);
  511 | 
  512 |     const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;
  513 |     const events = await readSSE(
  514 |       `${API_URL}/flows/${parent.id}/execute`,
  515 |       { input: { text: 'hello' }, _debug: true },
  516 |       adminCookie,
  517 |     );
  518 | 
  519 |     // Unresolved templates resolve to empty string — no error, child still runs
  520 |     const completed = events.find(e => e.type === 'execution.completed');
  521 |     expect(completed).toBeDefined();
  522 |     const failed = events.find(e => e.type === 'execution.failed');
  523 |     expect(failed).toBeUndefined();
  524 |     const outputStr = JSON.stringify(completed?.data?.output || {});
  525 |     expect(outputStr).toContain('text=[]');
  526 |   });
  527 | 
  528 |   // ─── Persisted (non-debug) subflow execution ─────────────
  529 | 
  530 |   test('persisted subflow execution: child flow runs as its own execution record and result is returned', async ({ request }) => {
  531 |     const child = await createCodeChildFlow(request, 'return { result: "persisted:" + (input.text || "") }', id => createdFlowIds.push(id));
  532 | 
  533 |     const parentRes = await request.post(`${API_URL}/flows`, {
  534 |       data: {
  535 |         name: uniqueFlowName('Persist-Parent'),
  536 |         nodes: [
  537 |           { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
  538 |           { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Sub', type: 'subflow', config: { subflowId: child.id, subflowName: child.name, inputMapping: { text: '{{input.Trigger.text}}' } } } },
  539 |           { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: ['Sub.result'] } } },
  540 |         ],
  541 |         edges: [
  542 |           { id: 'e1', source: 'p1', target: 'p2' },
  543 |           { id: 'e2', source: 'p2', target: 'p3' },
  544 |         ],
  545 |       },
  546 |     });
  547 |     expect(parentRes.ok()).toBe(true);
  548 |     const parent = await parentRes.json();
  549 |     createdFlowIds.push(parent.id);
  550 | 
  551 |     const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;
  552 |     const events = await readSSE(
```
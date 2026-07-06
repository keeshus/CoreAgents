import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Sidecar lifecycle and execution history', () => {
  const cleanupFlowIds: string[] = [];
  const cleanupGroupIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of cleanupFlowIds) { await deleteFlow(request, id).catch(() => {}); }
    for (const id of cleanupGroupIds) { await request.delete(`${API_URL}/groups/${id}`).catch(() => {}); }
    cleanupFlowIds.length = 0;
    cleanupGroupIds.length = 0;
  });

  test('persisted execution completes with proper sandbox lifecycle', async ({ request }) => {
    const flowName = uniqueFlowName('Sidecar-Lifecycle');
    const flowRes = await createFlow(request, {
      name: flowName,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Trigger.message'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { readSSE } = await import('./helpers/stream');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(`${API_URL}/flows/${flow.id}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: { message: 'hello' }, _debug: false }),
    });
    expect(res.ok).toBe(true);
    const events = await readSSE(res);

    const started = events.find(e => e.type === 'execution.started');
    expect(started).toBeDefined();
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
  });

  test('execution history page loads', async ({ page }) => {
    await page.goto('/settings/executions');
    await expect(page.locator('h1').filter({ hasText: 'Pending Approvals' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('execution history lists completed executions', async ({ request }) => {
    const flowName = uniqueFlowName('Exec-History-List');
    const flowRes = await createFlow(request, {
      name: flowName,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Trigger.message'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { readSSE } = await import('./helpers/stream');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(`${API_URL}/flows/${flow.id}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: { message: 'list-test' }, _debug: false }),
    });
    expect(res.ok).toBe(true);
    const events = await readSSE(res);

    const started = events.find(e => e.type === 'execution.started');
    expect(started).toBeDefined();
    const executionId = (started as any)?.executionId as string | undefined;
    expect(executionId).toBeTruthy();

    const execRes = await request.get(`${API_URL}/executions/${executionId}`);
    expect(execRes.ok()).toBe(true);
    const execution = await execRes.json();
    expect(execution.flow_name).toBe(flowName);
    expect(execution.status).toBe('completed');
  });

  test('code node in persisted execution completes', async ({ request }) => {
    const flowName = uniqueFlowName('Code-Sandbox');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Code', type: 'code', config: { code: 'return { result: "sandbox-works" }' } } },
          { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Code.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
          { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
        ],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { readSSE } = await import('./helpers/stream');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(`${API_URL}/flows/${flow.id}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: { message: 'test' }, _debug: false }),
    });
    expect(res.ok).toBe(true);
    const events = await readSSE(res);

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('sandbox-works');
  });

  test('group-scoped execution filtering (HITL admin page)', async ({ page, request }) => {
    const groupName = `HITL-Admin-Group-${Date.now()}`;
    const gRes = await request.post(`${API_URL}/groups`, {
      data: { name: groupName },
    });
    expect(gRes.status()).toBe(201);
    const group = await gRes.json();
    cleanupGroupIds.push(group.id);

    const flowName = uniqueFlowName('HITL-Admin-Flow');
    const flowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: flowName,
        group_id: group.id,
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'h1', type: 'hitl', position: { x: 0, y: 150 }, data: { label: 'HITL', type: 'hitl', config: { prompt: 'Approve?', buttons: [{ label: 'Approve', value: 'approved' }], assignmentType: 'group', assignedGroupId: group.id } } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'h1' }],
      },
    });
    expect(flowRes.ok()).toBe(true);
    const flow = await flowRes.json();
    cleanupFlowIds.push(flow.id);

    const { executeUntilPaused } = await import('./helpers/stream');
    const { events, executionId } = await executeUntilPaused(flow.id, {}, cookie);
    expect(executionId).toBeTruthy();

    await page.goto('/settings/executions');
    await expect(page.locator('h1').filter({ hasText: 'Pending Approvals' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(flowName)).toBeVisible({ timeout: 10000 });

    await request.delete(`${API_URL}/executions/${executionId}`);
  });
});

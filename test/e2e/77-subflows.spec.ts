import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';
import { pollExecution } from './helpers/stream';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

async function readSSE(url: string, body: unknown, cookie: string): Promise<any[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.status} ${res.statusText}`);
  const events: any[] = [];
  const reader = res.body?.getReader();
  if (!reader) return events;
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { events.push(JSON.parse(line.slice(6))); } catch {}
      }
    }
    if (events.some(e => e.type === 'execution.completed' || e.type === 'execution.failed')) break;
  }
  reader.releaseLock();
  return events;
}

test.describe('Subflows feature', () => {
  const createdFlowIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdFlowIds) {
      await deleteFlow(request, id).catch(() => {});
    }
    createdFlowIds.length = 0;
  });

  // ─── Catalog ───────────────────────────────────────────────

  test('subflow node appears in node catalog', async ({ page }) => {
    await page.goto('/flows/new/edit');
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('add-node-btn').click();
    await expect(page.getByTestId('catalog-subflow')).toBeVisible({ timeout: 5000 });
  });

  // ─── Subflow node configuration ──────────────────────────

  test('subflow node can be added to canvas and configured', async ({ page, request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Child-Subflow'),
        nodes: [
          { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: JSON.stringify({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }) } } },
          { id: 'n2', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Transform', type: 'code', config: { code: 'return { result: (input.text || "").toUpperCase() }' } } },
          { id: 'n3', type: 'output', position: { x: 500, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Transform.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    createdFlowIds.push(subflow.id);

    const parentRes = await createFlow(request, { name: uniqueFlowName('Parent-Flow') });
    const parent = await parentRes.json();
    createdFlowIds.push(parent.id);

    await page.goto(`/flows/${parent.id}/edit`);
    await expect(page.getByTestId('flow-canvas')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('add-node-btn').click();
    await expect(page.getByTestId('catalog-subflow')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('catalog-subflow').click();

    await page.getByText('Subflow').first().click();
    await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('subflow-config')).toBeVisible({ timeout: 5000 });

    const subflowItem = page.getByTestId(`subflow-item-${subflow.name.replace(/\s+/g, '-')}`);
    await expect(subflowItem).toBeVisible({ timeout: 5000 });
    await subflowItem.click();

    await expect(page.getByText(subflow.name).first()).toBeVisible({ timeout: 3000 });
  });

  // ─── Subflow execution via SSE ───────────────────────────

  test('subflow node executes child flow and returns result', async ({ page, request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Upper-Subflow'),
        nodes: [
          { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: JSON.stringify({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }) } } },
          { id: 's2', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Upper', type: 'code', config: { code: 'return { result: (input.text || "").toUpperCase() }' } } },
          { id: 's3', type: 'output', position: { x: 500, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Upper.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 's2' },
          { id: 'e2', source: 's2', target: 's3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    createdFlowIds.push(subflow.id);

    const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Exec-Parent'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Subflow', type: 'subflow', config: { subflowId: subflow.id, subflowName: subflow.name, inputMapping: { text: '{{input.Trigger.message}}' } } } },
          { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Subflow.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    createdFlowIds.push(parent.id);

    const events = await readSSE(
      `${API_URL}/flows/${parent.id}/execute`,
      { input: { message: 'hello world' }, _debug: true },
      adminCookie,
    );

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('HELLO WORLD');
  });

  test('subflow with number transformation works', async ({ page, request }) => {
    const subflowRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Double-Subflow'),
        nodes: [
          { id: 's1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'subflow', inputSchema: JSON.stringify({ type: 'object', properties: { x: { type: 'number' } }, required: ['x'] }) } } },
          { id: 's2', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Double', type: 'code', config: { code: 'return { result: (input.x || 0) * 2 }' } } },
          { id: 's3', type: 'output', position: { x: 500, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Double.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 's2' },
          { id: 'e2', source: 's2', target: 's3' },
        ],
      },
    });
    expect(subflowRes.ok()).toBe(true);
    const subflow = await subflowRes.json();
    createdFlowIds.push(subflow.id);

    const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;

    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Double-Parent'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Calc', type: 'subflow', config: { subflowId: subflow.id, subflowName: subflow.name, inputMapping: { x: '{{input.Trigger.num}}' } } } },
          { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['Calc.result'] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    createdFlowIds.push(parent.id);

    const events = await readSSE(
      `${API_URL}/flows/${parent.id}/execute`,
      { input: { num: 21 }, _debug: true },
      adminCookie,
    );

    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    const output = completed?.data?.output || {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    expect(outputStr).toContain('42');
  });

  // ─── Error handling ──────────────────────────────────────

  test('subflow with invalid subflowId fails gracefully', async ({ page, request }) => {
    const parentRes = await request.post(`${API_URL}/flows`, {
      data: {
        name: uniqueFlowName('Bad-Subflow'),
        nodes: [
          { id: 'p1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'p2', type: 'subflow', position: { x: 300, y: 0 }, data: { label: 'Broken', type: 'subflow', config: { subflowId: '00000000-0000-0000-0000-000000000000', inputMapping: {} } } },
          { id: 'p3', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: [] } } },
        ],
        edges: [
          { id: 'e1', source: 'p1', target: 'p2' },
          { id: 'e2', source: 'p2', target: 'p3' },
        ],
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parent = await parentRes.json();
    createdFlowIds.push(parent.id);

    const adminCookie = `token=${getAuthCookie()?.split('=')[1] || ''}`;

    const events = await readSSE(
      `${API_URL}/flows/${parent.id}/execute`,
      { input: {}, _debug: true },
      adminCookie,
    );

    const failedEvent = events.find(e => e.type === 'execution.failed');
    expect(failedEvent).toBeDefined();
    const errorMsg = failedEvent?.data?.error || '';
    expect(errorMsg).toContain('not found');
  });
});

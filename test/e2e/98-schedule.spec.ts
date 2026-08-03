import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';
import { openNodeConfig } from './helpers/ui';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Schedule trigger', () => {
  test('schedule-triggered flow executes correctly', async ({ request }) => {
    const name = uniqueFlowName('ScheduleTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Scheduler', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '* * * * *', inputMessage: '{"message":"scheduled run"}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message, triggered: input.triggerType };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result', 'echo.triggered'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { triggerType: 'schedule', timestamp: new Date().toISOString(), message: 'cron job run' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    expect(completed!.data?.output?.c1?.result).toBe('cron job run');
    await deleteFlow(request, flow.id);
  });

  test('schedule flow saves cron expression and can be re-fetched', async ({ request }) => {
    const name = uniqueFlowName('ScheduleCRUD');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Timer', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 */2 * * *', inputMessage: '{"task":"check"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    // Read back from API to verify cron was persisted
    const getRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(getRes.ok()).toBe(true);
    const saved = await getRes.json();
    const trigger = saved.nodes.find((n: any) => n.data?.type === 'trigger');
    expect(trigger).toBeDefined();
    expect(trigger.data?.config?.cronExpression).toBe('0 */2 * * *');

    // Update the cron expression
    const updateRes = await request.put(`${API_URL}/flows/${flow.id}`, {
      data: {
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Timer', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/10 * * * *', inputMessage: '{"task":"check"}' } } },
          { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
        ],
        edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
      },
    });
    expect(updateRes.ok()).toBe(true);

    // Verify the updated cron is persisted
    const getRes2 = await request.get(`${API_URL}/flows/${flow.id}`);
    const saved2 = await getRes2.json();
    const trigger2 = saved2.nodes.find((n: any) => n.data?.type === 'trigger');
    expect(trigger2.data?.config?.cronExpression).toBe('*/10 * * * *');

    await deleteFlow(request, flow.id);
  });

  test('schedule flow can be converted to manual and back', async ({ request }) => {
    const name = uniqueFlowName('ScheduleToggle');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Timer', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 * * * *', inputMessage: '{}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();

    // Verify schedule is set
    const get1 = await (await request.get(`${API_URL}/flows/${flow.id}`)).json();
    expect(get1.nodes.find((n: any) => n.data?.type === 'trigger').data?.config?.triggerType).toBe('schedule');

    // Convert to manual trigger (removes BullMQ repeatable job)
    await request.put(`${API_URL}/flows/${flow.id}`, {
      data: {
        nodes: [
          { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Manual', type: 'trigger', config: { triggerType: 'manual' } } },
          { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
        ],
        edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
      },
    });

    // Verify it's now manual and still executable
    const get2 = await (await request.get(`${API_URL}/flows/${flow.id}`)).json();
    expect(get2.nodes.find((n: any) => n.data?.type === 'trigger').data?.config?.triggerType).toBe('manual');

    const events = await debugExecute(flow.id, { message: 'manual run' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();

    await deleteFlow(request, flow.id);
  });

  test('schedule flow fires on a real cron (sub-minute) and the execution completes', async ({ request }) => {
    test.setTimeout(120000);
    const name = uniqueFlowName('ScheduleStrict');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Cron', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '*/10 * * * * *', inputMessage: '{"source":"cron-strict"}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Mark', type: 'code', config: { code: 'return { scheduled: true, source: input.source || input.message || "none", received: input };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: ['Mark.scheduled', 'Mark.source'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();

    // Strict wait: poll for a real cron-fired execution (no debug fallback).
    // The 6-field cron fires every 10 seconds via the BullMQ repeatable job.
    await expect.poll(async () => {
      const listRes = await request.get(`${API_URL}/flows/${flow.id}/executions?limit=10`);
      if (!listRes.ok()) return null;
      const body = await listRes.json();
      const list = body.data || [];
      const scheduled = list.find((e: any) => e.input?.triggerType === 'schedule');
      return scheduled ? scheduled.status : null;
    }, {
      timeout: 90000,
      intervals: [2000],
      message: 'No cron-fired execution appeared within 90s — the BullMQ repeatable job did not fire',
    }).toBe('completed');

    // Fetch the fired execution and assert on the delivered input
    const listRes = await request.get(`${API_URL}/flows/${flow.id}/executions?limit=10`);
    const body = await listRes.json();
    const scheduled = (body.data || []).find((e: any) => e.input?.triggerType === 'schedule');
    expect(scheduled).toBeDefined();
    expect(scheduled.status).toBe('completed');
    expect(scheduled.input).toMatchObject({ triggerType: 'schedule' });
    expect(scheduled.input.timestamp).toBeDefined();

    // The code node echoed the exact input the worker delivered
    const detailRes = await request.get(`${API_URL}/flows/${flow.id}/executions/${scheduled.id}`);
    expect(detailRes.ok()).toBe(true);
    const detail = await detailRes.json();
    const mark = detail.output?.c1;
    expect(mark?.scheduled).toBe(true);
    expect(mark?.received).toMatchObject({ triggerType: 'schedule' });
    // The trigger's configured inputMessage ({"source":"cron-strict"}) IS now
    // delivered: the repeatable BullMQ job carries it, and the worker merges it
    // into the execution input alongside the schedule context fields.
    expect(mark?.received?.source).toBe('cron-strict');
    expect(mark?.source).toBe('cron-strict');

    await deleteFlow(request, flow.id);
  });

  test('cron expression and input message can be configured via the editor UI and persist', async ({ page, request }) => {
    // Start from a manual flow and configure the schedule via the trigger panel
    const name = uniqueFlowName('ScheduleUI');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Timer', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Open the trigger config and switch to Schedule
    await openNodeConfig(page, 'Timer');
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Schedule' }).click();
    await expect(page.getByLabel('Cron Expression')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Cron Expression').fill('*/30 * * * * *');
    await page.getByLabel('Input Message').fill('{"task":"ui-configured"}');

    // Close the modal, then save via the editor
    await page.getByTestId('node-config-modal').getByRole('button', { name: 'Close' }).click();
    const saveResp = page.waitForResponse(r => r.url().includes(`/api/flows/${flow.id}`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save' }).click();
    await saveResp;

    // Reload and reopen — values must be persisted
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });
    await openNodeConfig(page, 'Timer');
    await expect(page.locator('[data-field-label="Trigger Type"]')).toContainText('Schedule');
    await expect(page.getByLabel('Cron Expression')).toHaveValue('*/30 * * * * *');
    await expect(page.getByLabel('Input Message')).toHaveValue('{"task":"ui-configured"}');

    // Server-side check
    const getRes = await request.get(`${API_URL}/flows/${flow.id}`);
    expect(getRes.ok()).toBe(true);
    const saved = await getRes.json();
    const trigger = saved.nodes.find((n: any) => n.data?.type === 'trigger');
    expect(trigger.data?.config?.triggerType).toBe('schedule');
    expect(trigger.data?.config?.cronExpression).toBe('*/30 * * * * *');
    expect(trigger.data?.config?.inputMessage).toBe('{"task":"ui-configured"}');

    await deleteFlow(request, flow.id);
  });

  test('schedule trigger converts to manual via the editor UI and persists', async ({ page, request }) => {
    const name = uniqueFlowName('ScheduleToggleUI');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Timer', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '0 0 1 1 *', inputMessage: '{"task":"ui"}' } } },
        { id: 'o1', type: 'output', position: { x: 300, y: 0 }, data: { label: 'Out', type: 'output', config: { inputFields: [] } } },
      ],
      edges: [{ id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' }],
    });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // The trigger panel shows the schedule config
    await openNodeConfig(page, 'Timer');
    await expect(page.locator('[data-field-label="Trigger Type"]')).toContainText('Schedule');
    await expect(page.getByLabel('Cron Expression')).toBeVisible();

    // Convert to manual via the trigger type select
    await page.locator('[data-field-label="Trigger Type"]').click();
    await page.getByRole('option', { name: 'Manual' }).click();
    await expect(page.getByLabel('Input Message')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Cron Expression')).toHaveCount(0);
    await page.getByLabel('Input Message').fill('{"via":"ui"}');

    // Close the modal, then save and reload
    await page.getByTestId('node-config-modal').getByRole('button', { name: 'Close' }).click();
    const saveResp = page.waitForResponse(r => r.url().includes(`/api/flows/${flow.id}`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save' }).click();
    await saveResp;
    await page.goto(`/flows/${flow.id}/edit`);
    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Manual is persisted — cron field is gone
    await openNodeConfig(page, 'Timer');
    await expect(page.locator('[data-field-label="Trigger Type"]')).toContainText('Manual');
    await expect(page.getByLabel('Cron Expression')).toHaveCount(0);

    const getRes = await request.get(`${API_URL}/flows/${flow.id}`);
    const saved = await getRes.json();
    const trigger = saved.nodes.find((n: any) => n.data?.type === 'trigger');
    expect(trigger.data?.config?.triggerType).toBe('manual');

    await deleteFlow(request, flow.id);
  });
});

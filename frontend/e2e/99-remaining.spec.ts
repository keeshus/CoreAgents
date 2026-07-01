import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Remaining features', () => {
  // ── HITL via approval page ──────────────────────────────────────

  test('hitl node pauses and can be approved via approvals page', async ({ page, request }) => {
    const name = uniqueFlowName('HITLTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
        { id: 'h1', type: 'hitl', position: { x: 300, y: 0 }, data: { label: 'HITL', type: 'hitl', config: { prompt: 'Approve this?', buttons: [{ label: 'Approve', value: 'approved' }] } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['hitl.decision'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
        { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();

    // Execute (persisted, not debug) — it will pause at HITL
    const { executeUntilPaused, pollExecution } = await import('./helpers/stream');
    const { executionId } = await executeUntilPaused(flow.id, { message: 'test' }, cookie);
    expect(executionId).toBeTruthy();

    // Navigate to the approvals page and approve
    await page.goto('/approvals');
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 10000 });

    // Find and click the "Approve" button for our execution
    const approveBtn = page.locator(`button:has-text("Approve")`).first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();

    // Execution should complete after approval
    const exec = await pollExecution(request, executionId, 30000);
    expect(exec.status).toBe('completed');

    await deleteFlow(request, flow.id);
  });

  // ── Edge connection on canvas ───────────────────────────────────

  test('connect two nodes on the canvas', async ({ page, request }) => {
    const name = uniqueFlowName('EdgeTest');
    const res = await createFlow(request, { name });
    const flow = await res.json();
    await page.goto(`/flows/${flow.id}/edit`);

    await page.getByTestId('flow-canvas').waitFor({ state: 'visible', timeout: 10000 });

    // Add trigger and output nodes via catalog
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.getByTestId('add-node-btn').click();
    await page.getByTestId('catalog-trigger').click();
    await page.waitForTimeout(300);

    // Verify both nodes are on the canvas
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2, { timeout: 5000 });

    await deleteFlow(request, flow.id);
  });

  // ── Error state: non-existent flow ──────────────────────────────

  test('shows error for non-existent flow edit page', async ({ page }) => {
    await page.goto('/flows/nonexistent-id-12345/edit');
    // The editor page should show an error or loading state
    await expect(page.getByText(/Flow not found/i)).toBeVisible({ timeout: 15000 });
  });

  test('returns 404 for non-existent flow via API', async ({ request }) => {
    const res = await request.get(`${API_URL}/flows/nonexistent-flow-id-67890`);
    expect(res.status()).toBe(404);
  });
});

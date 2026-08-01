import { expect } from '@playwright/test';

/**
 * Open a node's config modal on the flow editor canvas by label text.
 */
export async function openNodeConfig(page: any, label: string) {
  await page.evaluate((lbl: string) => {
    for (const n of document.querySelectorAll('.react-flow__node')) {
      if (n.textContent?.toLowerCase().includes(lbl.toLowerCase())) {
        (n as HTMLElement).click();
        return;
      }
    }
  }, label);
  await expect(page.getByTestId('node-config-modal')).toBeVisible({ timeout: 5000 });
}

/**
 * Click the editor's Save button once and wait for the change to land in the API.
 *
 * NOTE: this deliberately does NOT retry. The editor's Save button previously
 * swallowed clicks because `handleSave`'s useCallback captured a stale
 * `hasErrors` closure (fixed by adding `hasErrors` to its dependency array in
 * edit.tsx). A single click + strict assertion means a regression of that fix
 * fails loudly instead of being retried away.
 */
export async function saveFlowViaUi(page: any, request: any, flowId: string, isSaved: (flow: any) => boolean) {
  // The button is briefly disabled on load until the debounced name check completes
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5000 });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => {
    const res = await request.get(`${process.env.E2E_API_URL || 'http://localhost:3001/api'}/flows/${flowId}`);
    if (!res.ok()) return false;
    return isSaved(await res.json());
  }, { timeout: 10000, message: 'Save should persist the flow to the API' }).toBe(true);
}

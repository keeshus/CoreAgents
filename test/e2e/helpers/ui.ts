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

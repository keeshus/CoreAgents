import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';

test('debug group env vars', async ({ request }) => {
  // First create a group
  const gRes = await request.post(`${API_URL}/groups`, { data: { name: 'Debug-Group-' + Date.now() } });
  expect(gRes.ok()).toBe(true);
  const group = await gRes.json();
  
  // Now try to PUT env vars
  const envVars = [{ name: 'T', value: 'v', type: 'static' }];
  const res = await request.put(`${API_URL}/env-vars/groups/${group.id}`, { data: { envVars } });
  console.log('Status:', res.status());
  console.log('Body:', await res.text());
  
  // Cleanup
  await request.delete(`${API_URL}/groups/${group.id}`).catch(() => {});
});

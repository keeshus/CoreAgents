import { test, expect } from '@playwright/test';
import { E2E_USER } from './helpers/api';

test.describe('Initial Setup — fresh install', () => {
  test('redirects to /setup when no users exist', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByText('Welcome to Core Agents')).toBeVisible();
    await expect(page.getByText('Create the first admin account')).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Create Admin Account' }).click();
    await expect(page.getByText(/This field is required/i)).toBeVisible();
  });

  test('shows error for short password', async ({ page }) => {
    await page.goto('/setup');
    await page.getByLabel('Name').fill('Admin');
    await page.getByLabel('Email').fill('admin@test.local');
    await page.getByLabel('Password').fill('123');
    await page.getByRole('button', { name: 'Create Admin Account' }).click();
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('registers first admin user and creates auth state', async ({ page, context }) => {
    await page.goto('/setup');
    await page.getByLabel('Name').fill(E2E_USER.name);
    await page.getByLabel('Email').fill(E2E_USER.email);
    await page.getByLabel('Password').fill(E2E_USER.password);
    await page.getByLabel('Confirm Password').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'Create Admin Account' }).click();

    // Should redirect to flows overview
    await expect(page).toHaveURL(/^\/(\?.*)?$/);
    await expect(page.getByText('Flows')).toBeVisible();

    // Save authenticated state for downstream tests
    await context.storageState({ path: 'e2e/.auth/user.json' });
  });

  test('setup-status reports not required after admin registered', async () => {
    const res = await fetch('http://localhost:3001/api/auth/setup-status');
    const data = await res.json();
    expect(data.required).toBe(false);
  });
});

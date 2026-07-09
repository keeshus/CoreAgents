import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 2,
  retries: 2,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '00-initial-setup.spec.ts',
    },
    {
      name: 'authenticated',
      testMatch: '**/*.spec.ts',
      testIgnore: '00-initial-setup.spec.ts',
      dependencies: ['setup'],
      use: {
        storageState: process.env.PLAYWRIGHT_AUTH_FILE || 'e2e/.auth/user.json',
      },
    },
  ],
});

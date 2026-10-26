import { defineConfig, devices } from '@playwright/test';

/**
 * E2E, accessibility and evidence runs against production builds (vite preview).
 * Chromium only in Stage 1; WebKit and Firefox are added in Stage 6.
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'e2e', testMatch: /e2e[\\/].*\.spec\.ts$/ },
    { name: 'evidence', testMatch: /evidence[\\/].*\.spec\.ts$/, fullyParallel: false },
  ],
  webServer: [
    {
      command: 'npm run build -w @repo/backoffice && npm run preview -w @repo/backoffice',
      url: 'http://localhost:5173/backoffice',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build -w @repo/customer-web && npm run preview -w @repo/customer-web',
      url: 'http://localhost:5174/customer/portal',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

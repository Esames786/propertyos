import { defineConfig, devices } from '@playwright/test';

/**
 * E2E, accessibility and evidence runs against production builds (vite preview).
 * Chromium for the full suite; Firefox and WebKit run the Gate C.2 smoke (full coverage in Stage 6).
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
    // Gate C.2: cross-browser smoke (`npx playwright install firefox webkit` first). These engines
    // start slower on Windows, so the first page of a run gets more time.
    { name: 'firefox-smoke', testMatch: /smoke[\\/].*\.spec\.ts$/, expect: { timeout: 20_000 }, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-smoke', testMatch: /smoke[\\/].*\.spec\.ts$/, expect: { timeout: 20_000 }, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
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
    {
      command: 'npm run build -w @repo/platform-hq && npm run preview -w @repo/platform-hq',
      url: 'http://localhost:5175/hq',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * E2E_PORT_OFFSET (optional) runs an isolated copy beside another checkout's servers: office, resident
 * and HQ previews move by the offset (e.g. 100 → 5273/5274/5275) and the apps are built to link to
 * each other there. Without it the usual ports and commands are used unchanged.
 */
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);
const PORTS = { backoffice: 5173 + OFFSET, customer: 5174 + OFFSET, hq: 5175 + OFFSET };
const serve = (app: keyof typeof PORTS, pkg: string) =>
  OFFSET ? `npm run build -w ${pkg} && npm exec -w ${pkg} -- vite preview --port ${PORTS[app]} --strictPort` : `npm run build -w ${pkg} && npm run preview -w ${pkg}`;
const isolatedEnv = OFFSET
  ? { env: { ...process.env, VITE_OFFICE_ORIGIN: `http://localhost:${PORTS.backoffice}`, VITE_CUSTOMER_ORIGIN: `http://localhost:${PORTS.customer}` } as Record<string, string> }
  : {};

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
      command: serve('backoffice', '@repo/backoffice'),
      url: `http://localhost:${PORTS.backoffice}/backoffice`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      ...isolatedEnv,
    },
    {
      command: serve('customer', '@repo/customer-web'),
      url: `http://localhost:${PORTS.customer}/customer/portal`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      ...isolatedEnv,
    },
    {
      command: serve('hq', '@repo/platform-hq'),
      url: `http://localhost:${PORTS.hq}/hq`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      ...isolatedEnv,
    },
  ],
});

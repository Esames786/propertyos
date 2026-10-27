import { test as base, expect, type Page } from '@playwright/test';

export const BO = 'http://localhost:5173';
export const CU = 'http://localhost:5174';
export const HQ = 'http://localhost:5175';

export type PersonaId =
  | 'manager'
  | 'sales'
  | 'finance'
  | 'resident'
  | 'facility_manager'
  | 'society_admin'
  | 'cb_manager'
  | 'cedar_treasurer'
  | 'supreme_admin'
  | 'commercial_approver'
  | 'platform_support';
export type Locale = 'en-PK' | 'ur-PK';

export interface SeedOptions {
  persona?: PersonaId | null;
  locale?: Locale;
  /** 'fresh' = first login (welcome pending); 'done' = answered, no automatic offers; 'offers' = answered, module offers on. */
  onboarding?: 'fresh' | 'done' | 'offers';
  mock?: 'fast' | 'normal' | 'slow' | 'error' | 'offline';
  app?: 'backoffice' | 'customer' | 'platform';
  a11y?: Record<string, unknown>;
}

const TENANT = 'tnt_larkspur';
/** Identities outside Larkspur: the maintenance-only client, the two-site developer and the suspended co-operative. */
const TENANT_OF: Record<string, string> = { facility_manager: 'tnt_shalimar', society_admin: 'tnt_shalimar', cb_manager: 'tnt_crescent', cedar_treasurer: 'tnt_cedar' };

/**
 * Seeds demo state once per browser context (later reloads keep whatever the test changed,
 * so persistence can be verified). Only preferences and demo-session keys are written.
 */
export async function seed(page: Page, options: SeedOptions = {}) {
  const { persona = 'manager', locale = 'en-PK', onboarding = 'done', mock = 'fast', app = 'backoffice', a11y } = options;
  await page.addInitScript(
    ({ persona, locale, onboarding, mock, app, tenant, a11y }) => {
      if (localStorage.getItem('e2e:seeded')) return;
      localStorage.setItem('e2e:seeded', '1');
      localStorage.setItem(`demo:session:${app}`, JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem('pref:locale', locale);
      localStorage.setItem('demo:mock', JSON.stringify({ mode: mock }));
      if (a11y) localStorage.setItem('pref:a11y', JSON.stringify(a11y));
      if (persona && onboarding !== 'fresh') {
        const offers = onboarding === 'offers';
        localStorage.setItem(
          `onboarding:v1:${tenant}:${persona}:${app}`,
          JSON.stringify({
            profile: { tenantId: tenant, personaId: persona, app, welcomeDecision: 'declined', autoOffer: offers, seenModules: offers ? [] : ['lab'], updatedAt: '2026-10-26T00:00:00Z' },
            progress: {},
          }),
        );
      }
    },
    { persona, locale, onboarding, mock, app, tenant: app === 'platform' ? 'platform' : (persona && TENANT_OF[persona]) || TENANT, a11y: a11y ?? null },
  );
}

/** Collects uncaught errors and console errors; tests assert the list stays empty. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await use(errors);
  },
});

export { expect };

/** The tour progress record stored for a persona (doc 09 acceptance 7). */
export async function tourRecord(page: Page, persona: PersonaId, tourId: string, version = 1, app = 'backoffice') {
  return page.evaluate(
    ({ key, id }) => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw).progress?.[id] ?? null) : null;
    },
    { key: `onboarding:v1:${TENANT}:${persona}:${app}`, id: `${tourId}@${version}` },
  );
}

export async function waitForApp(page: Page) {
  await page.locator('main h1').first().waitFor();
}

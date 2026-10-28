import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate C.1 evidence (society setup and monthly maintenance billing, Al-Noor Residency) →
 * docs/status/gate-c1/{screenshots,video}. Run on its own against production builds:
 * `npx playwright test --project=evidence tests/evidence/gatec1.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-c1/screenshots';
const VIDEO = 'docs/status/gate-c1/video';
const RAW = 'test-results/gatec1-video';
const SITE = '/backoffice/sites/site_alnoor';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function start(browser: Browser, vp: ViewportName, persona: PersonaId | null, locale: Locale, context: BrowserContextOptions = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], ...context });
  const page = await ctx.newPage();
  await seed(page, { persona, locale, onboarding: 'done', mock: 'fast' });
  if (persona) {
    await page.goto(`${BO}/backoffice/global/my-access`);
    // C.1 shows the society set up and ready to bill November (C.2 made "collecting" the default demo).
    if (persona === 'alnoor_manager') await api(page, '/society/demo', 'POST', { mode: 'ready' });
    await settle(page, 300);
  }
  return page;
}

async function go(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function as(page: Page, persona: PersonaId) {
  await page.evaluate((persona) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
    localStorage.setItem(
      `onboarding:v1:tnt_alnoor:${persona}:backoffice`,
      JSON.stringify({ profile: { tenantId: 'tnt_alnoor', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }),
    );
  }, persona);
}

async function api(page: Page, path: string, method: 'GET' | 'POST' = 'POST', body: unknown = {}) {
  return page.evaluate(({ path, method, body }) => window.__prototype!.transport.request<{ run?: { id: string } }>({ method, path, ...(method === 'POST' ? { body } : {}) }), { path, method, body });
}

/** November through the API: prepared by the manager, then approved and posted by the treasurer if asked. */
async function november(page: Page, until: 'previewed' | 'submitted' | 'posted' | 'notified') {
  const id = (await api(page, '/billing-runs', 'POST', { period: '2026-11' })).run!.id;
  await api(page, `/billing-runs/${id}/preview`);
  if (until === 'previewed') return id;
  await api(page, `/billing-runs/${id}/submit`);
  if (until === 'submitted') return id;
  await as(page, 'alnoor_treasurer');
  await page.reload();
  await api(page, `/billing-runs/${id}/approve`);
  await api(page, `/billing-runs/${id}/post`);
  await api(page, `/billing-runs/${id}/post`);
  if (until === 'notified') await api(page, `/billing-runs/${id}/notify`);
  await as(page, 'alnoor_manager');
  await page.reload();
  return id;
}

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  for (const vp of ['desktop', 'tablet', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;

    test(`reference experiences ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await start(browser, vp, 'alnoor_manager', locale);
      // A. Society Dashboard, set up and ready to bill November.
      await go(page, '/backoffice', 'society-dashboard', 1200);
      await shot(page, `a-dashboard-ready-${w}-${l}`);
      // B. Flat 360: A-102 (owner, tenant and payer kept apart) and A-501 (which rule wins).
      await go(page, `${SITE}/units/unt_anr_a102`, 'flat-chain');
      await shot(page, `b-flat-a102-overview-${w}-${l}`);
      await go(page, `${SITE}/units/unt_anr_a501?tab=charges`, 'charges-table');
      await shot(page, `b-flat-a501-which-rule-wins-${w}-${l}`);
      // C. Monthly Billing Workspace: calendar, builder, previewed run, flats, approval waiting.
      await go(page, '/backoffice/billing/runs', 'billing-calendar');
      await shot(page, `c-runs-calendar-${w}-${l}`);
      await go(page, '/backoffice/billing/runs/new', 'new-run-checks');
      await shot(page, `c-new-run-${w}-${l}`);
      const id = await november(page, 'previewed');
      await go(page, `/backoffice/billing/runs/${id}`, 'run-checks');
      await shot(page, `c-run-previewed-summary-${w}-${l}`);
      await go(page, `/backoffice/billing/runs/${id}?tab=items`, vp === 'desktop' ? 'run-items-table' : 'run-items-cards');
      await shot(page, `c-run-previewed-flats-${w}-${l}`);
      await api(page, `/billing-runs/${id}/submit`);
      await go(page, `/backoffice/billing/runs/${id}`, 'run-next-step');
      await shot(page, `c-run-waiting-manager-cannot-approve-${w}-${l}`);
      await as(page, 'alnoor_treasurer');
      await go(page, `/backoffice/billing/runs/${id}`, 'run-next-step');
      await shot(page, `c-run-treasurer-approves-${w}-${l}`);
      await api(page, `/billing-runs/${id}/approve`);
      await api(page, `/billing-runs/${id}/post`);
      await api(page, `/billing-runs/${id}/post`);
      await go(page, `/backoffice/billing/runs/${id}?tab=posting`, 'posting-result');
      await shot(page, `c-run-posted-idempotent-${w}-${l}`);
      await as(page, 'alnoor_manager');
      // A again, after posting: billed, outstanding and arrears reconcile.
      await go(page, '/backoffice', 'society-dashboard', 1200);
      await shot(page, `a-dashboard-posted-${w}-${l}`);
      // B again: A-101's statement, previous balance kept apart from November's charges.
      await go(page, `${SITE}/units/unt_anr_a101?tab=invoices`, 'statement');
      await shot(page, `b-flat-a101-statement-${w}-${l}`);
      await page.context().close();
    });
  }

  for (const vp of ['desktop', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;

    test(`setup and people screens ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await start(browser, vp, 'alnoor_manager', locale);
      for (const [name, path, ready] of [
        ['sites', '/backoffice/sites', 'site-card'],
        ['site-360-checklist', SITE, 'site-checklist'],
        ['site-collection-account', `${SITE}?tab=collection-settings`, 'payee-card'],
        ['site-payment-methods', `${SITE}?tab=payment-methods`, 'payment-methods'],
        ['structure-tree', `${SITE}/structure`, 'structure-tree'],
        ['structure-list-block-a', `${SITE}/structure?view=list&building=bld_anr_a`, 'structure-list'],
        ['unit-types', `${SITE}/unit-types`, 'unit-types-page'],
        ['opening-balances-approved', `${SITE}/opening-balances`, 'opening-batch'],
        ['people', '/backoffice/cus/customers-list', 'people-list'],
        ['person-sana-iqbal-tenant-payer', '/backoffice/cus/customer-360-workspace?record=pty_anr_0003&tab=accounts', 'person-workspace'],
        ['units-and-payers', '/backoffice/res/occupancy-list', 'roster-page'],
        ['flat-a102-ownership-occupancy', `${SITE}/units/unt_anr_a102?tab=people`, 'ownership-history'],
        ['flat-a202-payer-and-account', `${SITE}/units/unt_anr_a202?tab=payer`, 'liability-history'],
        ['billing-accounts-arrears', '/backoffice/billing/accounts?status=arrears', 'accounts-list'],
        ['account-a201-two-payers', '/backoffice/billing/accounts/ba_anr_a201', 'account-workspace'],
        ['charges-and-rates', '/backoffice/billing/charges', 'charges-page'],
        ['charge-rules-which-rule-wins', '/backoffice/billing/rules', 'which-rule-wins'],
        ['exemptions', '/backoffice/billing/exemptions', 'exemptions-list'],
        ['invoices-opening-balances', '/backoffice/fin/invoices-list', 'society-invoices'],
        ['invoice-opening-a101', '/backoffice/fin/invoice-workspace?record=cin_ob_0001', 'invoice-lines'],
      ] as const) {
        await go(page, path, ready);
        await shot(page, `${name}-${w}-${l}`);
      }
      // Overlays: change of payer (B-204), the per-flat "why" drawer, the rule drawer.
      await go(page, `${SITE}/units/unt_anr_b204?tab=payer&drawer=change-payer`, 'change-payer-drawer');
      await shot(page, `flat-b204-change-payer-drawer-${w}-${l}`, false);
      await go(page, '/backoffice/billing/rules', 'rules-page');
      await page.getByTestId('rules-add').click();
      await page.getByTestId('rule-drawer').waitFor();
      await settle(page, 500);
      await shot(page, `charge-rule-override-drawer-${w}-${l}`, false);
      // Fresh society: the checklist, the empty explorer and the import review (3 errors, 2 repeats).
      await api(page, '/society/demo', 'POST', { mode: 'fresh' });
      await go(page, '/backoffice', 'society-dashboard', 1000);
      await shot(page, `dashboard-fresh-before-setup-${w}-${l}`);
      await go(page, SITE, 'site-checklist');
      await shot(page, `site-360-checklist-fresh-${w}-${l}`);
      await go(page, '/backoffice/billing/rules', 'rules-defaults');
      await shot(page, `charge-rules-site-defaults-${w}-${l}`);
      await go(page, `${SITE}/import`, 'import-page');
      await shot(page, `import-upload-${w}-${l}`);
      await page.getByTestId('import-sample').click();
      await page.getByTestId('import-review').waitFor();
      await settle(page);
      await shot(page, `import-review-3-errors-2-repeats-${w}-${l}`);
      await page.getByTestId('import-apply-all').click();
      await page.getByTestId('import-ack').click();
      await page.getByTestId('import-commit').click();
      await page.getByTestId('import-done').waitFor();
      await settle(page);
      await shot(page, `import-done-80-flats-${w}-${l}`);
      await go(page, `${SITE}/import`, 'import-page');
      await page.getByTestId('import-sample').click();
      await page.getByTestId('import-already').waitFor();
      await settle(page);
      await shot(page, `import-rerun-creates-nothing-${w}-${l}`);
      await page.context().close();
    });

    test(`roles, entry and corrections ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const visitor = await start(browser, vp, null, locale);
      await go(visitor, '/backoffice/get-started', 'choice-society');
      await shot(visitor, `entry-get-started-society-choice-${w}-${l}`);
      await visitor.getByTestId('choice-society').click();
      await visitor.getByTestId('demo-role-step').waitFor();
      await settle(visitor);
      await shot(visitor, `entry-society-roles-${w}-${l}`);
      await visitor.getByTestId('demo-continue').click();
      await visitor.getByTestId('demo-ready-step').waitFor({ timeout: 20_000 });
      await visitor.getByTestId('demo-society-overview').waitFor();
      await settle(visitor);
      await shot(visitor, `entry-society-ready-${w}-${l}`);
      await visitor.context().close();

      const page = await start(browser, vp, 'alnoor_manager', locale);
      const id = await november(page, 'notified');
      await as(page, 'alnoor_treasurer');
      await go(page, `/backoffice/billing/runs/${id}`, 'run-read-only');
      await shot(page, `c-run-notified-read-only-${w}-${l}`);
      await go(page, `/backoffice/fin/invoices-list?period=2026-11&source=billing_run`, 'society-invoices');
      await shot(page, `invoices-november-79-${w}-${l}`);
      await go(page, '/backoffice/fin/invoices-list?q=A-101&source=billing_run', 'society-invoice-row');
      await page.getByTestId('society-invoice-row').first().click();
      await page.getByTestId('invoice-lines').waitFor();
      await settle(page);
      await shot(page, `invoice-a101-november-no-edit-${w}-${l}`);
      await page.getByTestId('invoice-credit-note').click();
      const cn = page.getByTestId('credit-note-drawer');
      await cn.waitFor();
      await cn.getByTestId('credit-amount-water').fill('400');
      await cn.getByTestId('credit-reason').fill(locale === 'ur-PK' ? 'نومبر میں پانی کی ٹنکی مرمت کے لیے بند رہی' : 'Water tank closed for repairs in November');
      await settle(page, 300);
      await shot(page, `credit-note-drawer-${w}-${l}`, false);
      await cn.getByTestId('credit-note-save').click();
      await page.getByTestId('invoice-credit-notes').waitFor();
      await settle(page);
      await shot(page, `invoice-a101-credited-${w}-${l}`);
      await go(page, `${SITE}/units/unt_anr_a101?tab=invoices`, 'statement');
      await shot(page, `statement-a101-with-credit-note-${w}-${l}`);
      await as(page, 'alnoor_guard');
      await go(page, '/backoffice', 'plan-home');
      await shot(page, `guard-home-no-billing-${w}-${l}`);
      await go(page, '/backoffice/billing/runs', 'access-outcome');
      await shot(page, `guard-billing-refused-${w}-${l}`);
      await page.context().close();
    });
  }
}

const RECORD = (size: { width: number; height: number }) => ({ recordVideo: { dir: RAW, size } });

test('video: society onboarding to 79 posted invoices (desktop, English)', async ({ browser }) => {
  test.setTimeout(420_000);
  const page = await start(browser, 'desktop', null, 'en-PK', RECORD(VIEWPORTS.desktop));
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await go(page, '/backoffice/get-started', 'choice-society');
  await page.getByTestId('choice-society').click();
  await page.getByTestId('demo-role-alnoor_manager').click();
  await page.getByTestId('demo-fresh').click();
  await pause();
  await page.getByTestId('demo-continue').click();
  await page.getByTestId('demo-ready-step').waitFor({ timeout: 20_000 });
  await pause(1500);
  await page.getByTestId('demo-explore').click();
  await page.getByTestId('society-dashboard').waitFor();
  await pause(1500);
  await page.locator('[data-task="import_flats"]').click();
  await page.getByTestId('import-sample').click();
  await page.getByTestId('import-review').waitFor();
  await pause(2000);
  await page.getByTestId('import-apply-all').click();
  await pause(1200);
  await page.getByTestId('import-ack').click();
  await page.getByTestId('import-commit').click();
  await page.getByTestId('import-done').waitFor();
  await pause(1500);
  await page.getByTestId('import-open-structure').click();
  await page.getByTestId('structure-tree').waitFor();
  await pause(1500);
  await go(page, `${SITE}/units/unt_anr_a102`, 'flat-chain', 1500);
  await go(page, `${SITE}/opening-balances`, 'opening-page');
  await page.getByTestId('opening-sample').click();
  await page.getByTestId('opening-preview').waitFor();
  await pause(1200);
  await page.getByTestId('opening-submit').click();
  await page.getByTestId('opening-waiting').waitFor();
  await pause();
  await as(page, 'alnoor_treasurer');
  await go(page, `${SITE}/opening-balances`, 'opening-approve');
  await page.getByTestId('opening-approve').click();
  await pause(600);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await pause(1200);
  await as(page, 'alnoor_manager');
  await go(page, '/backoffice/billing/rules', 'rules-defaults');
  await page.getByTestId('rules-defaults-save').click();
  await pause(1000);
  await page.getByTestId('rules-add').click();
  await page.getByTestId('rule-target-utp_anr_penthouse').click();
  await page.getByTestId('rule-amount').fill('4500');
  await pause(600);
  await page.getByTestId('rule-save').click();
  await page.getByTestId('which-rule-wins').waitFor();
  await pause(1800);
  await go(page, '/backoffice/billing/exemptions', 'exemptions-page');
  await page.getByTestId('exemption-new').click();
  await page.getByTestId('exemption-drawer').getByRole('combobox').fill('A-108');
  await page.getByRole('option', { name: /^A-108/ }).click();
  await page.getByTestId('exemption-reason').fill('Association office (committee resolution)');
  await pause(600);
  await page.getByTestId('exemption-save').click();
  await pause(1000);
  await as(page, 'alnoor_treasurer');
  await go(page, '/backoffice/billing/exemptions', 'exemption-approve');
  await page.getByTestId('exemption-approve').click();
  await pause(500);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await pause(1000);
  await as(page, 'alnoor_manager');
  await go(page, '/backoffice/billing/runs/new', 'new-run-create');
  await pause(1200);
  await page.getByTestId('new-run-create').click();
  await page.getByTestId('run-preview').click();
  await page.getByTestId('run-checks').waitFor();
  await pause(2000);
  await page.getByRole('tab', { name: 'Flats' }).click();
  await pause(1800);
  await page.getByTestId('run-submit').click();
  await pause(1800);
  const runUrl = page.url().split('?')[0]!;
  await as(page, 'alnoor_treasurer');
  await page.goto(runUrl);
  await page.getByTestId('run-approve').waitFor();
  await pause(1200);
  await page.getByTestId('run-approve').click();
  await pause(1000);
  await page.getByTestId('run-post').click();
  await pause(600);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Post 79 invoices' }).click();
  await page.locator('[data-testid="run-workspace"][data-state="POSTED"]').waitFor();
  await pause(1200);
  await page.getByTestId('run-notify').click();
  await page.locator('[data-testid="run-workspace"][data-state="NOTIFIED"]').waitFor();
  await page.getByRole('tab', { name: 'Posting' }).click();
  await pause(2000);
  await go(page, '/backoffice/fin/invoices-list?period=2026-11&source=billing_run', 'society-invoices', 2000);
  await as(page, 'alnoor_manager');
  await go(page, '/backoffice', 'society-dashboard', 2500);
  await keepVideo(page, 'society-onboarding-to-79-posted-invoices-desktop-en');
});

test('video: Flat 360, connected records and a payer change (desktop, English)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await start(browser, 'desktop', 'alnoor_manager', 'en-PK', RECORD(VIEWPORTS.desktop));
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await go(page, '/backoffice', 'society-dashboard', 1500);
  await page.getByTestId('flat-jump').getByRole('combobox').fill('a102');
  await pause(800);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByTestId('flat-chain').waitFor();
  await pause(2000);
  await page.getByRole('tab', { name: 'Ownership and occupancy' }).click();
  await pause(1500);
  await page.getByRole('tab', { name: 'Payer and account' }).click();
  await pause(1500);
  await page.getByTestId('flat-next').click();
  await page.getByTestId('flat-chain').waitFor();
  await pause(1200);
  await go(page, `${SITE}/units/unt_anr_b204?tab=payer`, 'liability-history', 1200);
  await page.getByTestId('flat-change-payer').click();
  await pause(1200);
  await page.getByTestId('change-payer-drawer').locator('[data-testid^="change-payer-party-"]', { hasText: 'Hina Rana' }).click();
  await pause(800);
  await page.getByTestId('change-payer-save').click();
  await pause(1500);
  await page.getByRole('tab', { name: 'Invoices and statement' }).click();
  await pause(1500);
  await page.getByTestId('statement-period').getByText('October 2026').click();
  await pause(1500);
  await page.getByTestId('flat-related').click();
  await pause(1800);
  await page.keyboard.press('Escape');
  await go(page, '/backoffice/billing/accounts/ba_anr_a201?tab=statement', 'statement', 1500);
  await keepVideo(page, 'flat-360-connected-records-payer-change-desktop-en');
});

test('video: preparing November on a phone, and maker-checker (phone, Urdu)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await start(browser, 'phone', 'alnoor_manager', 'ur-PK', RECORD(VIEWPORTS.phone));
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await go(page, '/backoffice', 'society-dashboard', 1500);
  await page.getByTestId('dashboard-primary-action').click();
  await page.getByTestId('new-run-checks').waitFor();
  await pause(1500);
  await page.getByTestId('new-run-create').click();
  await page.getByTestId('run-preview').click();
  await page.getByTestId('run-checks').waitFor();
  await pause(1800);
  await page.getByTestId('run-submit').click();
  await pause(2000);
  const runUrl = page.url().split('?')[0]!;
  await as(page, 'alnoor_treasurer');
  await page.goto(runUrl);
  await page.getByTestId('run-approve').waitFor();
  await pause(1500);
  await page.getByTestId('run-approve').click();
  await pause(1200);
  await page.getByTestId('run-post').click();
  await pause(800);
  await page.getByRole('alertdialog').getByRole('button').last().click();
  await page.locator('[data-testid="run-workspace"][data-state="POSTED"]').waitFor();
  await pause(2000);
  await keepVideo(page, 'billing-run-maker-checker-phone-ur');
});

test('video: correcting a posted invoice with a credit note (desktop, English)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await start(browser, 'desktop', 'alnoor_manager', 'en-PK', RECORD(VIEWPORTS.desktop));
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await page.goto(`${BO}/backoffice`);
  await page.getByTestId('society-dashboard').waitFor();
  await november(page, 'notified');
  await as(page, 'alnoor_treasurer');
  await go(page, '/backoffice/fin/invoices-list?q=A-101&source=billing_run', 'society-invoice-row', 1200);
  await page.getByTestId('society-invoice-row').first().click();
  await page.getByTestId('invoice-lines').waitFor();
  await pause(2000);
  await page.getByTestId('invoice-credit-note').click();
  await pause(1000);
  await page.getByTestId('credit-amount-water').fill('400');
  await page.getByTestId('credit-reason').fill('Water tank closed for repairs in November');
  await pause(1000);
  await page.getByTestId('credit-note-save').click();
  await page.getByTestId('invoice-credit-notes').waitFor();
  await pause(1800);
  await go(page, `${SITE}/units/unt_anr_a101?tab=invoices`, 'statement', 2500);
  await keepVideo(page, 'credit-note-correction-desktop-en');
});

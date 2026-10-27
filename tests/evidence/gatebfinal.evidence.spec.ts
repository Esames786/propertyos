import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, HQ, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate B final evidence (CP2 security corrections, owner decisions and the remaining Gate B scope)
 * → docs/status/gate-b-final/{screenshots,video}. Run on its own against production builds:
 * `npx playwright test --project=evidence tests/evidence/gatebfinal.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-b-final/screenshots';
const VIDEO = 'docs/status/gate-b-final/video';
const RAW = 'test-results/gatebfinal-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });

async function open(
  browser: Browser,
  vp: ViewportName,
  host: string,
  path: string,
  opts: { persona: PersonaId | null; locale?: Locale; app?: 'backoffice' | 'platform'; context?: BrowserContextOptions },
) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], ...opts.context });
  const page = await context.newPage();
  await seed(page, { app: opts.app ?? 'backoffice', persona: opts.persona, locale: opts.locale ?? 'en-PK', onboarding: 'done', mock: 'fast' });
  await page.goto(`${host}${path}`);
  await settle(page, 1200);
  return page;
}

async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function go(page: Page, url: string, ready: string, ms = 700) {
  await page.goto(url);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

async function chooseProject(page: Page, name: string) {
  await page.locator('[data-tour-id="project-switcher"]:visible').click();
  await page.getByRole('option', { name }).click();
  await settle(page, 500);
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  for (const vp of ['desktop', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;

    test(`two sites and record checks ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const cb = await open(browser, vp, BO, '/backoffice', { persona: 'cb_manager', locale });
      await cb.getByTestId('management-dashboard').waitFor();
      await shot(cb, `bo-crescent-home-towers-only-${w}-${l}`, true);
      await go(cb, `${BO}/backoffice/inv/unit-360-workspace?record=unt_cb_p_0101`, 'access-outcome');
      await shot(cb, `bo-crescent-plaza-unit-not-licensed-${w}-${l}`, true);
      await go(cb, `${BO}/backoffice/inv/unit-360-workspace?record=unt_cb_import_001`, 'access-outcome');
      await shot(cb, `bo-crescent-unassigned-record-no-site-${w}-${l}`, true);
      await go(cb, `${BO}/backoffice/crm/lead-360-workspace?record=led_0001`, 'access-outcome');
      await shot(cb, `bo-crescent-other-tenant-record-not-found-${w}-${l}`, true);
      await go(cb, `${BO}/backoffice/global/my-access`, 'my-access-areas');
      await shot(cb, `bo-crescent-my-access-${w}-${l}`, true);
      await go(cb, `${BO}/backoffice/home/role-aware-dashboard`, 'management-dashboard');
      await chooseProject(cb, 'Crescent Bay Plaza');
      await go(cb, `${BO}/backoffice/inv/unit-matrix`, 'access-outcome');
      await shot(cb, `bo-crescent-plaza-context-inventory-refused-${w}-${l}`, true);
      if (vp === 'desktop') {
        await cb.keyboard.press('Control+k');
        await cb.getByTestId('command-palette').getByRole('searchbox').fill('CB-P-01');
        await settle(cb, 900);
        await shot(cb, `bo-crescent-search-plaza-no-units-${w}-${l}`);
        await cb.keyboard.press('Escape');
      } else {
        await go(cb, `${BO}/backoffice/more`, 'bottom-nav');
        await shot(cb, `bo-crescent-more-plaza-context-${w}-${l}`, true);
      }
      await cb.context().close();
    });

    test(`suspended co-operative and honest homes ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const cedar = await open(browser, vp, BO, '/backoffice', { persona: 'cedar_treasurer', locale });
      await cedar.getByTestId('suspended-banner').waitFor();
      await shot(cedar, `bo-cedar-suspended-home-${w}-${l}`, true);
      await go(cedar, `${BO}/backoffice/fin/invoices-list`, 'invoices-list');
      await shot(cedar, `bo-cedar-invoice-history-${w}-${l}`, true);
      await go(cedar, `${BO}/backoffice/res/resident-dashboard`, 'access-outcome');
      await shot(cedar, `bo-cedar-operational-paused-${w}-${l}`, true);
      await cedar.context().close();

      const fm = await open(browser, vp, BO, '/backoffice', { persona: 'facility_manager', locale });
      await fm.getByTestId('plan-home-planned').waitFor();
      await shot(fm, `bo-maintenance-home-planned-honest-${w}-${l}`, true);
      await fm.context().close();

      const admin = await open(browser, vp, BO, '/backoffice', { persona: 'society_admin', locale });
      await admin.getByTestId('plan-home').waitFor();
      await shot(admin, `bo-shalimar-admin-people-and-contacts-${w}-${l}`, true);
      await go(admin, `${BO}/backoffice/adm/plan`, 'plan-included');
      await shot(admin, `bo-shalimar-plan-scheduled-modules-${w}-${l}`, true);
      await admin.context().close();

      const lk = await open(browser, vp, BO, '/backoffice/more', { persona: 'manager', locale });
      await lk.getByTestId('more-area-customers').waitFor();
      await shot(lk, `bo-larkspur-more-customers-and-buyers-${w}-${l}`, true);
      await go(lk, `${BO}/backoffice/settings/onboarding`, 'pref-prototype-tools');
      await shot(lk, `bo-preferences-prototype-tools-off-${w}-${l}`, true);
      await lk.context().close();
    });

    test(`HQ commercial configuration ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(300_000);
      mkdirSync(DIR, { recursive: true });
      const hq = await open(browser, vp, HQ, '/hq/policies', { persona: 'supreme_admin', app: 'platform', locale });
      await hq.getByTestId('policy-thresholds').waitFor();
      await shot(hq, `hq-policy-in-force-${w}-${l}`, true);
      await hq.getByTestId('config-new').click();
      await hq.getByTestId('config-draft').waitFor();
      await hq.getByTestId('policy-input-maxDiscountPct').getByRole('textbox').fill('10');
      await hq.getByTestId('config-reason').getByRole('textbox').fill('Tighter discounts after the Q3 review');
      await settle(hq, 400);
      await shot(hq, `hq-policy-draft-editor-${w}-${l}`, true);
      await hq.getByTestId('config-submit').click();
      await hq.getByTestId('config-version-2').waitFor();
      await settle(hq, 600);
      await shot(hq, `hq-policy-awaiting-approval-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/rate-cards`, 'rate-card-lines');
      await shot(hq, `hq-rate-cards-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/catalogue?tab=dependencies`, 'catalogue-dependencies');
      await shot(hq, `hq-catalogue-dependencies-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/catalogue?tab=modules`, 'catalogue-modules');
      await shot(hq, `hq-catalogue-modules-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/requests`, 'requests-list');
      await shot(hq, `hq-requests-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/requests?tab=signup`, 'signup-by-edition');
      await shot(hq, `hq-signup-policy-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/audit?category=configuration`, 'audit-log');
      await shot(hq, `hq-audit-configuration-${w}-${l}`, true);
      await hq.context().close();
    });

    test(`HQ amendments, usage and preview ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(300_000);
      mkdirSync(DIR, { recursive: true });
      const hq = await open(browser, vp, HQ, '/hq/tenants/tnt_larkspur?tab=subscription', { persona: 'supreme_admin', app: 'platform', locale });
      await hq.getByTestId('t360-contract-history').waitFor();
      await shot(hq, `hq-larkspur-contract-history-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/tenants/tnt_larkspur/contracts/new`, 'amend-impact');
      await hq.getByTestId('amend-modules-public_website').click();
      await hq.getByTestId('amend-module-changes').waitFor();
      await settle(hq, 800);
      await shot(hq, `hq-amend-impact-preview-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/tenants/tnt_shalimar?tab=subscription`, 't360-contract-history');
      await shot(hq, `hq-shalimar-scheduled-change-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/tenants/tnt_riverbend?tab=usage`, 't360-billing');
      await shot(hq, `hq-riverbend-usage-and-billing-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/tenants/tnt_riverbend?tab=usage&drawer=meter-evidence&snapshot=snp_riverbend_units_eligible_202610`, 'evidence-excluded');
      await shot(hq, `hq-meter-evidence-corrected-${w}-${l}`);
      await go(hq, `${HQ}/hq/tenants/tnt_crescent?tab=usage&drawer=meter-evidence&snapshot=snp_crescent_units_registered_202610`, 'evidence-excluded');
      await shot(hq, `hq-meter-evidence-no-site-${w}-${l}`);
      await go(hq, `${HQ}/hq/tenants/tnt_shalimar/preview?role=administrator&at=2026-11-01`, 'preview-areas');
      await shot(hq, `hq-preview-shalimar-on-1-november-${w}-${l}`, true);
      await go(hq, `${HQ}/hq/tenants/tnt_crescent/preview?role=administration`, 'preview-areas');
      await shot(hq, `hq-preview-crescent-role-templates-${w}-${l}`, true);
      await hq.context().close();
    });
  }
}

const RECORD = (size: { width: number; height: number }) => ({ recordVideo: { dir: RAW, size } });
const DESKTOP = { width: 1440, height: 900 };

test('video: one tenant, two sites, different licences (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', BO, '/backoffice', { persona: 'cb_manager', context: RECORD(DESKTOP) });
  await page.getByTestId('management-dashboard').waitFor();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('CB-A-01', { delay: 120 });
  await page.waitForTimeout(1800);
  await page.getByTestId('command-palette').getByRole('searchbox').fill('');
  await page.keyboard.type('CB-P-01', { delay: 120 });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Escape');
  await page.goto(`${BO}/backoffice/inv/unit-360-workspace?record=unt_cb_a_0101`);
  await page.getByTestId('planned-screen').waitFor();
  await page.waitForTimeout(1800);
  await page.goto(`${BO}/backoffice/inv/unit-360-workspace?record=unt_cb_p_0101`);
  await page.getByTestId('access-outcome').waitFor();
  await page.waitForTimeout(2500);
  await page.goto(`${BO}/backoffice/home/role-aware-dashboard`);
  await page.getByTestId('management-dashboard').waitFor();
  await chooseProject(page, 'Crescent Bay Plaza');
  await page.waitForTimeout(1800);
  await page.goto(`${BO}/backoffice/inv/unit-matrix`);
  await page.getByTestId('access-outcome').waitFor();
  await page.waitForTimeout(2000);
  await chooseProject(page, 'Crescent Bay Towers');
  await page.waitForTimeout(2000);
  await page.goto(`${BO}/backoffice/global/my-access`);
  await page.getByTestId('my-access-areas').waitFor();
  await page.waitForTimeout(2500);
  await keepVideo(page, 'bo-two-sites-licensing-desktop-en');
});

test('video: switching tenants without leaking data (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', BO, '/backoffice/crm/leads-list', { persona: 'manager', context: RECORD(DESKTOP) });
  await page.getByTestId('leads-search').waitFor();
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__prototype!.transport.request({ method: 'POST', path: '/leads', body: { fullName: 'Switch Test Person', phone: '03001234567', projectId: 'prj_heights', source: 'walk_in' } }));
  await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
  await page.getByText('Switch Test Person').first().waitFor();
  await page.waitForTimeout(2000);
  await page.goto(`${BO}/backoffice/more`);
  await page.getByTestId('more-sign-out').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('sign-in-cb_manager').click();
  await page.getByTestId('welcome-explore').click();
  await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
  await page.waitForTimeout(2500);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Switch Test', { delay: 100 });
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.goto(`${BO}/backoffice/more`);
  await page.getByTestId('more-sign-out').click();
  await page.getByTestId('sign-in-manager').click();
  await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
  await page.getByText('Switch Test Person').first().waitFor();
  await page.waitForTimeout(2500);
  await keepVideo(page, 'bo-tenant-switching-no-leakage-desktop-en');
});

test('video: a suspended co-operative keeps its financial history (phone, Urdu)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'phone', BO, '/backoffice', { persona: 'cedar_treasurer', locale: 'ur-PK', context: RECORD({ width: 390, height: 844 }) });
  await page.getByTestId('suspended-banner').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('plan-qa-invoices').click();
  await page.getByTestId('invoices-list').waitFor();
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1500);
  await page.goto(`${BO}/backoffice/res/resident-dashboard`);
  await page.getByTestId('access-outcome').waitFor();
  await page.waitForTimeout(2500);
  await keepVideo(page, 'bo-suspended-history-phone-ur');
});

test('video: commercial policy configuration with maker-checker (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', HQ, '/hq/policies', { persona: 'supreme_admin', app: 'platform', context: RECORD(DESKTOP) });
  await page.getByTestId('policy-thresholds').waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId('config-new').click();
  await page.getByTestId('config-draft').waitFor();
  await page.waitForTimeout(1000);
  const discount = page.getByTestId('policy-input-maxDiscountPct').getByRole('textbox');
  await discount.fill('10');
  await discount.press('Tab');
  await page.getByTestId('config-reason').getByRole('textbox').pressSequentially('Tighter discounts after the Q3 review', { delay: 40 });
  await page.waitForTimeout(800);
  await page.getByTestId('config-submit').click();
  await page.getByTestId('config-version-2').waitFor();
  await page.waitForTimeout(2200);
  await page.goto(`${HQ}/hq/more`);
  await page.getByTestId('more-role-commercial_approver').click();
  await page.getByTestId('welcome-explore').click();
  await page.goto(`${HQ}/hq/policies`);
  await page.getByTestId('config-approve-2').waitFor();
  await page.getByTestId('config-changes-2-toggle').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('config-approve-2').click();
  await page.waitForTimeout(800);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(2200);
  await page.goto(`${HQ}/hq/audit?category=configuration`);
  await page.getByTestId('audit-log').waitFor();
  await page.waitForTimeout(3000);
  await keepVideo(page, 'hq-policy-configuration-workflow-desktop-en');
});

test('video: contract amendment with impact preview and history (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', HQ, '/hq/tenants/tnt_larkspur?tab=subscription', { persona: 'supreme_admin', app: 'platform', context: RECORD(DESKTOP) });
  await page.getByTestId('t360-contract-history').waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId('contract-changes-2-toggle').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('t360-amend').click();
  await page.getByTestId('amend-impact').waitFor();
  await page.waitForTimeout(1500);
  await page.getByTestId('amend-modules-public_website').click();
  await page.getByTestId('amend-module-changes').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('amend-reason').getByRole('textbox').pressSequentially('Website for the Gardens launch', { delay: 40 });
  await page.getByTestId('amend-submit').click();
  await page.getByTestId('contract-version-3').waitFor();
  await page.waitForTimeout(2500);
  await page.goto(`${HQ}/hq/tenants/tnt_shalimar?tab=modules`);
  await page.getByTestId('t360-grants').waitFor();
  await page.waitForTimeout(2000);
  await page.goto(`${HQ}/hq/tenants/tnt_shalimar/preview?role=administrator&at=2026-11-01`);
  await page.getByTestId('preview-areas').waitFor();
  await page.waitForTimeout(3000);
  await keepVideo(page, 'hq-amendment-and-history-desktop-en');
});

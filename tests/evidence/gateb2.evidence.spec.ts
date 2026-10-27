import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, HQ, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate B checkpoint 2 evidence → docs/status/gate-b-checkpoint-2/{screenshots,video}. Run on its own
 * against production builds: `npx playwright test --project=evidence tests/evidence/gateb2.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-b-checkpoint-2/screenshots';
const VIDEO = 'docs/status/gate-b-checkpoint-2/video';
const RAW = 'test-results/gateb2-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });

async function open(
  browser: Browser,
  vp: ViewportName,
  host: string,
  path: string,
  opts: { persona?: PersonaId | null; locale?: Locale; app?: 'backoffice' | 'platform'; context?: BrowserContextOptions } = {},
) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], ...opts.context });
  const page = await context.newPage();
  await seed(page, { app: opts.app ?? 'backoffice', persona: opts.persona === undefined ? 'facility_manager' : opts.persona, locale: opts.locale ?? 'en-PK', onboarding: 'done', mock: 'fast' });
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

test.describe.configure({ mode: 'parallel' });
// Historical: the Gate B checkpoint 2 folder is the "before" set; Gate B final evidence lives in gatebfinal.evidence.spec.ts.
test.skip(true, 'Historical evidence of Gate B checkpoint 2');

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  for (const vp of ['desktop', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;

    test(`workspace access ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const signIn = await open(browser, vp, BO, '/backoffice/sign-in', { persona: null, locale });
      await shot(signIn, `bo-sign-in-grouped-${w}-${l}`, true);
      await signIn.context().close();

      const fm = await open(browser, vp, BO, '/backoffice', { locale });
      await fm.getByTestId('plan-home').waitFor();
      await shot(fm, `bo-plan-home-facility-manager-${w}-${l}`, true);
      if (vp === 'desktop') {
        await fm.locator('[data-tour-id="quick-create"]:visible').click();
        await settle(fm, 500);
        await shot(fm, `bo-quick-create-maintenance-only-${w}-${l}`);
        await fm.keyboard.press('Escape');
      } else {
        await fm.getByTestId('quick-create-fab').click();
        await settle(fm, 500);
        await shot(fm, `bo-quick-create-maintenance-only-${w}-${l}`);
        await fm.keyboard.press('Escape');
        await go(fm, `${BO}/backoffice/more`, 'bottom-nav');
        await shot(fm, `bo-more-maintenance-only-${w}-${l}`, true);
      }
      await go(fm, `${BO}/backoffice/crm/sales-home`, 'access-outcome');
      await shot(fm, `bo-deep-link-not-in-plan-${w}-${l}`);
      await go(fm, `${BO}/backoffice/adm/plan`, 'access-outcome');
      await shot(fm, `bo-deep-link-not-for-role-${w}-${l}`);
      await fm.context().close();

      const admin = await open(browser, vp, BO, '/backoffice/adm/plan', { persona: 'society_admin', locale });
      await admin.getByTestId('plan-included').waitFor();
      await settle(admin, 600);
      await shot(admin, `bo-plan-page-${w}-${l}`, true);
      await admin.context().close();

      const manager = await open(browser, vp, BO, '/backoffice', { persona: 'manager', locale });
      await manager.getByTestId('management-dashboard').waitFor();
      await settle(manager, 800);
      await shot(manager, `bo-larkspur-unchanged-${w}-${l}`);
      await manager.context().close();
    });

    test(`tenant 360 and preview ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await open(browser, vp, HQ, '/hq/tenants/tnt_shalimar', { app: 'platform', persona: 'supreme_admin', locale });
      await page.getByTestId('tenant-360').waitFor();
      await settle(page);
      await shot(page, `hq-t360-overview-shalimar-${w}-${l}`, true);
      for (const [tab, tenant, ready] of [
        ['subscription', 'tnt_larkspur', 't360-components'],
        ['modules', 'tnt_shalimar', 't360-not-licensed'],
        ['usage', 'tnt_larkspur', 't360-usage'],
        ['commercial', 'tnt_kestrel', 't360-approval'],
        ['audit', 'tnt_larkspur', 'audit-trail'],
      ] as const) {
        await go(page, `${HQ}/hq/tenants/${tenant}?tab=${tab}`, ready);
        await shot(page, `hq-t360-${tab}-${tenant.replace('tnt_', '')}-${w}-${l}`, true);
      }
      await go(page, `${HQ}/hq/tenants/tnt_shalimar/preview?role=facility_manager`, 'preview-areas', 900);
      await shot(page, `hq-preview-shalimar-facility-manager-${w}-${l}`, true);
      await go(page, `${HQ}/hq/tenants/tnt_larkspur/preview?role=sales`, 'preview-areas', 900);
      await shot(page, `hq-preview-larkspur-sales-${w}-${l}`, true);
      await go(page, `${HQ}/hq/tenants/tnt_shalimar/preview?role=society_admin`, 'preview-areas', 900);
      await page.getByTestId('preview-whatif-toggle').click();
      await page.getByTestId('preview-module-crm').click();
      await page.getByTestId('preview-whatif-banner').waitFor();
      await settle(page, 900);
      await shot(page, `hq-preview-what-if-crm-${w}-${l}`, true);
      await page.context().close();
    });

    test(`wizard ux ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await open(browser, vp, HQ, '/hq/tenants/new', { app: 'platform', persona: 'supreme_admin', locale });
      await page.getByTestId('wizard-guide').click();
      await page.getByTestId('tour-next').click();
      await page.getByTestId('tour-next').click();
      await settle(page, 900);
      await shot(page, `hq-wizard-guided-help-${w}-${l}`);
      await page.getByTestId('tour-skip').click();
      await settle(page, 400);
      const input = (id: string) => page.getByTestId(id).locator('input').first();
      await page.getByTestId('edition-community').click();
      await page.getByTestId('step-type-next').click();
      await input('org-display').fill('Evidence Gardens (Demo)');
      await input('org-legal').fill('Evidence Gardens Owners Association (Demo)');
      await input('org-contact').fill('Faisal Butt');
      await input('org-email').fill('faisal@example.com');
      await input('org-phone').fill('03994100000');
      await page.getByTestId('step-organisation-next').click();
      await input('site-units-0').fill('80');
      await input('site-units-0').press('Tab');
      await page.getByTestId('step-sites-next').click();
      await page.getByTestId('dependencies-ok').waitFor();
      await page.getByTestId('step-modules-next').click();
      await page.getByTestId('pricing-builder').waitFor();
      await settle(page, 800);
      await shot(page, `hq-wizard-pricing-basic-${w}-${l}`, true);
      await page.getByTestId('pricing-builder-advanced').click();
      await settle(page, 500);
      await shot(page, `hq-wizard-pricing-advanced-${w}-${l}`, true);
      await page.getByTestId('step-pricing-next').click();
      await page.getByTestId('step-counts-next').click();
      await page.getByTestId('step-terms').waitFor();
      await settle(page, 600);
      await shot(page, `hq-wizard-terms-folded-${w}-${l}`, true);
      await page.getByTestId('terms-more-toggle').click();
      await settle(page, 500);
      await shot(page, `hq-wizard-terms-more-open-${w}-${l}`, true);
      await page.context().close();
    });
  }
}

test('video: HQ previews a maintenance-only client and tries a module (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', HQ, '/hq/tenants/tnt_shalimar', { app: 'platform', persona: 'supreme_admin', context: { recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } } });
  await page.getByTestId('tenant-360').waitFor();
  await page.waitForTimeout(2200);
  for (const tab of ['Subscription', 'Modules and sites']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(2000);
  }
  await page.getByTestId('t360-modules-preview').click();
  await page.getByTestId('preview-areas').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('preview-role').getByText('Facility manager').click();
  await page.waitForTimeout(2500);
  await page.getByTestId('preview-address').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.getByTestId('preview-whatif-toggle').scrollIntoViewIfNeeded();
  await page.getByTestId('preview-whatif-toggle').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('preview-module-crm').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('preview-areas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await keepVideo(page, 'hq-tenant360-preview-whatif-desktop-en');
});

test('video: the maintenance-only client in its own workspace (desktop, English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', BO, '/backoffice', { context: { recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } } });
  await page.getByTestId('plan-home').waitFor();
  await page.waitForTimeout(2500);
  await page.locator('[data-tour-id="quick-create"]:visible').click();
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  await page.keyboard.type('Sales', { delay: 120 });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Escape');
  await page.goto(`${BO}/backoffice/crm/sales-home`);
  await page.getByTestId('access-outcome').waitFor();
  await page.waitForTimeout(2500);
  await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0001`);
  await page.getByTestId('access-outcome').waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId('access-outcome-start').click();
  await page.getByTestId('plan-home').waitFor();
  await page.getByTestId('plan-area-operations').click();
  await page.getByTestId('planned-screen').waitFor();
  await page.waitForTimeout(2500);
  await keepVideo(page, 'bo-maintenance-only-client-desktop-en');
});

test('video: preview and the client’s phone, in Urdu', async ({ browser }) => {
  test.setTimeout(300_000);
  const hq = await open(browser, 'phone', HQ, '/hq/tenants/tnt_shalimar/preview?role=facility_manager', { app: 'platform', persona: 'supreme_admin', locale: 'ur-PK', context: { recordVideo: { dir: RAW, size: { width: 390, height: 844 } } } });
  await hq.getByTestId('preview-areas').waitFor();
  await hq.waitForTimeout(2000);
  await hq.mouse.wheel(0, 700);
  await hq.waitForTimeout(1800);
  await hq.mouse.wheel(0, 900);
  await hq.waitForTimeout(1800);
  await keepVideo(hq, 'hq-preview-phone-ur');

  const bo = await open(browser, 'phone', BO, '/backoffice', { locale: 'ur-PK', context: { recordVideo: { dir: RAW, size: { width: 390, height: 844 } } } });
  await bo.getByTestId('plan-home').waitFor();
  await bo.waitForTimeout(2000);
  await bo.getByTestId('quick-create-fab').click();
  await bo.waitForTimeout(1800);
  await bo.keyboard.press('Escape');
  await bo.goto(`${BO}/backoffice/crm/sales-home`);
  await bo.getByTestId('access-outcome').waitFor();
  await bo.waitForTimeout(2500);
  await keepVideo(bo, 'bo-maintenance-only-phone-ur');
});

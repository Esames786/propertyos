import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, CU, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Stage 1.5R evidence → docs/status/ui-stage-1.5R/{screenshots,video}. Run on its own against
 * production builds: `npx playwright test --project=evidence tests/evidence/stage15r.evidence.spec.ts`.
 * Earlier evidence folders are left untouched as the "before" sets.
 */
const DIR = 'docs/status/ui-stage-1.5R/screenshots';
const VIDEO = 'docs/status/ui-stage-1.5R/video';
const RAW = 'test-results/stage15r-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

interface OpenOptions {
  persona?: PersonaId | null;
  locale?: Locale;
  onboarding?: 'fresh' | 'done' | 'offers';
  app?: 'backoffice' | 'customer';
  mock?: 'fast' | 'normal';
  context?: BrowserContextOptions;
}

async function open(browser: Browser, vp: ViewportName, url: string, opts: OpenOptions = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], ...opts.context });
  const page = await context.newPage();
  await seed(page, {
    persona: opts.persona === undefined ? 'manager' : opts.persona,
    locale: opts.locale ?? 'en-PK',
    onboarding: opts.onboarding ?? 'done',
    app: opts.app ?? 'backoffice',
    mock: opts.mock ?? 'fast',
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200); // entrances, count-ups and draw-ins settle
  return page;
}

async function settle(page: Page, ms = 900) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

/** Saves the page's video under a readable name once its context is closed. */
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

  for (const vp of ['desktop', 'phone'] as const) {
    const w = VIEWPORTS[vp].width;

    test(`entry: get started, demo launch and workspace setup (${l}, ${w})`, async ({ browser }) => {
      test.setTimeout(120_000);
      const page = await open(browser, vp, `${BO}/backoffice/get-started`, { persona: null, locale, onboarding: 'fresh', mock: 'normal' });
      await shot(page, `entry-get-started-${w}-${l}`, true);
      // The Stage 1.5 entry (persona sign-in) is still there for returning visitors: the "before".
      await page.goto(`${BO}/backoffice/sign-in`);
      await settle(page);
      await shot(page, `entry-sign-in-${w}-${l}`, true);
      await page.goto(`${BO}/backoffice/get-started`);
      await settle(page);
      await page.getByTestId('choice-demo').click();
      await settle(page);
      await shot(page, `entry-demo-role-${w}-${l}`, true);
      await page.getByTestId('demo-role-sales').click();
      await page.getByTestId('demo-continue').click();
      await page.waitForTimeout(250);
      await shot(page, `entry-demo-preparing-${w}-${l}`);
      await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 15_000 });
      await settle(page);
      await shot(page, `entry-demo-ready-${w}-${l}`, true);

      await page.goto(`${BO}/backoffice/get-started/setup`);
      await settle(page);
      await shot(page, `entry-setup-account-${w}-${l}`, true);
      await page.getByTestId('setup-account-next').click();
      await settle(page, 500);
      await shot(page, `entry-setup-account-errors-${w}-${l}`, true);
      await page.context().close();
    });

    test(`sales workspace (${l}, ${w})`, async ({ browser }) => {
      test.setTimeout(120_000);
      let page = await open(browser, vp, `${BO}/backoffice/crm/sales-home`, { persona: 'sales', locale });
      await shot(page, `sales-home-${w}-${l}`);
      await shot(page, `sales-home-${w}-${l}-full`, true);
      await page.goto(`${BO}/backoffice/crm/leads-list?status=qualified`);
      await settle(page);
      await shot(page, `sales-leads-qualified-${w}-${l}`);
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
      await settle(page);
      await shot(page, `sales-lead-overview-${w}-${l}`, true);
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033&tab=activity`);
      await settle(page);
      await shot(page, `sales-lead-activity-${w}-${l}`);
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033&tab=units`);
      await settle(page);
      await page.getByTestId('matched-unit-open').first().click();
      await settle(page);
      await shot(page, `sales-unit-quick-view-${w}-${l}`);
      await page.keyboard.press('Escape');
      await page.getByTestId('lead-contact').getByRole('button').first().click();
      await settle(page, 500);
      await shot(page, `sales-contact-sheet-${w}-${l}`);
      await page.keyboard.press('Escape');
      await page.goto(`${BO}/backoffice/crm/sales-home?drawer=new-lead`);
      await settle(page);
      await shot(page, `sales-new-lead-drawer-${w}-${l}`);
      await page.context().close();

      page = await open(browser, vp, `${BO}/backoffice/home/role-aware-dashboard`, { locale });
      await shot(page, `dashboard-${w}-${l}`);
      await shot(page, `dashboard-${w}-${l}-full`, true);
      if (vp === 'phone') {
        await page.goto(`${BO}/backoffice/more`);
        await settle(page);
        await shot(page, `more-${w}-${l}`, true);
        await page.getByTestId('quick-create-fab').click();
        await settle(page, 500);
        await shot(page, `quick-create-fab-${w}-${l}`);
      }
      await page.context().close();
    });

    test(`customer portal (${l}, ${w})`, async ({ browser }) => {
      test.setTimeout(120_000);
      const page = await open(browser, vp, `${CU}/customer/portal/home`, { persona: 'resident', app: 'customer', locale });
      await shot(page, `portal-home-${w}-${l}`);
      await shot(page, `portal-home-${w}-${l}-full`, true);
      for (const [path, name] of [
        ['/customer/portal/payments-dashboard', 'payments'],
        ['/customer/portal/construction-updates', 'construction'],
        ['/customer/portal/services-home', 'services'],
        ['/customer/portal/documents', 'documents'],
        ['/customer/portal/receipt?record=rcp_14', 'receipt'],
      ] as const) {
        await page.goto(`${CU}${path}`);
        await settle(page);
        await shot(page, `portal-${name}-${w}-${l}`, true);
      }
      await page.goto(`${CU}/customer/portal/home`);
      await settle(page);
      await page.getByTestId('next-upload').click();
      await settle(page);
      await shot(page, `portal-upload-proof-${w}-${l}`, true);
      await page.getByTestId('proof-form').locator('input[name="reference"]').fill('FT26 1234 5678');
      await page.locator('input[type="file"]').setInputFiles({ name: 'transfer-slip.png', mimeType: 'image/png', buffer: PNG_1PX });
      await page.getByTestId('proof-submit').click();
      await expect(page.getByTestId('pay-done')).toHaveAttribute('data-status', 'awaiting_verification');
      await settle(page, 600);
      await shot(page, `portal-proof-awaiting-verification-${w}-${l}`);
      await page.context().close();
    });
  }

  test(`tour spotlights (${l})`, async ({ browser }) => {
    test.setTimeout(150_000);
    for (const vp of ['desktop', 'phone'] as const) {
      const w = VIEWPORTS[vp].width;
      const page = await open(browser, vp, `${BO}/backoffice/home/role-aware-dashboard`, { persona: 'manager', locale, onboarding: 'fresh' });
      await page.getByTestId('welcome-start').click();
      for (let i = 0; i < 10; i++) {
        const card = page.getByTestId('tour-card');
        await expect(card).toBeVisible();
        await page.waitForTimeout(900);
        await shot(page, `tour-${w}-${l}-${String(i + 1).padStart(2, '0')}-${await card.getAttribute('data-step-id')}`);
        await page.getByTestId('tour-next').click();
      }
      await expect(page.getByTestId('tour-completion')).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `tour-${w}-${l}-11-complete`);
      await page.context().close();
    }
    // Sales module tour: the guided "create a lead" step and the lead it creates.
    const page = await open(browser, 'desktop', `${BO}/backoffice/crm/sales-home`, { persona: 'sales', locale, onboarding: 'offers' });
    await page.getByTestId('module-offer').getByRole('button').first().click();
    for (let i = 0; i < 5; i++) await page.getByTestId('tour-next').click();
    await page.waitForTimeout(900);
    await shot(page, `tour-sales-1440-${l}-new-lead-step`);
    await page.context().close();
    // Customer portal tour (first step on the property hero).
    const portal = await open(browser, 'phone', `${CU}/customer/portal/home`, { persona: 'resident', app: 'customer', locale, onboarding: 'fresh' });
    await portal.getByTestId('welcome-start').click();
    await portal.waitForTimeout(1000);
    await shot(portal, `tour-portal-390-${l}-01-hero`);
    await portal.getByTestId('tour-next').click();
    await portal.waitForTimeout(1000);
    await shot(portal, `tour-portal-390-${l}-02-next-instalment`);
    await portal.context().close();
  });
}

test('video: first-time user journey, desktop (English)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, 'desktop', `${BO}/backoffice`, {
    persona: null,
    onboarding: 'fresh',
    mock: 'normal',
    context: { recordVideo: { dir: RAW, size: { width: 1440, height: 900 } } },
  });
  const pause = (ms = 1100) => page.waitForTimeout(ms);
  await pause(1500);
  await page.getByTestId('choice-demo').click();
  await pause();
  await page.getByTestId('demo-role-manager').click();
  await pause(700);
  await page.getByTestId('demo-continue').click();
  await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 15_000 });
  await pause(2200);
  await page.getByTestId('demo-start-tour').click();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('tour-card')).toBeVisible();
    await pause(1700);
    await page.getByTestId('tour-next').click();
  }
  await pause(1200);
  await page.keyboard.press('Escape');
  await pause(600);

  // Into Sales, then the connected CRM workflow.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Sales' }).click();
  await settle(page, 1800);
  const offer = page.getByTestId('module-offer');
  if (await offer.isVisible().catch(() => false)) await offer.getByRole('button', { name: 'Not now' }).click();
  await page.getByTestId('crm-new-lead').click();
  await pause(900);
  const drawer = page.getByTestId('new-lead-drawer');
  await drawer.getByRole('textbox', { name: /full name/i }).pressSequentially('Zoya Rehman', { delay: 60 });
  await drawer.getByRole('textbox', { name: /mobile number/i }).pressSequentially('0300 7654321', { delay: 60 });
  await drawer.getByTestId('unit-picker-project').getByRole('button').click();
  await page.getByRole('option', { name: /Larkspur Heights/ }).click();
  await pause(700);
  await page.getByTestId('new-lead-submit').click();
  await pause(2000);
  await page.getByTestId('lead-card').first().getByRole('link', { name: 'Zoya Rehman' }).click();
  await settle(page, 1500);
  await page.getByTestId('lead-contact').getByRole('button', { name: 'Call Zoya Rehman' }).click();
  await pause(1300);
  await page.getByTestId('contact-log').click();
  await pause(1200);
  await page.getByRole('tab', { name: 'Activity' }).click();
  await pause(1500);
  await page.getByTestId('lead-note-input').pressSequentially('Prefers a park-facing 2-bed', { delay: 40 });
  await page.getByTestId('lead-note-save').click();
  await pause(1500);
  await page.getByRole('tab', { name: 'Matching units' }).click();
  await pause(900);
  await page.getByTestId('matched-unit-open').first().click();
  await pause(1500);
  await page.getByTestId('unit-hold').click();
  await pause(2200);
  await keepVideo(page, 'first-run-and-crm-desktop-en');
});

test('video: first-time user on a phone (Urdu)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await open(browser, 'phone', `${BO}/backoffice`, {
    persona: null,
    locale: 'ur-PK',
    onboarding: 'fresh',
    mock: 'normal',
    context: { recordVideo: { dir: RAW, size: { width: 390, height: 844 } } },
  });
  const pause = (ms = 1100) => page.waitForTimeout(ms);
  await pause(1500);
  await page.getByTestId('choice-demo').click();
  await pause();
  await page.getByTestId('demo-role-sales').click();
  await page.getByTestId('demo-continue').click();
  await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 15_000 });
  await pause(2000);
  await page.getByTestId('demo-start-tour').click();
  for (let i = 0; i < 9; i++) {
    await expect(page.getByTestId('tour-card')).toBeVisible();
    await pause(1500);
    await page.getByTestId('tour-next').click();
  }
  await pause(1000);
  await page.keyboard.press('Escape');
  await page.getByTestId('bottom-nav').getByRole('link').nth(1).click();
  await settle(page, 1500);
  const offer = page.getByTestId('module-offer');
  if (await offer.isVisible().catch(() => false)) await offer.getByRole('button').last().click();
  await page.getByTestId('quick-create-fab').click();
  await pause(900);
  await page.getByTestId('quick-create-new-lead').click();
  await pause(900);
  const drawer = page.getByTestId('new-lead-drawer');
  await drawer.getByRole('textbox').first().pressSequentially('عائشہ خان', { delay: 80 });
  await drawer.getByRole('textbox').nth(1).pressSequentially('0300 7654321', { delay: 60 });
  await drawer.getByTestId('unit-picker-project').getByRole('button').click();
  await page.getByRole('option').first().click();
  await page.getByTestId('new-lead-submit').click();
  await pause(2500);
  await keepVideo(page, 'first-run-and-new-lead-phone-ur');
});

test('video: customer portal on a phone (English)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await open(browser, 'phone', `${CU}/customer/portal/home`, {
    persona: 'resident',
    app: 'customer',
    context: { recordVideo: { dir: RAW, size: { width: 390, height: 844 } } },
  });
  const pause = (ms = 1100) => page.waitForTimeout(ms);
  await pause(1500);
  await page.mouse.wheel(0, 700);
  await pause(1500);
  await page.mouse.wheel(0, -700);
  await pause(900);
  await page.getByTestId('next-upload').click();
  await settle(page, 1200);
  await page.getByTestId('proof-form').locator('input[name="reference"]').pressSequentially('FT26 1234 5678', { delay: 50 });
  await page.locator('input[type="file"]').setInputFiles({ name: 'transfer-slip.png', mimeType: 'image/png', buffer: PNG_1PX });
  await pause(900);
  await page.getByTestId('proof-submit').click();
  await pause(2200);
  await page.getByTestId('done-payments').click();
  await settle(page, 2000);
  await page.goto(`${CU}/customer/portal/services-home?tab=maintenance&new=1`);
  await settle(page, 1500);
  await keepVideo(page, 'customer-portal-phone-en');
});

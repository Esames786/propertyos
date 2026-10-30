import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, seed, test, waitForApp, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * axe-core WCAG 2.0/2.1/2.2 A+AA scans of every Stage 1 route in both languages at desktop and
 * phone width, plus open overlays and tour steps. Zero violations is the bar.
 */
const BACKOFFICE_ROUTES = [
  '/backoffice/home/role-aware-dashboard',
  '/backoffice/lab',
  '/backoffice/lab/tokens',
  '/backoffice/lab/components',
  '/backoffice/lab/forms',
  '/backoffice/lab/workspace',
  '/backoffice/lab/states',
  '/backoffice/help/tours',
  '/backoffice/help/tours/GLOBAL-TOUR-001/text',
  '/backoffice/help/practice',
  '/backoffice/global/profile--preferences',
  '/backoffice/global/accessibility-preferences',
  '/backoffice/settings/onboarding',
  '/backoffice/global/quick-create',
  '/backoffice/global/notifications',
  '/backoffice/global/context-help',
  '/backoffice/crm/sales-home',
  '/backoffice/crm/leads-list?status=qualified',
  '/backoffice/crm/lead-360-workspace?record=led_0033',
  '/backoffice/crm/lead-360-workspace?record=led_0033&tab=activity',
  '/backoffice/crm/lead-360-workspace?record=led_0033&tab=units',
  '/backoffice/more',
  '/backoffice/no-such-page',
];

const CUSTOMER_ROUTES = [
  '/customer/portal/home',
  '/customer/portal/payments-dashboard',
  '/customer/portal/upload-proof-mock',
  '/customer/portal/receipt?record=rcp_14',
  '/customer/portal/construction-updates',
  '/customer/portal/services-home',
  '/customer/portal/services-home?tab=visitors',
  '/customer/portal/documents',
  '/customer/portal/lab',
  '/customer/portal/accessibility-preferences',
];

async function expectClean(page: Page, label: string, testInfo: TestInfo) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test.describe(`axe ${locale} ${vp}`, () => {
      test.use({ viewport: VIEWPORTS[vp] });

      test('backoffice routes', async ({ page }, testInfo) => {
        // 23 axe scans: 100–133 s with four workers after D.1 grew the accessibility hub; one full run under load passed 180 s.
        test.setTimeout(300_000);
        await seed(page, { persona: 'sales', locale });
        for (const route of BACKOFFICE_ROUTES) {
          await page.goto(`${BO}${route}`);
          await waitForApp(page);
          await page.waitForLoadState('networkidle');
          await expectClean(page, `${locale}-${vp}-${route}`, testInfo);
        }
      });

      test('customer routes', async ({ page }, testInfo) => {
        // 10 axe scans, the accessibility hub the largest (about 10 s): 37–66 s with four workers, so the 60 s default had no headroom.
        test.setTimeout(150_000);
        await seed(page, { persona: 'resident', locale, app: 'customer' });
        for (const route of CUSTOMER_ROUTES) {
          await page.goto(`${CU}${route}`);
          await waitForApp(page);
          await expectClean(page, `${locale}-${vp}-${route}`, testInfo);
        }
      });

      test('overlays: sign-in, welcome, tour steps, palette, drawer, validation summary', async ({ page }, testInfo) => {
        // 19 axe scans: about 106 s on an idle machine, so 120 s left too little headroom under load.
        test.setTimeout(240_000);
        await seed(page, { persona: null, locale, onboarding: 'fresh' });
        await page.goto(`${BO}/backoffice/sign-in?next=/backoffice/lab`);
        await expect(page.getByTestId('sign-in-sales')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-sign-in`, testInfo);

        await page.getByTestId('sign-in-sales').click();
        await expect(page.getByTestId('welcome-start')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-welcome`, testInfo);

        await page.getByTestId('welcome-start').click();
        for (let i = 0; i < 9; i++) {
          await expect(page.getByTestId('tour-card')).toBeVisible();
          await page.waitForTimeout(350);
          await expectClean(page, `${locale}-${vp}-tour-step-${i + 1}`, testInfo);
          await page.getByTestId('tour-next').click();
        }
        await expect(page.getByTestId('tour-completion')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-tour-complete`, testInfo);
        await page.keyboard.press('Escape');

        await page.locator('[data-tour-id="command-search"]:visible').click();
        await page.keyboard.type(locale === 'ur-PK' ? 'LD-2026' : 'Ay');
        await page.waitForTimeout(600);
        await expectClean(page, `${locale}-${vp}-palette`, testInfo);
        await page.keyboard.press('Escape');

        await page.goto(`${BO}/backoffice/lab/components`);
        await page.getByTestId('open-drawer').click();
        await expectClean(page, `${locale}-${vp}-drawer`, testInfo);
        await page.keyboard.press('Escape');

        await page.goto(`${BO}/backoffice/lab/forms`);
        await page.getByTestId('lab-form-submit').click();
        await expect(page.getByTestId('validation-summary')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-form-errors`, testInfo);

        // Stage 1.5R CRM overlays: new lead (with errors), schedule visit, simulated call, unit quick view.
        await page.goto(`${BO}/backoffice/crm/sales-home?drawer=new-lead`);
        await expect(page.getByTestId('new-lead-drawer')).toBeVisible();
        await page.getByTestId('new-lead-submit').click();
        await expect(page.getByTestId('validation-summary')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-new-lead-errors`, testInfo);
        await page.goto(`${BO}/backoffice/crm/sales-home?drawer=schedule-visit`);
        await expect(page.getByTestId('schedule-visit-drawer')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-schedule-visit`, testInfo);
        await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
        await page.getByTestId('lead-contact').getByRole('button').first().click();
        await expect(page.getByTestId('contact-sheet')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-contact-sheet`, testInfo);
        await page.keyboard.press('Escape');
        await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033&tab=units`);
        await page.getByTestId('matched-unit-open').first().click();
        await expect(page.getByTestId('unit-quick-view')).toBeVisible();
        await page.waitForTimeout(500);
        await expectClean(page, `${locale}-${vp}-unit-quick-view`, testInfo);
      });
    });
  }
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`dashboard (${locale}): every role, data tables open, last action tab, next project`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    for (const persona of ['manager', 'finance'] as const) {
      const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await context.newPage();
      await seed(page, { persona, locale });
      await page.goto(`${BO}/backoffice/home/role-aware-dashboard`);
      await waitForApp(page);
      await page.waitForLoadState('networkidle');
      await expectClean(page, `dashboard-${locale}-${persona}`, testInfo);
      for (const id of ['collections-chart', 'inventory-chart', 'funnel-chart']) {
        const toggle = page.getByTestId(`${id}-table-toggle`);
        if (await toggle.count()) await toggle.click();
      }
      await page.getByTestId('attention-tabs').getByRole('tab').last().click();
      await page.getByTestId('showcase-next').click();
      await page.waitForTimeout(800);
      await expectClean(page, `dashboard-${locale}-${persona}-tables-tabs`, testInfo);
      await context.close();
    }
  });
}

test('high-contrast preference still passes', async ({ page }, testInfo) => {
  await seed(page, { a11y: { motion: 'system', contrast: 'more', sound: false, textOnlyGuide: false } });
  await page.goto(`${BO}/backoffice/lab/components`);
  await waitForApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  await expectClean(page, 'high-contrast-components', testInfo);
  await page.goto(`${BO}/backoffice/home/role-aware-dashboard`);
  await waitForApp(page);
  await page.waitForLoadState('networkidle');
  await expectClean(page, 'high-contrast-dashboard', testInfo);
});

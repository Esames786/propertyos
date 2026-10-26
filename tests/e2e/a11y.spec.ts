import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, seed, test, waitForApp, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * axe-core WCAG 2.0/2.1/2.2 A+AA scans of every Stage 1 route in both languages at desktop and
 * phone width, plus open overlays and tour steps. Zero violations is the bar.
 */
const BACKOFFICE_ROUTES = [
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
  '/backoffice/no-such-page',
];

const CUSTOMER_ROUTES = ['/customer/portal/lab', '/customer/portal/accessibility-preferences', '/customer/portal/payments-dashboard'];

async function expectClean(page: Page, label: string, testInfo: TestInfo) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test.describe(`axe ${locale} ${vp}`, () => {
      test.use({ viewport: VIEWPORTS[vp] });

      test('backoffice routes', async ({ page }, testInfo) => {
        test.setTimeout(180_000);
        await seed(page, { persona: 'sales', locale });
        for (const route of BACKOFFICE_ROUTES) {
          await page.goto(`${BO}${route}`);
          await waitForApp(page);
          await page.waitForLoadState('networkidle');
          await expectClean(page, `${locale}-${vp}-${route}`, testInfo);
        }
      });

      test('customer routes', async ({ page }, testInfo) => {
        await seed(page, { persona: 'resident', locale, app: 'customer' });
        for (const route of CUSTOMER_ROUTES) {
          await page.goto(`${CU}${route}`);
          await waitForApp(page);
          await expectClean(page, `${locale}-${vp}-${route}`, testInfo);
        }
      });

      test('overlays: sign-in, welcome, tour steps, palette, drawer, validation summary', async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        await seed(page, { persona: null, locale, onboarding: 'fresh' });
        await page.goto(`${BO}/backoffice/lab`);
        await expect(page.getByTestId('sign-in-sales')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-sign-in`, testInfo);

        await page.getByTestId('sign-in-sales').click();
        await expect(page.getByTestId('welcome-start')).toBeVisible();
        await expectClean(page, `${locale}-${vp}-welcome`, testInfo);

        await page.getByTestId('welcome-start').click();
        for (let i = 0; i < 6; i++) {
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
      });
    });
  }
}

test('high-contrast preference still passes', async ({ page }, testInfo) => {
  await seed(page, { a11y: { motion: 'system', contrast: 'more', sound: false, textOnlyGuide: false } });
  await page.goto(`${BO}/backoffice/lab/components`);
  await waitForApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  await expectClean(page, 'high-contrast-components', testInfo);
});

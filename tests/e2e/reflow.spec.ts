import { BO, CU, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/** WCAG 1.4.10 reflow (320 CSS px) and 200 % zoom (half the CSS viewport): no page-level horizontal scroll. */
const ROUTES = [
  '/backoffice/home/role-aware-dashboard',
  '/backoffice/crm/sales-home',
  '/backoffice/crm/leads-list',
  '/backoffice/crm/lead-360-workspace?record=led_0033',
  '/backoffice/more',
  '/backoffice/lab',
  '/backoffice/lab/forms',
  '/backoffice/lab/workspace',
  '/backoffice/lab/components',
  '/backoffice/help/tours',
  '/backoffice/global/profile--preferences',
];

for (const [name, viewport] of [
  ['320 px reflow', VIEWPORTS.reflow],
  ['200 % zoom', VIEWPORTS.zoom200],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    for (const locale of ['en-PK', 'ur-PK'] as const) {
      test(`no horizontal page scroll (${locale})`, async ({ page }) => {
        await seed(page, { persona: 'sales', locale });
        for (const route of ROUTES) {
          await page.goto(`${BO}${route}`);
          await waitForApp(page);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
        }
        await page.goto(`${CU}/customer/portal/lab`);
        await page.evaluate(() => {
          localStorage.setItem('demo:session:customer', JSON.stringify({ personaId: 'resident', projectId: 'all' }));
        });
        await page.reload();
        await waitForApp(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      });
    }

    test('header actions and tour controls stay reachable', async ({ page }) => {
      await seed(page, { persona: 'sales', onboarding: 'fresh' });
      await page.goto(`${BO}/backoffice/lab`);
      // Both sizes are phone layouts (< 768 px): Quick create is the bottom bar's centre button.
      for (const id of ['command-search', 'quick-create-fab', 'global-help']) {
        await expect(page.locator(`[data-tour-id="${id}"]:visible`)).toBeInViewport();
      }
      await page.getByTestId('welcome-start').click();
      for (let i = 0; i < 5; i++) {
        await expect(page.getByTestId('tour-next')).toBeInViewport();
        await expect(page.getByTestId('tour-skip')).toBeInViewport();
        await page.getByTestId('tour-next').click();
      }
    });
  });
}

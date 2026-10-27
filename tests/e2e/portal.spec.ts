import { scanA11y } from '../support/axe';
import { CU, expect, seed, test, waitForApp, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Customer portal (Stage 1.5R slice D): home, payments, proof upload, the pay-online simulation,
 * services, Urdu RTL, the phone bottom bar and PORTAL-TOUR-001. Rule under test throughout: proof
 * or a simulated payment ends at "Awaiting verification" and is never shown as Paid.
 */

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.describe('Customer portal', () => {
  test('home shows the property, the next instalment, receipts and construction', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal`);
    await expect(page).toHaveURL(/\/customer\/portal\/home$/);
    const hero = page.getByTestId('portal-hero');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Usman Tariq');
    await expect(hero.getByTestId('hero-unit')).toContainText('LH-A-0101');
    await expect(hero.getByTestId('hero-owner')).toHaveText('Owner');
    await expect(hero).toContainText('Illustrative image');
    const next = page.getByTestId('next-instalment');
    await expect(next).toContainText('Instalment 16 of 36');
    await expect(next.getByTestId('next-amount')).toContainText('804,500.00');
    await expect(next).toHaveAttribute('data-status', 'due');
    await expect(page.getByTestId('portal-attention')).toContainText('instalment 15');
    await expect(page.getByTestId('portal-receipts').getByRole('article')).toHaveCount(3);
    await expect(page.getByTestId('portal-construction')).toContainText('64%');
    await expect(page.getByTestId('metric-paid')).toContainText('Paid to date');
    // Every quick action leads to a working screen (no planned placeholders from the home page).
    for (const id of ['quick-pay', 'quick-upload', 'quick-receipts', 'quick-maintenance', 'quick-visitor', 'quick-documents', 'quick-construction']) {
      await page.getByTestId(id).click();
      // Pages are code-split: wait for the navigation to land before judging (or leaving) the page.
      await expect(page).not.toHaveURL(/\/customer\/portal\/home$/);
      await expect(page.getByTestId('portal-hero')).toHaveCount(0);
      await waitForApp(page);
      await expect(page.getByTestId('planned-screen'), id).toHaveCount(0);
      await expect(page.getByTestId('state-not-found'), id).toHaveCount(0);
      await page.goBack();
      await expect(page.getByTestId('portal-hero')).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('upload proof → "Awaiting verification" on payments and home, never Paid', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal/home`);
    await page.getByTestId('next-upload').click();
    await expect(page).toHaveURL(/upload-proof-mock\?record=ins_16&mode=upload$/);
    await expect(page.getByTestId('pay-amount')).toContainText('804,500.00');
    await page.getByLabel('Bank reference or cheque number').fill('FT26 1234 5678');
    await page.locator('input[type="file"]').setInputFiles({ name: 'transfer-slip.png', mimeType: 'image/png', buffer: PNG_1PX });
    // Scoped to the form: the hidden live region also says the file name once it is chosen.
    await expect(page.getByTestId('proof-form').getByText('transfer-slip.png')).toBeVisible();
    await page.getByTestId('proof-submit').click();

    const done = page.getByTestId('pay-done');
    await expect(done).toHaveAttribute('data-status', 'awaiting_verification');
    await expect(done.getByRole('heading', { name: 'Awaiting verification' })).toBeFocused();
    await expect(done).not.toContainText(/\bPaid\b/);

    await page.getByTestId('done-payments').click();
    await expect(page).toHaveURL(/payments-dashboard\?status=awaiting$/);
    const card = page.getByTestId('instalment-ins_16');
    await expect(card).toContainText('Awaiting verification');
    await expect(card).toContainText('Finance is verifying');
    await expect(card).not.toContainText(/\bPaid\b/);
    // Verified totals are unchanged; the amount moves to "Awaiting verification".
    await expect(page.getByTestId('summary-paid')).toContainText('14,481,000.00');
    await expect(page.getByTestId('summary-awaiting')).toContainText('804,500.00');
    await page.getByTestId('payments-filter-paid').click();
    await expect(page.getByTestId('instalment-ins_16')).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Portal navigation' }).getByRole('link', { name: 'Home' }).click();
    const next = page.getByTestId('next-instalment');
    await expect(next).toHaveAttribute('data-status', 'awaiting_verification');
    await expect(next).toContainText('Awaiting verification');
    await expect(next).not.toContainText(/\bPaid\b/);
    expect(consoleErrors).toEqual([]);
  });

  test('phone: floating bottom bar with four items and a raised centre Pay action (simulation ends unpaid)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal/home`);
    const nav = page.getByRole('navigation', { name: 'Portal navigation' }).locator('visible=true');
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Payments', 'Pay', 'Progress', 'Services']);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeGreaterThan(VIEWPORTS.phone.height - 24);
    // The centre circle rises above the bar.
    const circle = (await page.getByTestId('portal-centre-action').locator('span').first().boundingBox())!;
    expect(circle.y).toBeLessThan(navBox.y);
    for (const link of await nav.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.getByTestId('portal-centre-action').click();
    await expect(page).toHaveURL(/upload-proof-mock$/);
    await expect(page.getByTestId('portal-centre-action')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('pay-instalment')).toContainText('Instalment 16 of 36');
    await page.getByTestId('pay-mode-online').click();
    const sim = page.getByTestId('online-simulation');
    await expect(sim).toContainText('Simulation: no payment gateway is contacted');
    await page.getByTestId('online-submit').click();
    const done = page.getByTestId('pay-done');
    await expect(done).toHaveAttribute('data-status', 'awaiting_verification');
    await expect(done).toContainText('Nothing was charged');
    await expect(done).not.toContainText(/\bPaid\b/);
  });

  test('a new maintenance request appears at the top of the list', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal/home`);
    await page.getByTestId('quick-maintenance').click();
    const drawer = page.getByTestId('request-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /What needs fixing/ }).click();
    await page.getByRole('option', { name: 'Electrical' }).click();
    await drawer.getByLabel('Describe the problem').fill('Kitchen socket sparks when a plug goes in.');
    await page.getByTestId('request-submit').click();
    await expect(drawer).toBeHidden();
    const first = page.locator('[data-testid^="request-srq"]').first();
    await expect(first).toContainText('Kitchen socket sparks when a plug goes in.');
    await expect(first).toContainText('Electrical');
    await expect(first).toContainText('Sent');
    await expect(page.getByText(/sent to the facilities team/).first()).toBeAttached();
    expect(consoleErrors).toEqual([]);
  });

  test('a new visitor pass shows a gate code', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal/services-home?tab=visitors&new=1`);
    const drawer = page.getByTestId('pass-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel("Visitor's name").fill('Ali Raza');
    await drawer.getByRole('spinbutton').first().click();
    await page.keyboard.type('15012027');
    await page.getByTestId('pass-submit').click();
    await expect(drawer).toBeHidden();
    const first = page.locator('[data-testid^="pass-vps"]').first();
    await expect(first).toContainText('Ali Raza');
    await expect(first).toContainText('Active');
    await expect(first.getByTestId('pass-code')).toHaveText(/^LKS-\d{4}$/);
    await expect(first.getByTestId('pass-code')).toHaveAttribute('dir', 'ltr');
    expect(consoleErrors).toEqual([]);
  });

  test('Urdu renders right-to-left with bidi-isolated amounts and references', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'resident', app: 'customer', locale: 'ur-PK' });
    await page.goto(`${CU}/customer/portal/home`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('next-instalment')).toContainText('اگلی قسط');
    await expect(page.getByTestId('next-amount').locator('[data-amount]')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('hero-unit').locator('bdi')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('navigation', { name: 'پورٹل نیویگیشن' }).locator('visible=true')).toBeVisible();
    // The rail sits on the inline start, which is the right edge in RTL.
    const rail = (await page.getByRole('navigation', { name: 'پورٹل نیویگیشن' }).locator('visible=true').boundingBox())!;
    expect(rail.x).toBeGreaterThan(VIEWPORTS.desktop.width / 2);
    await page.goto(`${CU}/customer/portal/payments-dashboard`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ادائیگیاں');
    await expect(page.getByTestId('instalment-ins_15')).toContainText('مزید معلومات درکار');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });

  test('PORTAL-TOUR-001: the first step spotlights the property hero', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer', onboarding: 'fresh' });
    await page.goto(`${CU}/customer/portal/home`);
    await page.getByTestId('welcome-start').click();
    const card = page.getByTestId('tour-card');
    await expect(card).toHaveAttribute('data-step-id', 'hero');
    await expect(card.getByRole('heading', { name: 'This is your property' })).toBeVisible();
    const spot = page.getByTestId('tour-spotlight');
    await expect(spot).toBeVisible();
    await expect
      .poll(async () => {
        const s = (await spot.boundingBox())!;
        const h = (await page.getByTestId('portal-hero').boundingBox())!;
        return s.x <= h.x && s.y <= h.y + 1 && s.x + s.width >= h.x + h.width && s.y + s.height >= h.y + h.height - 1;
      })
      .toBe(true);
    await page.getByTestId('tour-next').click();
    await expect(card).toHaveAttribute('data-step-id', 'nextInstalment');
  });

  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const vp of ['desktop', 'phone'] as const) {
      test(`axe: portal routes have no WCAG A/AA violations (${locale}, ${vp})`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        await page.setViewportSize(VIEWPORTS[vp]);
        await seed(page, { persona: 'resident', app: 'customer', locale });
        for (const route of [
          '/customer/portal/home',
          '/customer/portal/payments-dashboard?status=all',
          '/customer/portal/upload-proof-mock',
          '/customer/portal/upload-proof-mock?mode=online',
          '/customer/portal/receipt?record=rcp_14',
          '/customer/portal/construction-updates',
          '/customer/portal/services-home',
          '/customer/portal/services-home?tab=visitors',
          '/customer/portal/documents',
        ]) {
          await page.goto(`${CU}${route}`);
          await waitForApp(page);
          await page.waitForTimeout(1200); // let entrance animations settle (contrast is checked on final colours)
          const { violations } = await scanA11y(page, testInfo, `${locale}-${vp}-${route}`);
          expect(violations, `${route}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
        }
      });
    }
  }
});

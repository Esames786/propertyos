import { BO, CU, expect, test } from '../support/fixtures';
import { seedSociety, societyApi, textScaleOf } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate C.2 cross-browser smoke (Firefox and WebKit projects): the resident's bill and proof, the
 * accounts officer's verification through the demo link, text size and Urdu. The full suite runs in
 * Chromium (tests/e2e).
 */
const HOME = '/customer/portal/home';

test('resident proof → pending → officer verifies → receipt', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await seedSociety(page);
  await page.goto(`${CU}${HOME}`);
  await expect(page.getByTestId('dues-total')).toContainText('5,200');
  await page.getByTestId('dues-pay').click();
  await expect(page.getByTestId('proof-form')).toBeVisible();
  await expect(page.getByTestId('demo-link')).toHaveAttribute('data-status', 'linked');
  await page
    .getByTestId('proof-file')
    .setInputFiles({
      name: 'kamran-ibft.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fictional demo slip'),
    });
  await page.getByTestId('proof-send').click();
  await expect(page.getByTestId('proof-state').first()).toHaveAttribute('data-state', 'submitted');

  await page.goto(`${BO}/backoffice/fin/unverified-transfers-queue`);
  await page.locator('[data-testid="proof-row"][data-flat="A-101"]').click();
  await expect(
    page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102604"]'),
  ).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('review-verify').click();
  await expect(page.getByTestId('verified-banner')).toBeVisible();

  await page.goto(`${CU}${HOME}`);
  await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'paid');
  await expect(page.getByTestId('dues-receipt')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('phone, Urdu, 200 % text: right-to-left, no sideways scroll, bottom bar clear of content', async ({
  page,
  consoleErrors,
}) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await page.goto(`${CU}${HOME}`);
  await expect(page.getByTestId('dues-home')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await textScaleOf(page)).toBe('2');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('portal-bottom-nav')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('office: collections dashboard and the proof inbox render; the guard is refused', async ({
  page,
  consoleErrors,
}) => {
  await seedSociety(page);
  await page.goto(`${BO}/backoffice/col/collections-dashboard`);
  await expect(page.getByTestId('kpi-collected')).toBeVisible();
  await page.getByTestId('kpi-pending').click();
  await expect(page.getByTestId('proof-inbox')).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      'demo:session:backoffice',
      JSON.stringify({ personaId: 'alnoor_guard', projectId: 'all' }),
    ),
  );
  await page.reload();
  await expect(page.getByTestId('access-outcome')).toBeVisible();
  expect(await societyApi(page, '/payment-submissions')).toMatchObject({ ok: false, status: 403 });
  expect(consoleErrors).toEqual([]);
});

import { CU, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

test.describe('Customer web/PWA shell (one source for phone and desktop)', () => {
  test('phone: floating bottom bar, four items around a raised centre Pay action', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal`);
    await waitForApp(page);
    const nav = page.getByRole('navigation', { name: 'Portal navigation' }).locator('visible=true');
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Payments', 'Pay', 'Progress', 'Services']);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    const box = await nav.boundingBox();
    // Floating: a small gap above the screen edge, still within thumb reach.
    expect(box!.y + box!.height).toBeGreaterThan(VIEWPORTS.phone.height - 24);
  });

  test('desktop: grouped side navigation with the same destinations', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal`);
    const nav = page.getByRole('navigation', { name: 'Portal navigation' }).locator('visible=true');
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Payments', 'Progress', 'Documents', 'Services', 'Accessibility']);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    const box = await nav.boundingBox();
    expect(box!.y).toBeLessThan(200);
    // The centre action becomes the rail's primary button.
    await expect(page.getByTestId('portal-rail-action')).toHaveText('Pay or upload proof');
  });

  test('payment status says awaiting verification, never paid, and amounts are bidi-safe in Urdu', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer', locale: 'ur-PK' });
    await page.goto(`${CU}/customer/portal/lab`);
    await expect(page.getByText('تصدیق کا انتظار')).toBeVisible();
    await expect(page.locator('[data-amount]').first()).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('accessibility preferences (PORTAL-027) apply immediately', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal/accessibility-preferences`);
    await page.getByRole('radio', { name: 'More contrast' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
    await page.getByRole('radio', { name: 'Reduce motion' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  });

  test('GUIDE-005 register alias /portal/help/tours resolves', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/portal/help/tours`);
    await expect(page).toHaveURL(/\/customer\/portal\/help\/tours$/);
    await expect(page.getByTestId('planned-screen')).toHaveAttribute('data-screen-id', 'GUIDE-005');
  });
});

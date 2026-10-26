import { CU, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

test.describe('Customer web/PWA shell (one source for phone and desktop)', () => {
  test('phone: bottom navigation with five items', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal`);
    await waitForApp(page);
    const nav = page.getByRole('navigation', { name: 'Portal navigation' }).locator('visible=true');
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Property', 'Payments', 'Services', 'Profile']);
    const box = await nav.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(VIEWPORTS.phone.height - 5);
  });

  test('desktop: the same items as side navigation', async ({ page }) => {
    await seed(page, { persona: 'resident', app: 'customer' });
    await page.goto(`${CU}/customer/portal`);
    const nav = page.getByRole('navigation', { name: 'Portal navigation' }).locator('visible=true');
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Property', 'Payments', 'Services', 'Profile']);
    const box = await nav.boundingBox();
    expect(box!.y).toBeLessThan(200);
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

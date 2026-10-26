import { BO, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

test.describe('Backoffice shell', () => {
  test('landmarks, one H1, and a working skip link', async ({ page, consoleErrors }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test('client-side navigation moves focus to the new page heading and sets the title', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    await page.getByRole('link', { name: /Tokens and typography/ }).click();
    await expect(page.locator('main h1')).toHaveText('Tokens and typography');
    await expect(page.locator('main h1')).toBeFocused();
    await expect(page).toHaveTitle(/Tokens and typography · Backoffice/);
  });

  test('sidebar collapses to icons with names and remembers the choice', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    const toggle = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  });

  test('phone: the sidebar becomes a menu sheet with focus trapped and returned', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    await expect(page.locator('aside')).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await menuButton.click();
    const sheet = page.getByTestId('mobile-nav');
    await expect(sheet).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await sheet.getByRole('link', { name: 'Design system lab' }).click();
    await expect(sheet).toBeHidden();
  });

  test('breadcrumbs are real links with the current page marked', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/forms`);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Design system lab' })).toHaveAttribute('href', '/backoffice/lab');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Forms');
  });

  test('register routes that are not built yet show an intentional planned page', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/fin/invoice-workspace?record=inv_0002`);
    const planned = page.getByTestId('planned-screen');
    await expect(planned).toHaveAttribute('data-screen-id', 'FIN-003');
    await expect(page.locator('main h1')).toHaveText('Invoice workspace');
    await expect(page.locator('main h1')).toHaveAttribute('lang', 'en');
    await expect(planned).toContainText('inv_0002');
  });

  test('unknown addresses show not-found with a way back', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/does-not-exist`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    await page.getByRole('link', { name: 'Go to start page' }).click();
    await expect(page).toHaveURL(/\/backoffice\/home\/role-aware-dashboard$/);
  });
});

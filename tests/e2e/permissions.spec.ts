import { BO, expect, seed, test } from '../support/fixtures';

const navNames = async (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main navigation' }).first().getByRole('link').allInnerTexts();

test.describe('Permission-aware UI with demo personas (J9)', () => {
  test('Sales sees sales areas only, one project, and practice quick-create', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/lab`);
    const nav = await navNames(page);
    expect(nav).toEqual(expect.arrayContaining(['Home', 'Sales', 'Projects', 'Customers']));
    expect(nav).not.toContain('Finance');
    expect(nav).not.toContain('Administration');

    await page.locator('[data-tour-id="project-switcher"]:visible').click();
    await expect(page.getByRole('option')).toHaveText(['All projects', 'Larkspur Heights']);
    await page.keyboard.press('Escape');

    await page.locator('[data-tour-id="quick-create"]:visible').click();
    await expect(page.getByTestId('quick-create-practice-lead')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Receive payment/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Schedule site visit/ })).toHaveAttribute('aria-disabled', 'true');
  });

  test('Finance sees finance areas and not Sales', async ({ page }) => {
    await seed(page, { persona: 'finance' });
    await page.goto(`${BO}/backoffice/lab`);
    const nav = await navNames(page);
    expect(nav).toEqual(expect.arrayContaining(['Finance', 'Reports', 'Customers']));
    expect(nav).not.toContain('Sales');
    await page.locator('[data-tour-id="quick-create"]:visible').click();
    await expect(page.getByTestId('quick-create-practice-lead')).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Receive payment/ })).toBeVisible();
  });

  test('the workspace record is refused for a persona without lead access', async ({ page }) => {
    await seed(page, { persona: 'finance' });
    await page.goto(`${BO}/backoffice/lab/workspace`);
    await expect(page.getByTestId('state-forbidden')).toContainText('Finance officer');
  });

  test('switching identity changes the session and shows that persona’s first-login welcome', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/lab`);
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('switch-identity').click();
    await page.getByTestId('sign-in-sales').click();
    await expect(page.getByRole('dialog', { name: /Welcome, Bilal Ahmed/ })).toBeVisible();
  });
});

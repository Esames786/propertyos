import { BO, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

test.describe('Ctrl+K command palette', () => {
  test('opens with Ctrl+K, searches records/screens/actions and navigates by keyboard', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('LH-A-12');
    await expect(palette.getByTestId('palette-record-unit').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/backoffice\/inv\/unit-360-workspace\?record=unt_lh_a_12/);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
  });

  test('works with the Urdu interface (physical key, not character)', async ({ page }) => {
    await seed(page, { locale: 'ur-PK' });
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'تلاش' })).toBeVisible();
  });

  test('scope: Sales never sees invoices; Finance does (J9)', async ({ page, browser }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('INV-2026');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('palette-record-invoice')).toHaveCount(0);

    const finance = await browser.newPage();
    await seed(finance, { persona: 'finance' });
    await finance.goto(`${BO}/backoffice/lab`);
    await waitForApp(finance);
    await finance.keyboard.press('Control+k');
    await finance.keyboard.type('INV-2026');
    await expect(finance.getByTestId('palette-record-invoice').first()).toBeVisible();
    await finance.close();
  });

  test('scope: Sales cannot find records from a project outside their scope', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('LG-P1');
    await page.waitForTimeout(600);
    await expect(page.locator('[data-testid^="palette-record-"]')).toHaveCount(0);
  });

  test('actions run from the palette (switch language)', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Switch language');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('phone: the Search button opens a full-screen palette', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page);
    await page.goto(`${BO}/backoffice/lab`);
    await page.getByTestId('search-button').click();
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    const box = await palette.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(VIEWPORTS.phone.width - 1);
  });

  test('GLOBAL-001 register URL opens the palette over the start page', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/global/command-palette`);
    await expect(page.getByTestId('command-palette')).toBeVisible();
  });
});

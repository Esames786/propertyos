import { BO, expect, seed, test } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

test.describe('Dialogs, drawers and messages', () => {
  test('drawer traps focus, closes on Escape and returns focus to its opener', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    const opener = page.getByTestId('open-drawer');
    await opener.click();
    const drawer = page.getByTestId('demo-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Unit LH-A-1204' })).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('drawer becomes a full-width sheet on phones', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    await page.getByTestId('open-drawer').click();
    const box = await page.getByTestId('demo-drawer').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(VIEWPORTS.phone.width - 1);
  });

  test('confirmation states the exact effect and requires a reason', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    await page.getByTestId('open-confirm').click();
    const dialog = page.getByRole('alertdialog', { name: 'Release hold on LH-A-1204?' });
    await expect(dialog).toContainText('The unit becomes available to other customers immediately.');
    await dialog.getByRole('button', { name: 'Release hold' }).click();
    await expect(dialog).toContainText('This field is required.');
    await dialog.getByRole('textbox', { name: /Reason for releasing/ }).fill('Customer withdrew');
    await dialog.getByRole('button', { name: 'Release hold' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('toast-success')).toContainText('released (demo)');
  });

  test('toasts are announced: success politely, errors assertively, with a reference', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    await page.getByTestId('show-toast-success').click();
    await expect(page.getByTestId('live-polite')).toContainText('Visit for LD-2026-00001 scheduled (demo). Reference LD-2026-00001');
    await page.getByTestId('show-toast-error').click();
    await expect(page.getByTestId('live-assertive')).toContainText("The visit couldn't be scheduled. Nothing was changed.");
    await expect(page.locator('[data-testid="toast-error"]').last()).toBeVisible();
  });

  test('a button with local loading blocks duplicate submits and keeps its label', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    const save = page.getByTestId('save-with-loading');
    await save.click();
    await expect(save).toHaveAttribute('data-pending', 'true');
    await expect(save).toContainText('Save with loading state');
    await save.click({ force: true });
    await expect(page.locator('[data-testid="toast-success"]')).toHaveCount(1);
  });

  test('the workspace related drawer links to connected records', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/lab/workspace`);
    await page.getByTestId('open-related').click();
    const related = page.getByTestId('related-drawer');
    await expect(related.getByRole('link')).toHaveCount(3);
    await related.getByRole('link', { name: /LH-A-1204/ }).click();
    await expect(page.getByTestId('planned-screen')).toHaveAttribute('data-screen-id', 'INV-003');
  });
});

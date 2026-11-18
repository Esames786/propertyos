import type { Locator, Page } from '@playwright/test';
import { BO, expect, test } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { seedPrincipal } from '../support/e3-pricing';
import { drawerSaved, EDITORS, HEIGHTS_UNIT, main, SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 local validation (Issue #33): keyboard-only journeys with the test-only pricing principal, in light
 * and dark: every stop draws a solid focus ring of at least 2 px; after a save keyboard focus lands on the
 * confirmation (the form disables itself while it loads the saved draft, which used to drop focus to the page
 * body); in INV-007 Escape then closes the drawer and focus returns to the unit card it was opened from.
 */
/** Keyboard focus is really drawn on the control: solid, at least 2 px. */
async function expectRing(page: Page, loc: Locator, label: string) {
  const ring = await loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { focused: document.activeElement === el, visible: el.matches(':focus-visible') || el.hasAttribute('data-focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(ring, label).toMatchObject({ focused: true, visible: true, style: 'solid' });
  expect(ring.width, label).toBeGreaterThanOrEqual(2);
}

for (const theme of ['light', 'dark'] as const) {
  test(`COM-001 by keyboard only (${theme}): choose a project, name it, save; every stop shows its focus ring`, async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing', { theme });
    const e = EDITORS[0]!;
    await page.goto(`${BO}${e.path}`);
    await expect(e.project(page).locator('option')).not.toHaveCount(1);
    const project = e.project(page);
    await keyboardFocus(page, project);
    await expectRing(page, project, 'project select');
    await page.keyboard.press('ArrowDown');
    await expect(project).not.toHaveValue('');
    await page.keyboard.press('Tab');
    await expect(e.title(page)).toBeFocused();
    await expectRing(page, e.title(page), 'name');
    await page.keyboard.type('Keyboard-only plan');
    const save = page.getByTestId(e.save);
    await keyboardFocus(page, save);
    await expectRing(page, save, 'save');
    await page.keyboard.press('Enter');
    await expect(e.saved(page)).toBeVisible();
    // The form disables itself while it loads the saved draft: keyboard focus moves to the confirmation
    // instead of falling to the page body.
    await expect(e.saved(page)).toBeFocused();
    const item = e.listItems(page).first();
    await keyboardFocus(page, item);
    await expectRing(page, item, 'draft in the list');
    expect(consoleErrors).toEqual([]);
  });

  test(`INV-007 by keyboard only (${theme}): open the drawer from a unit, propose, save, Escape returns focus to the unit`, async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing', { theme });
    await page.goto(`${BO}/backoffice/inv/edit-price-drawer`);
    const unit = page.getByTestId('price-change-unit').filter({ hasText: 'LH-A-0101' });
    await keyboardFocus(page, unit);
    await expectRing(page, unit, 'unit card');
    await page.keyboard.press('Enter');
    const drawer = page.getByTestId('edit-price-change-drawer');
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`record=${HEIGHTS_UNIT}`));
    const price = page.getByTestId('price-change-proposed');
    await keyboardFocus(page, price);
    await expectRing(page, price, 'proposed price');
    await page.keyboard.type('33500000.00');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('price-change-reason')).toBeFocused();
    await page.keyboard.type('Keyboard-only illustrative proposal');
    const save = page.getByTestId('price-change-save');
    await keyboardFocus(page, save);
    await expectRing(page, save, 'save');
    await page.keyboard.press('Enter');
    await expect(drawerSaved(page)).toBeVisible();
    // Focus is on the confirmation inside the dialog (not dropped to the page body), so Escape still closes it.
    await expect(drawerSaved(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    // Focus goes back to the unit the drawer was opened from (the page re-renders it after the address changes).
    await expect(page.getByTestId('price-change-unit').filter({ hasText: 'LH-A-0101' })).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });
}

test('COM-004 by keyboard: the fee mode and unit selects, the preview button and its result are reachable', async ({ page, consoleErrors }) => {
  await seedPrincipal(page, 'res_e3qa_pricing');
  await SCREENS.find((s) => s.id === 'COM-004')!.prepare(page);
  const compute = page.getByTestId('commercial-compute');
  await keyboardFocus(page, compute);
  await expectRing(page, compute, 'preview');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('commercial-preview-result')).toBeVisible();
  const mode = main(page).getByRole('combobox', { name: 'Fee mode' }).first();
  await keyboardFocus(page, mode);
  await expectRing(page, mode, 'fee mode');
  expect(consoleErrors).toEqual([]);
});

import type { Page } from '@playwright/test';
import { BO, CU, expect, seed, test } from '../support/fixtures';
import { seedSociety, societyApi } from '../support/society';

/**
 * UX batch B2 cross-browser smoke (Firefox and WebKit projects): the flows that touch focus and
 * inputs. The palette closes on a phone by Cancel and Escape with focus returned (SH-01); a refused
 * triage and a refused close keep their drawer or dialog open with the reason inside, focused (OPS-01);
 * a Select error shows at its field (SH-04); the proof form's hidden file input is no Tab stop
 * (RES-06); a keyboard-focused tab panel draws its ring (SH-10); the calendar's month buttons are
 * named (SH-11). The full checks run in Chromium (tests/e2e/ux-b2.spec.ts).
 */
async function calm(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

async function requestId(page: Page, title: string) {
  const r = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/requests', 'GET', {}, { q: title });
  return (r.ok ? r.res.items : []).find((x) => x.title.includes(title))!.id;
}

test('SH-01: on a phone the palette closes by its Cancel and by Escape; focus returns to the search button', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await calm(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSociety(page, { staff: 'alnoor_manager' });
  await page.goto(`${BO}/backoffice`);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  const trigger = page.getByTestId('search-button');
  const palette = page.getByTestId('command-palette');
  await trigger.click();
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('OPS-01: a refused triage and a refused close show the reason inside, focused, and keep what was typed', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await calm(page);
  await seedSociety(page, { staff: 'alnoor_manager' });
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const geyser = await requestId(page, 'Geyser not heating');
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${geyser}&drawer=triage`);
  const drawer = page.getByTestId('triage-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('textarea').fill('Check the pilot light first');
  expect((await societyApi(page, `/ops/requests/${geyser}/cancel`, 'POST', { reason: 'The resident fixed it herself.' })).ok).toBe(true);
  await drawer.getByTestId('triage-submit').click();
  await expect(drawer.getByRole('alert')).toContainText('This step is not possible now');
  await expect(drawer.getByTestId('refusal-alert')).toBeFocused();
  await expect(drawer.locator('textarea')).toHaveValue('Check the pilot light first');

  const balcony = await requestId(page, 'Balcony door lock broken');
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${balcony}&drawer=close`);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('No reply');
  await dialog.getByRole('button', { name: 'Close for the resident' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Write at least 10 characters.');
  await expect(dialog.getByTestId('refusal-alert')).toBeFocused();
  await expect(dialog.getByRole('textbox')).toHaveValue('No reply');
  await dialog.getByRole('textbox').fill('No reply after three calls this week');
  await dialog.getByRole('button', { name: 'Close for the resident' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('request-workspace')).toHaveAttribute('data-state', 'closed');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('SH-04 and RES-06 (resident app): the Relationship error shows at its field; Tab passes the hidden file input', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await calm(page);
  await seedSociety(page, { resident: 'alnoor_resident_a101' });
  await page.goto(`${CU}/customer/portal/household`);
  await page.getByTestId('household-submit').click();
  const field = page.getByTestId('household-relationship');
  await expect(field).toHaveAttribute('data-invalid', 'true');
  await expect(field).toContainText('Choose an option.');

  await page.goto(`${CU}/customer/portal/upload-proof-mock`);
  await expect(page.getByTestId('proof-form')).toBeVisible();
  await expect(page.getByTestId('proof-file')).toHaveAttribute('tabindex', '-1');
  await page.getByTestId('proof-file-pick').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)).not.toBe('file');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('SH-10: a keyboard-focused tab panel draws its ring', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await calm(page);
  await seedSociety(page, { staff: 'alnoor_manager' });
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const ac = await requestId(page, 'AC drain leaking');
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${ac}&tab=timeline`);
  const panel = page.getByRole('tabpanel');
  await expect(panel).toBeVisible();
  await page.getByRole('tab', { selected: true }).focus();
  for (let i = 0; i < 3 && !(await panel.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(panel).toBeFocused();
  await expect(panel).toHaveAttribute('data-focus-visible', 'true');
  expect(await panel.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('SH-11: the calendar month buttons are named "Previous month" and "Next month"', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await calm(page);
  await seed(page, { persona: 'manager' });
  await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
  await page.getByTestId('lead-schedule-visit').click();
  const visit = page.getByTestId('schedule-visit-drawer');
  await expect(visit).toBeVisible();
  await visit.getByTestId('schedule-visit-form').getByRole('group').first().getByRole('button').last().click();
  const calendar = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
  await expect(calendar.getByRole('button', { name: 'Previous month', exact: true })).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Next month', exact: true })).toBeVisible();
  expect(appErrors(consoleErrors)).toEqual([]);
});

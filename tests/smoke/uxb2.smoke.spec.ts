import type { Locator, Page } from '@playwright/test';
import { BO, CU, expect, seed, test } from '../support/fixtures';
import { ringOf } from '../support/focus';
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

/**
 * Issue #20 (N-B2-1): keyboard focus rings are drawn in this engine too, and a mouse press draws none.
 * Each engine has its own focus-visible heuristics; the computed style, the pixels on the ring band
 * (focused against unfocused colour, at least 3:1) and the single-ring rule are checked here.
 */
test('Issue #20: keyboard focus draws one visible ring (office header, stat tile, tab, drawer choice; resident bottom bar); a mouse press draws none', async ({ page, consoleErrors }) => {
  test.setTimeout(240_000);
  await calm(page);
  await seedSociety(page, { staff: 'alnoor_manager', resident: 'alnoor_resident_a101' });
  const decoder = await page.context().newPage();
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const seepage = await requestId(page, 'Water seepage');
  const rows: string[] = [];
  const keyboard = async (label: string, loc: Locator) => {
    const r = await ringOf(page, decoder, loc.first());
    rows.push(`${label}: fv=${r.focusVisible} ${r.style} ${r.width}px, ${Math.round(r.changed3 * 100)} % ≥ 3:1, median ${r.median}, others ${r.otherRings.length}`);
    expect(r.focusVisible, label).toBe(true);
    expect(r.style, label).toBe('solid');
    expect(r.width, label).toBeGreaterThanOrEqual(2);
    expect(r.changed3, `${label}: ring pixels`).toBeGreaterThanOrEqual(0.9);
    expect(r.otherRings, `${label}: one ring`).toEqual([]);
  };
  const pointer = async (label: string, loc: Locator) => {
    const r = await ringOf(page, decoder, loc.first(), 'pointer');
    rows.push(`${label} (mouse): focused=${r.focused} fv=${r.focusVisible} ${r.style}, ${Math.round(r.changed3 * 100)} %`);
    expect(r.focusVisible, label).toBe(false);
    expect(r.changed3, `${label}: no ring pixels`).toBeLessThanOrEqual(0.1);
  };
  await page.goto(`${BO}/backoffice`);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  await keyboard('header search', page.getByTestId('search-button'));
  await keyboard('stat tile', page.getByTestId('kpi-billed'));
  await pointer('stat tile', page.getByTestId('kpi-billed'));
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${seepage}&drawer=assign`);
  await expect(page.getByTestId('assign-drawer')).toBeVisible();
  await keyboard('drawer choice', page.getByTestId('technician-option'));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('assign-drawer')).toBeHidden();
  await keyboard('tab', page.getByRole('tab', { selected: true }));
  await pointer('tab', page.getByRole('tab', { selected: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${CU}/customer/portal/home`);
  await expect(page.getByTestId('dues-home')).toBeVisible();
  await keyboard('resident bottom bar', page.getByTestId('portal-bottom-nav').getByRole('link').first());
  await test.info().attach('rings.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  expect(appErrors(consoleErrors)).toEqual([]);
});

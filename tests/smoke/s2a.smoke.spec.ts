import type { Locator, Page } from '@playwright/test';
import { BO, CU, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { become, seedSociety } from '../support/society';

/**
 * Gate S.2a cross-browser smoke (Firefox and WebKit projects): a new guard recorded and given
 * tonight's shift; On duty now (an absent guard replaced); a correction asked by the supervisor and
 * decided by the manager, never by the person it is about; the roster, On duty now and the residents'
 * "Staff on duty" at 320 px with 200 % text in Urdu. The full checks run in Chromium
 * (tests/e2e/s2a.spec.ts). The business date is Monday 26 October 2026; times are fixed per test.
 */
async function at(page: Page, time: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(`2026-10-26T${time}:00+05:00`));
}

async function go(page: Page, origin: string, path: string, ready: string) {
  await page.goto(`${origin}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function as(page: Page, app: 'backoffice' | 'customer', persona: PersonaId, path: string, ready: string) {
  await become(page, app, persona);
  await waitForApp(page);
  await go(page, app === 'backoffice' ? BO : CU, path, ready);
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

async function choose(page: Page, scope: Page | Locator, testId: string, name: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').first().click();
  await page.getByRole('option', { name }).first().click();
}

/**
 * A searchable list: type, choose the option, and check the choice was taken (the field shows the
 * option, the list closed). WebKit under load sometimes drops a click that lands while the list is
 * still filtering; the check makes that visible at the step where it happens.
 */
async function pick(page: Page, scope: Page | Locator, testId: string, typed: string, option: RegExp) {
  const input = scope.getByTestId(testId).locator('input');
  await input.fill(typed);
  const choice = page.getByRole('option', { name: option }).first();
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue(option);
}

test('a new guard: validated, refused as a duplicate, saved, given tonight\'s night shift and on the roster', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page, '21:30');
  await seedSociety(page, { staff: 'alnoor_manager' });
  await as(page, 'backoffice', 'alnoor_manager', '/backoffice/hr/new-employee', 'hr-employee-form');
  await page.getByTestId('hr-employee-save').click();
  await expect(page.getByText('Enter the full name (at least 3 letters).')).toBeVisible();
  await page.getByTestId('hr-field-name').fill('Hamza Raza');
  await page.getByTestId('hr-field-cnic').fill('35202-5521349-3');
  await page.getByTestId('hr-field-phone').fill('0300 0000299');
  await page.getByTestId('hr-field-address').fill('House 5, Street 9, Township, Lahore (Demo)');
  await pick(page, page, 'hr-field-role', 'guard', /^Security guard/);
  await page.getByTestId('hr-employee-save').click();
  await expect(page.getByTestId('hr-duplicate')).toContainText('ANR-E-002 Asif Mehmood');
  await page.getByTestId('hr-field-cnic').fill('35202-1122334-5');
  await page.getByTestId('hr-employee-save').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hamza Raza' })).toBeVisible();
  await page.getByTestId('hr-360-assign').click();
  const drawer = page.getByTestId('hr-assign-drawer');
  await choose(page, drawer, 'hr-assign-shift', /^Night/);
  await expect(drawer.getByTestId('hr-assign-window')).toContainText('(next day)');
  await drawer.getByTestId('hr-assign-save').click();
  await expect(drawer).toHaveCount(0);
  await go(page, BO, '/backoffice/hr/roster', 'hr-roster-week');
  await expect(page.locator('[data-testid="hr-roster-cell"][data-date="2026-10-26"][data-shift="night"][data-department="security"]')).toContainText('Hamza Raza');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('On duty now: the absent guard is marked and covered; the shift is no longer short', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await at(page, '15:20');
  await seedSociety(page, { staff: 'alnoor_guard' });
  await as(page, 'backoffice', 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  const evening = page.locator('[data-testid="hr-board-shift"][data-shift="evening"]');
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-absent').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /Mark absent/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('hr-board-short')).toContainText('Evening: 1 of 2');
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-replace').click();
  const drawer = page.getByTestId('hr-assign-drawer');
  await pick(page, drawer, 'hr-assign-person', 'Asif', /Asif Mehmood/);
  await drawer.getByTestId('hr-assign-save').click();
  await expect(drawer).toHaveCount(0);
  await expect(evening.locator('[data-name="Faisal Iqbal"]')).toContainText('Covered by Asif Mehmood');
  await expect(page.getByTestId('hr-board-short')).toHaveCount(0);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('corrections: the supervisor asks, the manager decides, and nobody decides their own', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await at(page, '10:00');
  await seedSociety(page, { staff: 'alnoor_guard' });
  await as(page, 'backoffice', 'alnoor_guard', '/backoffice/hr/attendance?date=2026-10-25', 'hr-attendance');
  const asif = page.locator('[data-testid="hr-attendance-row"][data-name="Asif Mehmood"]');
  await asif.getByTestId('hr-correct').click();
  const drawer = page.getByTestId('hr-correction-drawer');
  await drawer.getByTestId('hr-correction-in').fill('07:25');
  await drawer.getByTestId('hr-correction-reason').fill('The gate log shows he arrived at 07:25, not on time.');
  await drawer.getByTestId('hr-correction-save').click();
  await expect(drawer).toHaveCount(0);
  await expect(asif.getByTestId('hr-correction-pending')).toBeVisible();
  await as(page, 'backoffice', 'alnoor_manager', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows');
  await expect(page.locator('[data-testid="hr-correction-row"][data-name="Imran Qureshi"]').getByTestId('hr-correction-approve')).toHaveCount(0);
  const asked = page.locator('[data-testid="hr-correction-row"][data-name="Asif Mehmood"][data-state="pending"]');
  await asked.getByTestId('hr-correction-approve').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /^Approve$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-testid="hr-correction-row"][data-name="Asif Mehmood"][data-state="pending"]')).toHaveCount(0);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 px, 200 %, Urdu: the roster, On duty now and the residents\' staff on duty are not clipped or broken', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await at(page, '15:20');
  await page.setViewportSize({ width: 320, height: 700 });
  await seedSociety(page, { staff: 'alnoor_manager', locale: 'ur-PK', textScale: 2 });
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001');
  await as(page, 'backoffice', 'alnoor_manager', '/backoffice/hr/roster', 'hr-roster-week');
  expect(await layoutProblems(page)).toEqual([]);
  await go(page, BO, '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  expect(await layoutProblems(page)).toEqual([]);
  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/community?tab=staff', 'community-staff');
  // Nobody checked in yet: scheduled, never "on duty" (Issue #12).
  await expect(page.getByTestId('community-staff-expected')).toBeVisible();
  await expect(page.getByTestId('community-staff-confirmed')).toHaveCount(0);
  expect(await layoutProblems(page)).toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});

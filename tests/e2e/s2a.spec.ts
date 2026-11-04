import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { addSharedGuard, become, seedSociety, SHARED_GUARD, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate S.2a society staff operations through the office and resident apps, with fictional Al-Noor
 * staff: Imran (building manager, HR), Shahid (security supervisor, records attendance for security),
 * Ayesha (treasurer, approves advances), Saba (accounts officer), Rabia (committee secretary) and the
 * residents. The rules are the server's (hr.api.test.ts and hr-roster.vectors.json); these tests
 * check that the screens carry them through: the three reference flows, who sees what, both
 * languages, phones at 200 % text, dark mode with high contrast and the keyboard.
 *
 * The demo's business date is Monday 26 October 2026; times that matter are fixed per test (the
 * browser's clock) with reduced motion, so a page never waits on an entry animation.
 */
const api = societyApi;
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const OFFICE_DISPLAY: Partial<Record<PersonaId, string>> = { alnoor_manager: 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001' };

async function at(page: Page, time: string, date = '2026-10-26') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(`${date}T${time}:00+05:00`));
}

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** A select (React Aria) by its visible option name. */
async function choose(page: Page, scope: Page | Locator, testId: string, name: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').first().click();
  await page.getByRole('option', { name }).first().click();
}

/** A searchable list (combo box): type, then pick the option. */
async function pick(page: Page, scope: Page | Locator, testId: string, typed: string, option: RegExp | string) {
  await scope.getByTestId(testId).locator('input').fill(typed);
  await page.getByRole('option', { name: option }).first().click();
}

async function confirm(page: Page, button: RegExp | string, note?: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  if (note) await dialog.locator('textarea').fill(note);
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

const cell = (page: Page, date: string, shift: string, department = 'security') => page.locator(`[data-testid="hr-roster-cell"][data-date="${date}"][data-shift="${shift}"][data-department="${department}"]`);
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional demo file') });

test.describe('S.2a reference flow 1: a new employee to active duty', () => {
  test('Imran records a new guard (validated, no duplicate), assigns tonight\'s shift from Employee 360; Shahid checks him in; Employee 360 shows him on duty', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '21:30');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/hr/new-employee', 'hr-employee-form');
    // Saving an empty form explains what is missing; nothing is sent.
    await page.getByTestId('hr-employee-save').click();
    await expect(page.getByText('Enter the full name (at least 3 letters).')).toBeVisible();
    await expect(page.getByText('Enter the 13-digit CNIC number, e.g. 35202-1234567-1.')).toBeVisible();
    await page.getByTestId('hr-field-name').fill('Hamza Raza');
    await page.getByTestId('hr-field-cnic').fill('35202-5521349-3');
    await page.getByTestId('hr-field-phone').fill('0300 0000299');
    await page.getByTestId('hr-field-address').fill('House 5, Street 9, Township, Lahore (Demo)');
    await pick(page, page, 'hr-field-role', 'guard', /^Security guard/);
    await choose(page, page, 'hr-field-type', 'Contract');
    await axe(page, testInfo, 'hr-new-employee-1440-en');
    // Asif's identity card number: one person, one record.
    await page.getByTestId('hr-employee-save').click();
    await expect(page.getByTestId('hr-duplicate')).toContainText('ANR-E-002 Asif Mehmood');
    await page.getByTestId('hr-field-cnic').fill('35202-1122334-5');
    await page.getByTestId('hr-employee-save').click();
    await expect(page.getByTestId('hr-employee-360')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Hamza Raza' })).toBeVisible();
    await expect(page).toHaveURL(/tab=duty/);
    await expect(page.getByTestId('hr-360-tab-duty')).toContainText('No duty in the next 7 days');
    // His first shift: tonight's night shift, on patrol.
    await page.getByTestId('hr-360-assign').click();
    const drawer = page.getByTestId('hr-assign-drawer');
    await choose(page, drawer, 'hr-assign-shift', /^Night/);
    await expect(drawer.getByTestId('hr-assign-window')).toContainText('(next day)');
    await choose(page, drawer, 'hr-assign-post', 'Patrol');
    await axe(page, testInfo, 'hr-assign-drawer-1440-en');
    await drawer.getByTestId('hr-assign-save').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('hr-360-upcoming')).toContainText('Night');
    // He is on the roster.
    await page.goto(`${BO}/backoffice/hr/roster`);
    await expect(cell(page, '2026-10-26', 'night')).toContainText('Hamza Raza');
    // 23:04: Shahid, the security supervisor, checks him in from On duty now.
    await at(page, '23:04');
    await office(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
    const hamza = page.locator('[data-testid="hr-board-person"][data-name="Hamza Raza"]');
    await expect(hamza).toHaveAttribute('data-state', 'not_checked_in');
    await hamza.getByTestId('hr-board-check-in').click();
    await expect(hamza).toHaveAttribute('data-state', 'present');
    // Employee 360 reflects the duty and the attendance.
    await office(page, 'alnoor_manager', '/backoffice/hr/employees-list', 'hr-employee-rows');
    await page.getByTestId('hr-employee-row').filter({ hasText: 'Hamza Raza' }).click();
    await expect(page.getByTestId('hr-360-today').getByTestId('duty-state')).toHaveAttribute('data-state', 'on_duty');
    await page.getByRole('tab', { name: 'Attendance' }).click();
    await expect(page.getByTestId('hr-360-attendance').getByTestId('attendance-state').first()).toHaveAttribute('data-state', 'present');
    await axe(page, testInfo, 'hr-employee-360-attendance-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2a reference flow 2: the guards\' week', () => {
  test('warnings, pending leave asked first, a swap, a removal with its reason, publishing; next week from draft to published', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '15:20');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/hr/roster', 'hr-roster-week');
    await expect(page.getByTestId('hr-roster-week')).toHaveAttribute('data-state', 'published');
    await expect(page.getByTestId('hr-roster-warnings')).toContainText('Karim Bakhsh has asked for leave');
    await expect(cell(page, '2026-10-27', 'evening')).toHaveAttribute('data-short', 'true');
    // Day shifts do not run on Sunday: no cover is expected there.
    await expect(cell(page, '2026-11-01', 'day', 'maintenance')).toContainText('Not scheduled');
    await axe(page, testInfo, 'hr-roster-week-1440-en');
    // Karim on Saturday morning: he asked for leave that day, so the screen asks first.
    await cell(page, '2026-10-31', 'morning').getByRole('button', { name: /Add someone/ }).click();
    const drawer = page.getByTestId('hr-assign-drawer');
    await pick(page, drawer, 'hr-assign-person', 'Karim', /Karim Bakhsh/);
    await drawer.getByTestId('hr-assign-save').click();
    await expect(drawer.getByTestId('hr-assign-leave-warning')).toBeVisible();
    await drawer.getByTestId('hr-assign-anyway').click();
    await expect(drawer).toHaveCount(0);
    await expect(cell(page, '2026-10-31', 'morning')).toContainText('Leave requested');
    // Swap Asif's Tuesday morning with Nadeem's Tuesday evening.
    await cell(page, '2026-10-27', 'morning').locator('[data-testid="hr-roster-duty"][data-name="Asif Mehmood"]').click();
    const duty = page.getByTestId('hr-duty-drawer');
    await choose(page, duty, 'hr-swap-with', /Nadeem Abbas · 27 Oct 2026 · Evening/);
    await duty.getByTestId('hr-swap-save').click();
    await expect(duty).toHaveCount(0);
    await expect(cell(page, '2026-10-27', 'morning')).toContainText('Nadeem Abbas');
    await expect(cell(page, '2026-10-27', 'evening')).toContainText('Asif Mehmood');
    // Remove Zubair from Thursday night, with a reason.
    await cell(page, '2026-10-29', 'night').locator('[data-testid="hr-roster-duty"][data-name="Zubair Ahmed"]').click();
    await page.getByTestId('hr-unassign').click();
    await confirm(page, /Remove from this duty/, 'Covering the AGM security instead');
    await expect(page.getByTestId('hr-duty-drawer')).toHaveCount(0);
    await expect(cell(page, '2026-10-29', 'night')).not.toContainText('Zubair Ahmed');
    // Changes since publishing are counted, then published.
    await expect(page.getByTestId('hr-roster-published-note')).toContainText('4 changes since publishing');
    await page.getByTestId('hr-roster-publish').click();
    await confirm(page, /Publish changes/);
    await expect(page.getByTestId('hr-roster-publish')).toHaveCount(0);
    // Next week is a draft until published.
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByTestId('hr-roster-week')).toHaveAttribute('data-state', 'draft');
    await expect(page.getByTestId('hr-roster-published-note')).toContainText('staff and residents do not see this week yet');
    await page.getByTestId('hr-roster-publish').click();
    await confirm(page, /Publish week/);
    await expect(page.getByTestId('hr-roster-week')).toHaveAttribute('data-state', 'published');
    expect(consoleErrors).toEqual([]);
  });

  test('On duty now: Shahid sees who is in, marks the absent guard, brings in the suggested replacement and sees what starts next', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(150_000);
    await at(page, '15:20');
    await seedSociety(page, { staff: 'alnoor_guard' });
    await office(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
    const evening = page.locator('[data-testid="hr-board-shift"][data-shift="evening"]');
    await expect(evening.getByTestId('hr-board-person')).toHaveCount(2);
    await expect(page.getByTestId('hr-board-next')).toContainText('Karim Bakhsh (Main gate), Zubair Ahmed (Patrol)');
    await axe(page, testInfo, 'hr-on-duty-1440-en');
    await evening.locator('[data-name="Nadeem Abbas"]').getByTestId('hr-board-check-in').click();
    await expect(evening.locator('[data-name="Nadeem Abbas"]')).toHaveAttribute('data-state', 'late');
    await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-absent').click();
    await confirm(page, /Mark absent/);
    await expect(page.getByTestId('hr-board-short')).toContainText('Evening: 1 of 2');
    await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-replace').click();
    const drawer = page.getByTestId('hr-assign-drawer');
    await expect(drawer).toContainText('Cover for Faisal Iqbal');
    await drawer.getByText(/people and why/).click();
    await expect(drawer.getByTestId('hr-assign-candidates')).toContainText('Tariq Javed');
    await expect(drawer.getByTestId('hr-assign-candidates')).toContainText('On approved leave');
    await pick(page, drawer, 'hr-assign-person', 'Asif', /Asif Mehmood/);
    await drawer.getByTestId('hr-assign-save').click();
    await expect(drawer).toHaveCount(0);
    await expect(evening.locator('[data-name="Faisal Iqbal"]')).toContainText('Covered by Asif Mehmood');
    await expect(evening.locator('[data-name="Asif Mehmood"]')).toContainText('covering for Faisal Iqbal');
    await expect(page.getByTestId('hr-board-short')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2a reference flow 3: attendance corrections and leave', () => {
  test('recording and approving are separate; nobody decides their own correction or leave; approved leave becomes a roster gap', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '10:00');
    await seedSociety(page, { staff: 'alnoor_guard' });
    // Shahid records attendance and asks for a correction; he cannot decide one.
    await office(page, 'alnoor_guard', '/backoffice/hr/attendance?date=2026-10-25', 'hr-attendance');
    const asif = page.locator('[data-testid="hr-attendance-row"][data-name="Asif Mehmood"]');
    await asif.getByTestId('hr-correct').click();
    const drawer = page.getByTestId('hr-correction-drawer');
    await drawer.getByTestId('hr-correction-in').fill('07:25');
    await drawer.getByTestId('hr-correction-reason').fill('The gate log shows he arrived at 07:25, not on time.');
    await axe(page, testInfo, 'hr-correction-drawer-1440-en');
    await drawer.getByTestId('hr-correction-save').click();
    await expect(drawer).toHaveCount(0);
    await expect(asif.getByTestId('hr-correction-pending')).toBeVisible();
    await page.goto(`${BO}/backoffice/hr/leave-attendance-adjustments?tab=corrections`);
    await expect(page.getByTestId('hr-correction-row').first()).toBeVisible();
    await expect(page.getByTestId('hr-correction-approve')).toHaveCount(0);
    // Imran decides Shahid's requests, not his own.
    await office(page, 'alnoor_manager', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows');
    const own = page.locator('[data-testid="hr-correction-row"][data-name="Imran Qureshi"]');
    await expect(own.getByTestId('hr-correction-blocked')).toContainText('This is about you');
    await expect(own.getByTestId('hr-correction-approve')).toHaveCount(0);
    const zubair = page.locator('[data-testid="hr-correction-row"][data-name="Zubair Ahmed"]');
    await zubair.getByTestId('hr-correction-approve').click();
    await confirm(page, /^Approve$/);
    await expect(zubair).toHaveAttribute('data-state', 'approved');
    await axe(page, testInfo, 'hr-corrections-1440-en');
    // Leave: Karim's two nights are listed; approving makes them gaps on the roster.
    await page.getByRole('tab', { name: /^Leave/ }).click();
    const karim = page.locator('[data-testid="hr-leave-row"][data-name="Karim Bakhsh"]');
    await expect(karim.getByTestId('hr-leave-conflicts')).toContainText('2 duties on the roster');
    const imranLeave = page.locator('[data-testid="hr-leave-row"][data-name="Imran Qureshi"]');
    await expect(imranLeave.getByTestId('hr-leave-blocked')).toBeVisible();
    await karim.getByTestId('hr-leave-approve').click();
    await confirm(page, /^Approve$/);
    await page.goto(`${BO}/backoffice/hr/roster`);
    await expect(page.getByTestId('hr-roster-warnings')).toContainText('Karim Bakhsh is on approved leave');
    await expect(cell(page, '2026-10-30', 'night')).toHaveAttribute('data-short', 'true');
    // Rabia, the committee secretary, decides Imran's own correction.
    await office(page, 'alnoor_admin', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows');
    const imran = page.locator('[data-testid="hr-correction-row"][data-name="Imran Qureshi"]');
    await imran.getByTestId('hr-correction-approve').click();
    await confirm(page, /^Approve$/);
    await expect(imran).toHaveAttribute('data-state', 'approved');
    expect(consoleErrors).toEqual([]);
  });

  test('a leave request from Employee 360 says that no balance is calculated, and lists the duties it covers', async ({ page, consoleErrors }) => {
    await at(page, '10:00');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/hr/employee-360-workspace/emp_anr_003', 'hr-employee-360');
    await page.getByTestId('hr-360-request-leave').click();
    const drawer = page.getByTestId('hr-leave-drawer');
    await expect(drawer.getByTestId('hr-leave-policy')).toContainText('no balance is calculated');
    await choose(page, drawer, 'hr-leave-type', 'Sick');
    await drawer.getByTestId('hr-leave-from').fill('2026-10-27');
    await drawer.getByTestId('hr-leave-to').fill('2026-10-28');
    await drawer.getByTestId('hr-leave-reason').fill('Fever since last night.');
    await drawer.getByTestId('hr-leave-save').click();
    await expect(drawer).toHaveCount(0);
    await page.getByRole('tab', { name: 'Leave' }).click();
    await expect(page.getByTestId('hr-360-leave')).toContainText('Sick');
    await page.goto(`${BO}/backoffice/hr/leave-attendance-adjustments`);
    await expect(page.locator('[data-testid="hr-leave-row"][data-name="Zubair Ahmed"]').getByTestId('hr-leave-conflicts')).toContainText('2 duties');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2a documents, advances and loans', () => {
  test('a police verification uploaded (simulated) clears the warning; files and numbers stay with document managers', async ({ page, consoleErrors }, testInfo) => {
    await at(page, '10:00');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/hr/employee-documents', 'hr-documents');
    await expect(page.locator('[data-testid="hr-document-row"][data-name="Karim Bakhsh"][data-kind="police_verification"]')).toHaveAttribute('data-status', 'missing');
    await page.getByTestId('hr-document-add').click();
    const drawer = page.getByTestId('hr-document-drawer');
    await expect(drawer).toContainText('the file stays on your device');
    await pick(page, drawer, 'hr-document-employee', 'Karim', /Karim Bakhsh/);
    await choose(page, drawer, 'hr-document-kind', 'Police verification');
    await drawer.getByTestId('hr-document-file').setInputFiles(pdf('karim-police.pdf'));
    await drawer.getByTestId('hr-document-number').fill('PV-LHR-2026-20001');
    await drawer.getByTestId('hr-document-issued').fill('2026-10-20');
    await drawer.getByTestId('hr-document-expires').fill('2027-10-20');
    await axe(page, testInfo, 'hr-document-drawer-1440-en');
    await drawer.getByTestId('hr-document-save').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('[data-testid="hr-document-row"][data-name="Karim Bakhsh"]')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/hr/employee-360-workspace/emp_anr_004?tab=documents`);
    const row = page.getByTestId('hr-360-documents').locator('[data-kind="police_verification"]');
    await expect(row).toContainText('karim-police.pdf');
    await expect(row).toContainText('PV-L…001');
    expect(consoleErrors).toEqual([]);
  });

  test('an advance is requested with evidence and approved by the treasurer; its payment stays unverified and settlement stays read only, even after a posted voucher of the exact amount (Issue #12)', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '11:00');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/hr/employee-advances', 'hr-advances');
    await page.getByTestId('hr-advance-new').click();
    const drawer = page.getByTestId('hr-advance-request');
    await pick(page, drawer, 'hr-advance-employee', 'Rukh', /Rukhsana Bibi/);
    await drawer.getByTestId('hr-advance-amount').fill('8000');
    await drawer.getByTestId('hr-advance-instalments').fill('2');
    await drawer.getByTestId('hr-advance-reason').fill('School fees for her two children.');
    await drawer.getByTestId('hr-advance-submit').click();
    await expect(drawer.getByTestId('problem-fields')).toContainText('Attach supporting evidence.');
    await drawer.getByTestId('hr-advance-file').setInputFiles(pdf('fee-challan.pdf'));
    await drawer.getByTestId('hr-advance-submit').click();
    await expect(drawer).toHaveCount(0);
    const row = page.getByTestId('hr-advance-row').filter({ hasText: 'Rukhsana Bibi' });
    await expect(row).toHaveAttribute('data-state', 'submitted');
    // The manager raised it and cannot approve it; the treasurer can.
    await row.click();
    await expect(page.getByTestId('hr-advance-approve')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await office(page, 'alnoor_treasurer', '/backoffice/hr/employee-advances', 'hr-advances');
    await page.getByTestId('hr-advance-row').filter({ hasText: 'Rukhsana Bibi' }).click();
    await page.getByTestId('hr-advance-approve').click();
    await confirm(page, /Approve request/);
    const advanceDrawer = page.getByTestId('hr-advance-drawer');
    await expect(advanceDrawer.getByTestId('hr-advance-unverified')).toContainText('cannot be verified yet');
    await expect(advanceDrawer.getByTestId('advance-state')).toContainText('Approved — payment not verified');
    await expect(advanceDrawer.getByTestId('hr-advance-payment')).toHaveAttribute('data-payment', 'unverified');
    await axe(page, testInfo, 'hr-advance-drawer-1440-en');
    // Settlement (HR-008, Issue #12) is read only: even a posted S.1 voucher of the exact amount, made
    // out to her, is no proof that this employee received this advance. No voucher list, no link.
    await office(page, 'alnoor_accounts', '/backoffice/hr/employee-advance-settlement', 'hr-settlement');
    await expect(page.getByTestId('hr-settlement-partial')).toContainText('not built (S.2b)');
    const voucher = await api<{ voucher: { id: string; ref: string; approvalId: string } }>(page, '/finance/vouchers', 'POST', { accountId: 'cac_anr_office', direction: 'payment', category: 'misc_expense', amount: '8000', onDate: '2026-10-26', purpose: 'Advance to Rukhsana Bibi (HR request)', counterparty: 'Rukhsana Bibi (staff)', evidence: { name: 'advance-slip.pdf', kind: 'receipt', size: 1000 }, submit: true });
    expect(voucher.ok).toBe(true);
    const v = voucher.ok ? voucher.res.voucher : null;
    // The page's mock server acts for the persona it was opened as: open a page as the treasurer first.
    // (8,000 is under the society's 10,000 two-signature limit: the treasurer alone approves.)
    await office(page, 'alnoor_treasurer', '/backoffice/hr/employee-advances', 'hr-advances');
    const decided = await api(page, `/approvals/${v!.approvalId}/decide`, 'POST', { decision: 'approve', reason: 'Checked against the HR approval' });
    expect(decided.ok, JSON.stringify(decided)).toBe(true);
    await office(page, 'alnoor_accounts', '/backoffice/hr/employee-advance-settlement', 'hr-settlement');
    expect((await api(page, `/finance/vouchers/${v!.id}/post`, 'POST')).ok).toBe(true);
    await page.reload();
    const settle = page.getByTestId('hr-settlement-advance').filter({ hasText: 'Rukhsana Bibi' });
    await expect(settle).toHaveAttribute('data-payment', 'unverified');
    await expect(settle.getByTestId('advance-state')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('hr-settlement-needs')).toContainText('naming it and the employee');
    await expect(page.getByTestId('hr-settlement-voucher')).toHaveCount(0);
    await expect(page.getByTestId('hr-settlement-link')).toHaveCount(0);
    const list = await api<{ items: Array<{ id: string; employeeName: string; state: string }> }>(page, '/hr/advances');
    const advance = list.ok ? list.res.items.find((x) => x.employeeName === 'Rukhsana Bibi')! : null;
    expect(await api(page, `/hr/advances/${advance!.id}/link`, 'POST', { purpose: 'disbursement', voucherId: v!.id })).toMatchObject({ ok: false, code: 'settlement_unverifiable' });
    await page.reload();
    await expect(page.getByTestId('hr-settlement-advance').filter({ hasText: 'Rukhsana Bibi' }).getByTestId('advance-state')).toHaveAttribute('data-state', 'approved');
    await axe(page, testInfo, 'hr-settlement-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2a who sees what', () => {
  test('the supervisor gets the roster and attendance, never staff records or money; finance gets advances only; a technician gets nothing', async ({ page, consoleErrors }) => {
    await at(page, '10:00');
    await seedSociety(page, { staff: 'alnoor_guard' });
    await office(page, 'alnoor_guard', '/backoffice/hr/roster', 'hr-roster-week');
    await expect(page.getByRole('link', { name: 'Duty roster', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'HR', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Staff advances' })).toHaveCount(0);
    await expect(page.getByTestId('hr-roster-publish')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/hr/employees-list`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await page.goto(`${BO}/backoffice/hr/employee-advances`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await office(page, 'alnoor_treasurer', '/backoffice/hr/employee-advances', 'hr-advances');
    await expect(page.getByTestId('hr-advance-new')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/hr/hr-dashboard`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await become(page, 'backoffice', 'alnoor_technician');
    await page.goto(`${BO}/backoffice/hr/roster`);
    await expect(page.getByTestId('access-outcome')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('without the HR add-on the office sees "not in your plan" and residents have no staff tab; a developer keeps HR as planned (Gate E)', async ({ page, consoleErrors }) => {
    await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['hr'])));
    await seedSociety(page, { staff: 'alnoor_manager' });
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/hr/hr-dashboard`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'module_not_licensed');
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community', 'community-home');
    await expect(page.getByTestId('community-home')).not.toHaveAttribute('data-tabs', /staff/);
    expect(consoleErrors).toEqual([]);
  });

  test('a developer organisation with HR in its plan keeps HR as a planned screen (society HR only in S.2a)', async ({ page, consoleErrors }) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await become(page, 'backoffice', 'manager');
    await page.goto(`${BO}/backoffice/hr/hr-dashboard`);
    await expect(page.getByTestId('planned-screen')).toHaveAttribute('data-screen-id', 'HR-001');
    expect(consoleErrors).toEqual([]);
  });

  test('residents tell confirmed staff from scheduled staff (Issue #12): names only with consent and an arrival, nothing personal; the hub and chat play no part', async ({ page, consoleErrors }, testInfo) => {
    await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['community_chat', 'community_hub'])));
    await at(page, '15:30');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=staff', 'community-staff');
    await expect(page.getByTestId('community-home')).toHaveAttribute('data-tabs', 'notices,staff');
    // Nobody has been checked in yet: everyone is scheduled, nobody is "on duty", and no name shows.
    await expect(page.getByTestId('community-staff')).toHaveAttribute('data-confirmed', '0');
    await expect(page.getByTestId('community-staff-confirmed')).toHaveCount(0);
    const expected = page.getByTestId('community-staff-expected');
    await expect(expected).toContainText('Scheduled, not yet confirmed');
    await expect(expected.locator('[data-testid="community-staff-person"][data-state="expected"]').first()).toContainText('scheduled until');
    await expect(page.getByTestId('community-staff')).not.toContainText(/Naveed|Imran|Faisal|Nadeem|\+92|35202/);
    // The office records Naveed's arrival: he is confirmed, with his name (he agreed to show it).
    await office(page, 'alnoor_manager', '/backoffice/hr/attendance', 'hr-attendance-rows');
    await page.locator('[data-testid="hr-attendance-row"][data-name="Naveed Anjum"]').getByTestId('hr-check-in').click();
    await expect(page.locator('[data-testid="hr-attendance-row"][data-name="Naveed Anjum"]').getByTestId('hr-check-out')).toBeVisible();
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=staff', 'community-staff');
    const confirmed = page.getByTestId('community-staff-confirmed');
    await expect(confirmed).toContainText('Confirmed on duty');
    await expect(confirmed).toContainText('Naveed Anjum');
    await expect(page.getByTestId('community-staff')).toHaveAttribute('data-confirmed', '1');
    await expect(expected).not.toContainText('Naveed');
    await expect(page.getByTestId('community-staff-next')).toContainText('Security guard × 2');
    await expect(page.getByTestId('community-staff-privacy')).toContainText('not an emergency service');
    await axe(page, testInfo, 'portal-staff-on-duty-1440-en');
    // On a phone the bottom bar's Pay action is still there.
    await page.setViewportSize(VIEWPORTS.phone);
    await expect(page.getByTestId('portal-centre-action')).toBeVisible();
    await axe(page, testInfo, 'portal-staff-on-duty-390-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2a Issue #14: shared staff across sites, and supervisors\' own departments', () => {
  /** Opens HR once as the manager (so the HR state exists), adds the shared guard, narrows the manager to the main site. */
  async function singleSiteManager(page: Page) {
    await office(page, 'alnoor_manager', '/backoffice/hr/hr-dashboard', 'hr-dashboard');
    const main = await addSharedGuard(page, ['alnoor_manager']);
    await page.reload();
    await expect(page.getByTestId('hr-dashboard')).toBeVisible();
    return main;
  }

  test('a main-site manager sees a guard who also works at Block C read only: no employee-wide change is offered, the server refuses it, and the note says why without naming the site', async ({ page, consoleErrors }, testInfo) => {
    await at(page, '15:20');
    await seedSociety(page, { staff: 'alnoor_manager' });
    await singleSiteManager(page);
    await page.goto(`${BO}/backoffice/hr/employee-360-workspace/${SHARED_GUARD.id}`);
    const note = page.getByTestId('hr-360-other-sites');
    await expect(note).toBeVisible();
    await expect(note).toContainText('also works at a site you do not manage');
    for (const id of ['hr-360-request-leave', 'hr-360-document', 'hr-360-status', 'hr-360-profile']) await expect(page.getByTestId(id), id).toHaveCount(0);
    // Duties at the main site are the main site's own: planning stays available.
    await expect(page.getByTestId('hr-360-assign')).toBeVisible();
    await expect(page.getByTestId('hr-employee-360')).not.toContainText(/Block C|ANC|site_anc/);
    await axe(page, testInfo, 'i14-shared-guard-360-1440-en');
    // The server refuses the change all the same, and nothing of Block C is in the answer.
    expect(await api(page, `/hr/employees/${SHARED_GUARD.id}`, 'PATCH', { phone: '0300 0000999' })).toEqual({ ok: false, code: 'other_sites', status: 403 });
    expect(await api(page, `/hr/employees/${SHARED_GUARD.id}/profile`, 'POST', { consent: true, showName: true })).toEqual({ ok: false, code: 'other_sites', status: 403 });
    // A colleague who works at the main site only keeps every action, and no note.
    await page.goto(`${BO}/backoffice/hr/employee-360-workspace/emp_anr_002`);
    await expect(page.getByTestId('hr-360-request-leave')).toBeVisible();
    await expect(page.getByTestId('hr-360-other-sites')).toHaveCount(0);
    // The leave and document pickers do not offer the shared guard (other staff remain).
    for (const [path, open, picker] of [
      ['/backoffice/hr/leave-attendance-adjustments', 'hr-leave-new', 'hr-leave-employee'],
      ['/backoffice/hr/employee-documents', 'hr-document-add', 'hr-document-employee'],
    ] as const) {
      await page.goto(`${BO}${path}`);
      await page.getByTestId(open).click();
      const input = page.getByTestId(picker).locator('input');
      await input.fill('Rashid');
      await expect(page.getByRole('option', { name: /Rashid Latif/ })).toHaveCount(0);
      await input.fill('Asif');
      await expect(page.getByRole('option', { name: /Asif Mehmood/ }).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    expect(consoleErrors).toEqual([]);
  });

  for (const locale of ['en-PK', 'ur-PK'] as const) {
    const l = locale === 'ur-PK' ? 'ur' : 'en';
    test(`320 × 700, ${l}, 200 %: the read-only note and Employee 360 of the shared guard are not clipped or broken`, async ({ page, consoleErrors }, testInfo) => {
      await at(page, '15:20');
      await page.setViewportSize(PHONE);
      await seedSociety(page, { staff: 'alnoor_manager', locale, textScale: 2 });
      await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY.alnoor_manager! });
      await singleSiteManager(page);
      await page.goto(`${BO}/backoffice/hr/employee-360-workspace/${SHARED_GUARD.id}`);
      await expect(page.getByTestId('hr-360-other-sites')).toBeVisible();
      expect(await layoutProblems(page), `shared guard 360 ${l}`).toEqual([]);
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      await axe(page, testInfo, `i14-shared-guard-360-320-200-${l}`);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('supervisors see their own departments only on the roster and On duty now (Naveed: maintenance and housekeeping; Shahid: security); direct addresses give nothing more', async ({ page, consoleErrors }, testInfo) => {
    await at(page, '09:30');
    await page.setViewportSize(VIEWPORTS.desktop);
    await seedSociety(page, { staff: 'alnoor_manager' });
    // Who is on the board now, by department, as full HR sees it.
    await office(page, 'alnoor_manager', '/backoffice/hr/roster?tab=now', 'hr-board-current');
    // Full HR keeps the links to Employee 360.
    await expect(page.locator('[data-testid="hr-on-duty"] a[href*="employee-360"]').first()).toBeVisible();
    const all = await api<{ current: Array<{ department: string; staff: Array<{ name: string }> }> }>(page, '/hr/roster/now');
    const byDept = (keep: string[]) => (all.ok ? all.res.current.filter((s) => !keep.includes(s.department)).flatMap((s) => s.staff.map((p) => p.name)) : []);
    expect(all.ok && new Set(all.res.current.map((s) => s.department)).size).toBe(4);
    await addSharedGuard(page);
    const departments = (testId: string) => page.getByTestId(testId).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-department')))].sort());
    for (const [persona, mine] of [
      ['alnoor_maintenance', ['housekeeping', 'maintenance']],
      ['alnoor_guard', ['security']],
    ] as const) {
      await office(page, persona, '/backoffice/hr/roster', 'hr-roster-grid');
      expect(await departments('hr-roster-cell'), persona).toEqual(mine);
      await axe(page, testInfo, `i14-roster-${persona}-1440-en`);
      await page.goto(`${BO}/backoffice/hr/roster?tab=now`);
      await expect(page.getByTestId('hr-board-current')).toBeVisible();
      expect(await departments('hr-board-shift'), persona).toEqual(mine);
      for (const name of byDept([...mine])) await expect(page.getByTestId('hr-on-duty'), `${persona} ${name}`).not.toContainText(name);
      // Names are plain text for a supervisor: no link that would end in "permission missing".
      await expect(page.locator('[data-testid="hr-on-duty"] a[href*="employee-360"]')).toHaveCount(0);
      await axe(page, testInfo, `i14-board-${persona}-1440-en`);
      await page.goto(`${BO}/backoffice/hr/attendance`);
      await expect(page.getByTestId('hr-attendance-rows').first()).toBeVisible();
      await expect(page.locator('[data-testid="hr-attendance-row"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="hr-attendance-rows"] a[href*="employee-360"]')).toHaveCount(0);
      // Direct addresses: staff records stay refused; another site or another department's candidates give nothing.
      await page.goto(`${BO}/backoffice/hr/employee-360-workspace/emp_anr_002`);
      await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
      await page.goto(`${BO}/backoffice/hr/roster`);
      await expect(page.getByTestId('hr-roster-grid')).toBeVisible();
      expect(await api(page, '/hr/roster', 'GET', {}, { site: SHARED_GUARD.blockC })).toEqual(await api(page, '/hr/roster', 'GET', {}, { site: 'site_none' }));
      const other = persona === 'alnoor_guard' ? 'sht_anr_maintenance' : 'sht_anr_morning';
      expect(await api(page, '/hr/roster/candidates', 'GET', {}, { templateId: other, date: '2026-10-26' })).toEqual({ ok: false, code: 'not_your_department', status: 403 });
    }
    expect(consoleErrors).toEqual([]);
  });
});

const OFFICE_SCREENS: Array<[string, string, string]> = [
  ['hr-dashboard', '/backoffice/hr/hr-dashboard', 'hr-dashboard'],
  ['hr-employees', '/backoffice/hr/employees-list', 'hr-employee-rows'],
  ['hr-new-employee', '/backoffice/hr/new-employee', 'hr-employee-form'],
  ['hr-employee-360', '/backoffice/hr/employee-360-workspace/emp_anr_001', 'hr-360-today'],
  ['hr-employee-360-duty', '/backoffice/hr/employee-360-workspace/emp_anr_002?tab=duty', 'hr-360-upcoming'],
  ['hr-roster', '/backoffice/hr/roster', 'hr-roster-week'],
  ['hr-on-duty', '/backoffice/hr/roster?tab=now', 'hr-board-current'],
  ['hr-shift-times', '/backoffice/hr/roster?tab=shifts', 'hr-shift-templates'],
  ['hr-attendance', '/backoffice/hr/attendance', 'hr-attendance-rows'],
  ['hr-leave', '/backoffice/hr/leave-attendance-adjustments', 'hr-leave-rows'],
  ['hr-corrections', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows'],
  ['hr-documents', '/backoffice/hr/employee-documents', 'hr-document-rows'],
  ['hr-advances', '/backoffice/hr/employee-advances', 'hr-advance-rows'],
  ['hr-settlement', '/backoffice/hr/employee-advance-settlement', 'hr-settlement-list'],
];

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`S.2a screens in ${lang(locale)}: axe at 1440, 768 and 390 px, no sideways scroll`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(300_000);
    await at(page, '15:20');
    await seedSociety(page, { staff: 'alnoor_manager', locale });
    await become(page, 'backoffice', 'alnoor_manager');
    for (const [name, path, ready] of OFFICE_SCREENS) {
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await axe(page, testInfo, `${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    await become(page, 'customer', 'alnoor_resident_a101');
    for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
      await page.setViewportSize(size);
      await page.goto(`${CU}/customer/portal/community?tab=staff`);
      await expect(page.getByTestId('community-staff')).toBeVisible();
      await axe(page, testInfo, `portal-staff-${vp}-${locale}`);
      expect(await overflowOf(page), `staff tab ${vp} ${locale}`).toBeLessThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });

  for (const scale of [1, 1.5, 2] as const) {
    test(`320 × 700, ${lang(locale)}, text ${scale * 100} %: the S.2a screens and the residents' staff tab are not clipped, spilled or broken mid-word`, async ({ page, consoleErrors }) => {
      test.setTimeout(240_000);
      await at(page, '15:20');
      await page.setViewportSize(PHONE);
      await seedSociety(page, { staff: 'alnoor_manager', locale, textScale: scale });
      await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY.alnoor_manager!, scale });
      await become(page, 'backoffice', 'alnoor_manager');
      for (const [name, path, ready] of OFFICE_SCREENS) {
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        // The office's body text is 14 px (15.12 px in Urdu) at 100 %: the chosen size multiplies it.
        expect(await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).fontSize))).toBeCloseTo((locale === 'ur-PK' ? 15.12 : 14) * scale, 2);
        expect(await layoutProblems(page), `${name} ${lang(locale)} ${scale * 100} %`).toEqual([]);
      }
      // Drawers at the same size: assign a shift, and a duty.
      await page.goto(`${BO}/backoffice/hr/employee-360-workspace/emp_anr_002`);
      await page.getByTestId('hr-360-assign').click();
      await expect(page.getByTestId('hr-assign-drawer')).toBeVisible();
      expect(await layoutProblems(page.getByTestId('hr-assign-drawer')), `assign drawer ${lang(locale)} ${scale * 100} %`).toEqual([]);
      // One arrival recorded, so the residents' tab shows both lists (confirmed and scheduled).
      const day = await api<{ rows: Array<{ assignmentId: string; employeeName: string }> }>(page, '/hr/attendance');
      const naveed = day.ok ? day.res.rows.find((r) => r.employeeName === 'Naveed Anjum')! : null;
      expect((await api(page, `/hr/attendance/${naveed!.assignmentId}/check-in`, 'POST')).ok).toBe(true);
      await become(page, 'customer', 'alnoor_resident_a101');
      await page.goto(`${CU}/customer/portal/community?tab=staff`);
      await expect(page.getByTestId('community-staff-confirmed')).toBeVisible();
      await expect(page.getByTestId('community-staff-expected')).toBeVisible();
      expect(await layoutProblems(page), `staff tab ${lang(locale)} ${scale * 100} %`).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }

  test(`dark mode with high contrast (${lang(locale)}, 390 px): the roster, On duty now, Employee 360 and leave pass axe with nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '15:20');
    await page.setViewportSize(VIEWPORTS.phone);
    await seedSociety(page, { staff: 'alnoor_manager', locale });
    const html = (name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
    await office(page, 'alnoor_manager', '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    await expect.poll(() => html('data-theme')).toBe('dark');
    for (const [name, path, ready] of OFFICE_SCREENS.filter(([n]) => ['hr-roster', 'hr-on-duty', 'hr-employee-360', 'hr-leave', 'hr-advances'].includes(n))) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `${name}-390-dark-contrast-${locale}`);
      expect(await layoutProblems(page), `${name} dark ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, 200 %: the keyboard reaches every control of the roster, On duty now and Employee 360 without the header or bar covering it`, async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await at(page, '15:20');
    await page.setViewportSize(PHONE);
    await seedSociety(page, { staff: 'alnoor_manager', locale });
    await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY.alnoor_manager! });
    await become(page, 'backoffice', 'alnoor_manager');
    for (const [name, path, ready] of OFFICE_SCREENS.filter(([n]) => ['hr-roster', 'hr-on-duty', 'hr-employee-360'].includes(n))) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}

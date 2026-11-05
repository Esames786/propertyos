import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate S.2b society payroll through the office app, with Al-Noor's fictional staff: Saba (accounts
 * officer) prepares, Ayesha (treasurer) approves; Imran (building manager, HR) and the residents
 * never see pay. The rules are the server's (payroll.api.test.ts and payroll.vectors.json); these
 * tests check that the screens carry them: the reference flow (run → breakdown → review → finalise →
 * instruction, never paid), who sees what, both languages, phones at 200 % text, dark mode with high
 * contrast and the keyboard. The demo's business date is Monday 26 October 2026.
 */
const api = societyApi;
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const RUN = 'prn_anr_0001';
const E = { shahid: 'emp_anr_001', karim: 'emp_anr_004', tariq: 'emp_anr_007', rukhsana: 'emp_anr_011', saba: 'emp_anr_014' };
const DISPLAY: Partial<Record<PersonaId, string>> = { alnoor_accounts: 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0004', alnoor_treasurer: 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002' };
const REASON = 'Paper attendance register for 1 to 18 October checked.';

async function at(page: Page, time: string, date = '2026-10-26') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(`${date}T${time}:00+05:00`));
}

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function confirm(page: Page, button: RegExp | string, note?: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  if (note) await dialog.locator('textarea').fill(note);
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

const line = (page: Page, employee: string) => page.locator(`[data-testid="pay-run-line"][data-employee="${employee}"]`);

/** Through the mock server: the run approved by Ayesha and an instruction prepared by Saba (setup only). */
async function approvedWithInstruction(page: Page, approveInstruction = false) {
  await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  for (const [id, days] of [[E.tariq, 23], [E.rukhsana, 26]] as const) expect((await api(page, `/payroll/runs/${RUN}/lines/${id}/days`, 'POST', { days, reason: REASON })).ok).toBe(true);
  expect((await api(page, `/payroll/runs/${RUN}/submit`, 'POST')).ok).toBe(true);
  await office(page, 'alnoor_treasurer', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  expect((await api(page, `/payroll/runs/${RUN}/approve`, 'POST', { acknowledge: true })).ok).toBe(true);
  await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  const ins = await api<{ id: string }>(page, `/payroll/runs/${RUN}/instructions`, 'POST');
  expect(ins.ok).toBe(true);
  if (approveInstruction && ins.ok) {
    await office(page, 'alnoor_treasurer', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
    expect((await api(page, `/payroll/instructions/${ins.res.id}/approve`, 'POST')).ok).toBe(true);
  }
}

test.describe('S.2b reference flow: run → breakdown → review → finalise → instruction, never paid', () => {
  test('Saba resolves the held lines and submits; Ayesha approves an obligation; the instruction is approved and sent (simulated); nothing is shown as paid', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
    // PAY-001: owed, instructed and verified paid apart; verified paid is "not available".
    await expect(page.getByTestId('pay-boundary')).toContainText('Owed, instructed and paid are three different things');
    await expect(page.getByTestId('pay-kpi-staffInRun')).toContainText('14');
    await expect(page.getByTestId('pay-kpi-blockedLines')).toContainText('2');
    await expect(page.getByTestId('pay-kpi-settledVerified')).toContainText('Not available');
    await expect(page.getByTestId('pay-attention')).toContainText('2 lines are held in the current run');
    await axe(page, testInfo, 'pay-dashboard-1440-en');
    // PAY-003 from the attention list: the held lines.
    await page.getByTestId('pay-attention-item').filter({ hasText: 'held in the current run' }).click();
    await expect(page.getByTestId('pay-run')).toHaveAttribute('data-version', '2');
    await expect(page.getByTestId('pay-run-line')).toHaveCount(2);
    await expect(line(page, E.tariq)).toContainText('Days worked not confirmed');
    await expect(page.getByTestId('pay-run-submit')).toHaveCount(0);
    await expect(page.getByTestId('pay-run-blockers')).toContainText('Some lines are held');
    await expect(page.getByTestId('pay-policies')).toContainText('Configuration needed — not applied');
    await axe(page, testInfo, 'pay-run-1440-en');
    // PAY-004: Tariq's days. An empty answer is refused; the HR record is a guide only.
    await line(page, E.tariq).click();
    await expect(page.getByTestId('pay-breakdown-days')).toContainText('HR attendance recorded 6 days worked');
    await page.getByTestId('pay-days-open').click();
    const days = page.getByTestId('pay-days-drawer');
    await days.getByTestId('pay-days-reason').fill(REASON);
    await days.getByTestId('pay-days-save').click();
    await expect(days.getByText('Enter whole days from 0 to 31.')).toBeVisible();
    await days.getByTestId('pay-days-input').fill('23');
    await axe(page, testInfo, 'pay-days-drawer-1440-en');
    await days.getByTestId('pay-days-save').click();
    await expect(days).toHaveCount(0);
    await expect(page.getByTestId('pay-breakdown-net')).toContainText('37,950.00');
    expect((await api(page, `/payroll/runs/${RUN}/lines/${E.rukhsana}/days`, 'POST', { days: 26, reason: REASON })).ok).toBe(true);
    // A bonus for Shahid: a negative amount is refused, then 5,000 is added as a new version.
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.shahid}`);
    await page.getByTestId('pay-bonus-open').click();
    const bonus = page.getByTestId('pay-bonus-drawer');
    await bonus.getByTestId('pay-bonus-label').fill('Night patrol cover');
    await bonus.getByTestId('pay-bonus-amount').fill('-5000');
    await bonus.getByTestId('pay-bonus-reason').fill('Covered the night patrol during the wedding week.');
    await bonus.getByTestId('pay-bonus-save').click();
    await expect(bonus.getByText('Enter an amount above zero, with up to two decimals.').first()).toBeVisible();
    await bonus.getByTestId('pay-bonus-amount').fill('5000');
    await bonus.getByTestId('pay-bonus-save').click();
    await expect(bonus).toHaveCount(0);
    await page.getByRole('tab', { name: 'Bonuses' }).click();
    await expect(page.getByTestId('pay-bonus')).toContainText('Night patrol cover');
    await page.getByRole('tab', { name: 'Deductions' }).click();
    await expect(page.getByTestId('pay-deductions-statutory')).toContainText('Demo placeholder — configuration needed. Not calculated.');
    await axe(page, testInfo, 'pay-breakdown-deductions-1440-en');
    // Saba's own pay: visible, never changeable.
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.saba}`);
    await expect(page.getByTestId('pay-breakdown-own')).toBeVisible();
    await expect(page.getByTestId('pay-bonus-open')).toHaveCount(0);
    await expect(page.getByTestId('pay-line-exclude')).toHaveCount(0);
    // Submit from the workspace.
    await page.goto(`${BO}/backoffice/pay/payroll-run-workspace?run=${RUN}`);
    await expect(page.getByTestId('pay-run-net')).toContainText('735,050.00');
    await page.getByTestId('pay-run-submit').click();
    await confirm(page, 'Submit for approval');
    await expect(page.getByTestId('pay-run')).toHaveAttribute('data-state', 'submitted');
    await expect(page.getByTestId('pay-run-state')).toHaveText('Awaiting approval');

    // PAY-005: Ayesha approves; without the acknowledgement the server refuses.
    await office(page, 'alnoor_treasurer', '/backoffice/pay/payroll-finalization', 'pay-final-detail');
    await expect(page.getByTestId('pay-final-detail')).toHaveAttribute('data-state', 'submitted');
    await expect(page.getByTestId('pay-final-warnings')).toContainText('Bank account not verified: 1');
    await page.getByTestId('pay-final-approve').click();
    await expect(page.getByText('Confirm that this approves what is owed, not a payment.')).toBeVisible();
    await axe(page, testInfo, 'pay-finalisation-1440-en');
    await page.getByTestId('pay-final-acknowledge').click();
    await page.getByTestId('pay-final-approve').click();
    await expect(page.getByTestId('pay-final-detail')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('pay-final-detail').getByTestId('pay-run-state')).toHaveText('Approved obligation — not paid');
    await expect(page.getByTestId('pay-final-audit')).toContainText('Approved as an obligation (version 5, net 735050.00)');

    // PAY-006: Saba prepares the instruction; Karim's unverified account is held, not dropped.
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-disbursement');
    await page.getByTestId('pay-instruction-prepare').click();
    const ins = page.getByTestId('pay-instruction');
    await expect(ins).toHaveAttribute('data-state', 'prepared');
    await expect(ins.getByTestId('pay-instruction-total')).toContainText('693,050.00');
    await expect(ins.getByTestId('pay-instruction-held')).toContainText('Karim Bakhsh');
    await expect(ins.getByTestId('pay-instruction-approve')).toHaveCount(0);
    await office(page, 'alnoor_treasurer', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
    await page.getByTestId('pay-instruction-approve').click();
    await confirm(page, 'Approve instruction');
    await expect(page.getByTestId('pay-instruction')).toHaveAttribute('data-state', 'approved');
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
    await page.getByTestId('pay-instruction-send').click();
    await confirm(page, /Mark sent/);
    await expect(page.getByTestId('pay-instruction')).toHaveAttribute('data-state', 'sent_simulated');
    await expect(page.getByTestId('pay-instruction-state')).toHaveText('Sent (simulated) — not paid');
    const settled = page.getByTestId('pay-settlement');
    expect(await settled.count()).toBe(13);
    for (const s of await settled.all()) await expect(s).toHaveText('Not settled — no evidence');
    await expect(page.getByTestId('pay-instruction-cancel')).toHaveCount(0);
    await axe(page, testInfo, 'pay-disbursement-1440-en');
    // PAY-007: proposed only; nothing posted; verified paid not available.
    await page.getByTestId('pay-nav-accounting').click();
    await expect(page.getByTestId('pay-journal-proposed')).toContainText('735,050.00');
    await expect(page.getByTestId('pay-accounting-posted')).toHaveText('None. Nothing is posted from payroll.');
    await expect(page.getByTestId('pay-accounting-settled')).toContainText('Not available');
    await axe(page, testInfo, 'pay-accounting-1440-en');
    await page.getByTestId('pay-nav-dashboard').click();
    await expect(page.getByTestId('pay-kpi-approvedObligation')).toContainText('735,050.00');
    await expect(page.getByTestId('pay-kpi-instructed')).toContainText('693,050.00');
    await expect(page.getByTestId('pay-kpi-settledVerified')).toContainText('Not available');
    expect(await page.locator('main').innerText()).not.toMatch(/\bPaid\b/);
    expect(consoleErrors).toEqual([]);
  });

  test('periods in order: the next month is created as a draft; another period cannot open while October is; the closed period ends the run’s changes', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-periods', 'pay-period-rows');
    const nov = page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-11"]');
    await expect(nov.getByTestId('pay-period-blocked')).toContainText('Another period is open. Close it first.');
    await expect(nov.getByTestId('pay-period-open')).toHaveCount(0);
    await page.getByTestId('pay-period-new').click();
    const drawer = page.getByTestId('pay-period-drawer');
    await expect(drawer.getByTestId('pay-period-month')).toHaveValue('2026-12');
    await drawer.getByTestId('pay-period-month').fill('2027-01');
    await drawer.getByTestId('pay-period-save').click();
    await expect(drawer.getByText('Periods are created in order: the next one is 2026-12.').first()).toBeVisible();
    await drawer.getByTestId('pay-period-month').fill('2026-12');
    await axe(page, testInfo, 'pay-period-drawer-1440-en');
    await drawer.getByTestId('pay-period-save').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-12"]')).toHaveAttribute('data-state', 'draft');
    // Ayesha closes October once its run is approved; the run can then no longer be reversed.
    await approvedWithInstruction(page);
    await office(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-detail');
    await expect(page.getByTestId('pay-final-blocked')).toContainText('A disbursement instruction exists for this run');
    await page.getByTestId('pay-final-close').click();
    await confirm(page, 'Close period');
    await expect(page.getByTestId('pay-final-close')).toHaveCount(0);
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-periods', 'pay-period-rows');
    await expect(page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-10"]')).toHaveAttribute('data-state', 'closed');
    await page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-11"]').getByTestId('pay-period-open').click();
    await confirm(page, 'Open period');
    await page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-11"]').getByTestId('pay-period-prepare').click();
    await expect(page.getByTestId('pay-run')).toHaveAttribute('data-ref', 'ANR-PR-2026-11');
    expect(consoleErrors).toEqual([]);
  });

  test('a returned run comes back to the preparer; a reversal withdraws the obligation and the period gets a new run', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
    for (const [id, d] of [[E.tariq, 23], [E.rukhsana, 26]] as const) expect((await api(page, `/payroll/runs/${RUN}/lines/${id}/days`, 'POST', { days: d, reason: REASON })).ok).toBe(true);
    expect((await api(page, `/payroll/runs/${RUN}/submit`, 'POST')).ok).toBe(true);
    await office(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-detail');
    await page.getByTestId('pay-final-return').click();
    await confirm(page, 'Return for changes', 'Tariq was on leave for three days; please check his days.');
    await office(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run');
    await expect(page.getByTestId('pay-run')).toHaveAttribute('data-state', 'draft');
    await expect(page.getByTestId('pay-run-history')).toContainText('Tariq was on leave for three days');
    await page.getByTestId('pay-run-submit').click();
    await confirm(page, 'Submit for approval');
    await office(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-detail');
    await page.getByTestId('pay-final-acknowledge').click();
    await page.getByTestId('pay-final-approve').click();
    await expect(page.getByTestId('pay-final-detail')).toHaveAttribute('data-state', 'approved');
    await page.getByTestId('pay-final-reverse').click();
    await confirm(page, 'Reverse approval', 'Prepared before Tariq’s leave was corrected.');
    await expect(page.getByTestId('pay-final-detail')).toHaveAttribute('data-state', 'reversed');
    await page.getByTestId('pay-nav-accounting').click();
    await expect(page.getByTestId('pay-journal-reversal')).toBeVisible();
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-periods', 'pay-period-rows');
    await page.locator('[data-testid="pay-period-row"][data-ref="ANR-PP-2026-10"]').getByTestId('pay-period-prepare').click();
    await expect(page.getByTestId('pay-run')).toHaveAttribute('data-ref', 'ANR-PR-2026-10-2');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.2b who sees pay', () => {
  test('HR staff, supervisors and residents never see wages: no menu entry, deep links refused, the mock server refuses too', async ({ page, consoleErrors }) => {
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_manager' });
    for (const persona of ['alnoor_manager', 'alnoor_admin', 'alnoor_guard'] as const) {
      await office(page, persona, '/backoffice/home/role-aware-dashboard', 'app-header');
      await expect(page.locator('a[href="/backoffice/pay/payroll-dashboard"]')).toHaveCount(0);
      for (const path of ['/backoffice/pay/payroll-dashboard', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.shahid}`]) {
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId('access-outcome'), `${persona} ${path}`).toHaveAttribute('data-reason', 'permission_missing');
      }
      const r = await api(page, `/payroll/runs/${RUN}/lines/${E.shahid}`);
      expect(r.ok ? 'ok' : r.code, persona).toBe('permission_missing');
    }
    // Employee 360 (hr.view) shows no pay.
    await office(page, 'alnoor_manager', `/backoffice/hr/employee-360-workspace/${E.shahid}`, 'hr-employee-360');
    expect(await page.locator('main').innerText()).not.toMatch(/55,000|Payroll|Net pay/);
    // A resident's app has no payroll, and its mock server refuses it.
    await become(page, 'customer', 'alnoor_resident_a101');
    await page.goto(`${CU}/customer/portal/home`);
    const res = await api(page, '/payroll/dashboard');
    expect(res.ok ? 'ok' : res.status).toBe(403);
    expect(consoleErrors).toEqual([]);
  });

  test('HR without payroll: Saba sees "not in your plan" and HR keeps working', async ({ page, consoleErrors }) => {
    await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['payroll'])));
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await become(page, 'backoffice', 'alnoor_accounts');
    await page.goto(`${BO}/backoffice/pay/payroll-dashboard`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'module_not_licensed');
    await expect(page.locator('a[href="/backoffice/pay/payroll-dashboard"]')).toHaveCount(0);
    await office(page, 'alnoor_manager', '/backoffice/hr/hr-dashboard', 'hr-dashboard');
    expect(consoleErrors).toEqual([]);
  });

  test('a developer organisation: its preset includes payroll (Gate E), but no role may see pay and no society payroll exists for it', async ({ page, consoleErrors }) => {
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await become(page, 'backoffice', 'manager');
    await page.goto(`${BO}/backoffice/pay/payroll-dashboard`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await expect(page.locator('a[href="/backoffice/pay/payroll-dashboard"]')).toHaveCount(0);
    const r = await api(page, '/payroll/dashboard');
    expect(r.ok ? 'ok' : r.code).toBe('permission_missing');
    expect(consoleErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Both languages, every width, 320 px at 200 %, dark mode with high contrast, the keyboard
// ---------------------------------------------------------------------------------------------

const SCREENS: Array<[string, string, string]> = [
  ['pay-dashboard', '/backoffice/pay/payroll-dashboard', 'pay-dashboard'],
  ['pay-periods', '/backoffice/pay/payroll-periods', 'pay-period-rows'],
  ['pay-run', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines'],
  ['pay-breakdown', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.tariq}`, 'pay-breakdown'],
  ['pay-breakdown-deductions', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.karim}&tab=deductions`, 'pay-deductions-statutory'],
  ['pay-finalisation', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-detail'],
  ['pay-disbursement', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction'],
  ['pay-accounting', '/backoffice/pay/payroll-accounting', 'pay-accounting-runs'],
];

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`S.2b screens in ${lang(locale)}: axe at 1440, 768 and 390 px, no sideways scroll`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(300_000);
    await at(page, '16:10');
    await seedSociety(page, { staff: 'alnoor_accounts', locale });
    await approvedWithInstruction(page);
    await become(page, 'backoffice', 'alnoor_accounts');
    for (const [name, path, ready] of SCREENS) {
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await axe(page, testInfo, `${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, text 200 %: every payroll screen and drawer is not clipped, spilled or broken mid-word`, async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await at(page, '16:10');
    await page.setViewportSize(PHONE);
    await seedSociety(page, { staff: 'alnoor_accounts', locale });
    for (const key of [DISPLAY.alnoor_accounts!, DISPLAY.alnoor_treasurer!]) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key });
    // Before anything is approved: the held lines and the drawers.
    await office(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
    expect(await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).fontSize))).toBeCloseTo((locale === 'ur-PK' ? 15.12 : 14) * 2, 2);
    expect(await layoutProblems(page), `run (draft) ${lang(locale)}`).toEqual([]);
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.tariq}`);
    await page.getByTestId('pay-days-open').click();
    await expect(page.getByTestId('pay-days-drawer')).toBeVisible();
    expect(await layoutProblems(page.getByTestId('pay-days-drawer')), `days drawer ${lang(locale)}`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.shahid}`);
    await page.getByTestId('pay-bonus-open').click();
    expect(await layoutProblems(page.getByTestId('pay-bonus-drawer')), `bonus drawer ${lang(locale)}`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.goto(`${BO}/backoffice/pay/payroll-periods`);
    await page.getByTestId('pay-period-new').click();
    expect(await layoutProblems(page.getByTestId('pay-period-drawer')), `period drawer ${lang(locale)}`).toEqual([]);
    await page.keyboard.press('Escape');
    // Then approved, with an instruction: every screen.
    await approvedWithInstruction(page);
    await become(page, 'backoffice', 'alnoor_accounts');
    for (const [name, path, ready] of SCREENS) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      expect(await layoutProblems(page), `${name} ${lang(locale)} 200 %`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`dark mode with high contrast (${lang(locale)}, 390 px): the run, breakdown, finalisation and disbursement pass axe with nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await at(page, '16:10');
    await page.setViewportSize(VIEWPORTS.phone);
    await seedSociety(page, { staff: 'alnoor_accounts', locale });
    await approvedWithInstruction(page);
    const html = (name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
    await office(page, 'alnoor_accounts', '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    await expect.poll(() => html('data-theme')).toBe('dark');
    for (const [name, path, ready] of SCREENS) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `${name}-390-dark-contrast-${locale}`);
      expect(await layoutProblems(page), `${name} dark ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, 200 %: the keyboard reaches every control of the run, the breakdown and finalisation without the header or bar covering it`, async ({ page, consoleErrors }) => {
    test.setTimeout(240_000);
    await at(page, '16:10');
    await page.setViewportSize(PHONE);
    await seedSociety(page, { staff: 'alnoor_accounts', locale });
    for (const key of [DISPLAY.alnoor_accounts!, DISPLAY.alnoor_treasurer!]) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key });
    await become(page, 'backoffice', 'alnoor_accounts');
    for (const [name, path, ready] of [SCREENS[2]!, SCREENS[3]!, SCREENS[1]!]) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
    }
    // Finalisation for the approver, with the acknowledgement and the decision buttons.
    await office(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
    for (const [id, d] of [[E.tariq, 23], [E.rukhsana, 26]] as const) expect((await api(page, `/payroll/runs/${RUN}/lines/${id}/days`, 'POST', { days: d, reason: REASON })).ok).toBe(true);
    expect((await api(page, `/payroll/runs/${RUN}/submit`, 'POST')).ok).toBe(true);
    await office(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-acknowledge');
    const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
    expect(stops.filter((s) => s.issue), `finalisation ${lang(locale)}`).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

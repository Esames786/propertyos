import type { Page } from '@playwright/test';
import { BO, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi } from '../support/society';

/**
 * Gate S.2b cross-browser smoke (Firefox and WebKit projects): a daily wage's days confirmed and the
 * run submitted by the preparer; the approver's acknowledgement and approval; the instruction sent
 * (simulated) and every line still "not settled"; the run and the disbursement at 320 px with 200 %
 * text in Urdu. The full checks run in Chromium (tests/e2e/s2b.spec.ts). Business date: 26 October 2026.
 */
const RUN = 'prn_anr_0001';
const TARIQ = 'emp_anr_007';
const RUKHSANA = 'emp_anr_011';
const REASON = 'Paper attendance register for 1 to 18 October checked.';

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

async function confirm(page: Page, button: RegExp | string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

test('the preparer confirms days and submits; the approver acknowledges and approves; the instruction is sent (simulated) and nothing is settled', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${TARIQ}`, 'pay-breakdown');
  await page.getByTestId('pay-days-open').click();
  const days = page.getByTestId('pay-days-drawer');
  await days.getByTestId('pay-days-input').fill('23');
  await days.getByTestId('pay-days-reason').fill(REASON);
  await days.getByTestId('pay-days-save').click();
  await expect(days).toHaveCount(0);
  await expect(page.getByTestId('pay-breakdown-net')).toContainText('37,950.00');
  expect((await societyApi(page, `/payroll/runs/${RUN}/lines/${RUKHSANA}/days`, 'POST', { days: 26, reason: REASON })).ok).toBe(true);
  await page.goto(`${BO}/backoffice/pay/payroll-run-workspace?run=${RUN}`);
  await page.getByTestId('pay-run-submit').click();
  await confirm(page, 'Submit for approval');
  await expect(page.getByTestId('pay-run')).toHaveAttribute('data-state', 'submitted');
  await as(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-acknowledge');
  await page.getByTestId('pay-final-acknowledge').click();
  await page.getByTestId('pay-final-approve').click();
  await expect(page.getByTestId('pay-final-detail')).toHaveAttribute('data-state', 'approved');
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction-prepare');
  await page.getByTestId('pay-instruction-prepare').click();
  await expect(page.getByTestId('pay-instruction')).toHaveAttribute('data-state', 'prepared');
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction-approve');
  await page.getByTestId('pay-instruction-approve').click();
  await confirm(page, 'Approve instruction');
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction-send');
  await page.getByTestId('pay-instruction-send').click();
  await confirm(page, /Mark sent/);
  await expect(page.getByTestId('pay-instruction')).toHaveAttribute('data-state', 'sent_simulated');
  for (const s of await page.getByTestId('pay-settlement').all()) await expect(s).toHaveAttribute('data-state', 'not_settled');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 × 700, Urdu, 200 %: the run and the disbursement are not clipped, spilled or broken mid-word', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await seedSociety(page, { staff: 'alnoor_accounts', locale: 'ur-PK' });
  await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_alnoor:usr_anr_0004', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
  expect(await layoutProblems(page), 'run').toEqual([]);
  await as(page, 'alnoor_accounts', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${TARIQ}`, 'pay-breakdown');
  expect(await layoutProblems(page), 'breakdown').toEqual([]);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-disbursement-partial');
  expect(await layoutProblems(page), 'disbursement').toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});

import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate S.1 (society finance and governance) through the office app, with the people of the Al-Noor
 * storyline: Saba (accounts officer) prepares and collects, Ayesha (treasurer) approves, confirms and
 * closes, Rabia (general secretary) is the second signatory, Imran (building manager) takes cash to
 * the bank. Every money rule is the server's; these tests check that the screens show it honestly.
 */
const api = societyApi;

async function office(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready)).toBeVisible();
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await office(page, path, ready);
}

async function choose(scope: Page | Locator, page: Page, testId: string, option: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').click();
  await page.getByRole('option', { name: option }).first().click();
  // The list closes before the next click (a click during its exit is taken as 'dismiss').
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** A field's text box, whether the test id sits on the box itself or on its wrapper. */
const box = (scope: Page | Locator, testId: string) =>
  scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

/** Become a colleague and reload, so the page's own mock server answers as them (setup through the API). */
async function switchTo(page: Page, persona: PersonaId) {
  await become(page, 'backoffice', persona);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__prototype));
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function decide(page: Page, persona: PersonaId, approvalId: string, reason = 'Checked against the evidence and the purpose.', scan?: TestInfo) {
  await as(page, persona, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
  await page.getByTestId('approval-decide').click();
  const drawer = page.getByTestId('decide-drawer');
  await box(drawer, 'decide-reason').fill(reason);
  if (scan) await axe(page, scan, 'decide-drawer-1440-en');
  await drawer.getByTestId('decide-submit').click();
  await expect(drawer).toBeHidden();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

test.describe('S.1 reference 1: society finance — dashboard, cashbook, source record, reconciliation', () => {
  test('every figure opens its records; the cashbook is settled sources only, each with its evidence', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
    const ladder = page.getByTestId('finance-ladder');
    await expect(ladder.getByTestId('ladder-billed')).toContainText('49,100.00');
    await expect(ladder.getByTestId('ladder-collected')).toContainText('12,600.00');
    await expect(ladder.getByTestId('ladder-cashReceived')).toContainText('0.00');
    await expect(ladder.getByTestId('ladder-bankSettled')).toContainText('12,600.00');
    await expect(page.getByTestId('fin-closing')).toContainText('313.7');
    await expect(page.getByTestId('finance-approvals')).toContainText('1 request waits for your decision');
    await axe(page, testInfo, 'finance-dashboard-1440-en');

    // A figure opens its records: unreconciled lines → the bank feed filtered to unmatched.
    await page.getByTestId('fin-unreconciled').click();
    await expect(page).toHaveURL(/bank-transaction-feed\?state=unmatched/);

    await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-page');
    const lines = page.getByTestId('cashbook-line');
    await expect(lines).toHaveCount(6);
    await expect(page.getByTestId('cashbook-totals')).toContainText('313,650.00');
    await expect(page.getByTestId('cashbook-pending').getByTestId('pending-item').first()).toBeVisible();
    await expect(page.getByTestId('reconciliation-row').filter({ hasText: 'Association account' })).toHaveAttribute('data-reconciled', 'false');
    await axe(page, testInfo, 'cashbook-1440-en');

    // The source of a line: a verified payment with its receipt and statement line.
    await lines.filter({ hasText: 'ANR-RCT-2026-00001' }).getByRole('link').first().click();
    await expect(page).toHaveURL(/payment-workspace\?record=pay_anr_0001/);

    // The month close lists what blocks October, each opening its records.
    await office(page, '/backoffice/bank/cashbook?drawer=close', 'cashbook-page');
    const close = page.getByTestId('close-drawer');
    await expect(close.locator('[data-key="period_ended"]')).toHaveAttribute('data-outcome', 'blocking');
    await expect(close.locator('[data-key="unreconciled_lines"]')).toHaveAttribute('data-outcome', 'blocking');
    await expect(close.locator('[data-key="proofs_waiting"]')).toHaveAttribute('data-outcome', 'blocking');
    await expect(close.getByTestId('close-period')).toHaveCount(0);
    await axe(page, testInfo, 'close-drawer-october-1440-en');
    expect(consoleErrors).toEqual([]);
  });

  test('a cash deposit: approved instruction, witnessed slip, matched statement line; the cashbook moves only at each settlement', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice/bank/transfers', 'transfers-page');
    await page.getByTestId('new-transfer').click();
    const form = page.getByTestId('new-transfer-drawer');
    await choose(form, page, 'transfer-from', /Office cash box/);
    await choose(form, page, 'transfer-to', /Association account/);
    await box(form, 'transfer-amount').fill('10000');
    await box(form, 'transfer-purpose').fill('Bank the office cash of the week');
    await axe(page, testInfo, 'new-transfer-drawer-1440-en');
    await form.getByTestId('transfer-submit').click();
    const drawer = page.getByTestId('transfer-drawer');
    await expect(drawer.getByTestId('transfer-state')).toHaveAttribute('data-state', 'awaiting_approval');
    await axe(page, testInfo, 'transfer-drawer-1440-en');
    const approvalId = await drawer.getByTestId('approval-panel').getByTestId('open-approval').getAttribute('href').then((h) => new URL(h!, BO).searchParams.get('record')!);
    const transferUrl = page.url().replace(BO, '');

    await decide(page, 'alnoor_treasurer', approvalId);
    await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'approved');

    await as(page, 'alnoor_manager', transferUrl, 'transfer-drawer');
    await expect(page.getByTestId('transfer-instruction-notice')).toContainText('Approved instruction — not sent');
    await box(page, 'leg-out-slip').fill('DS-0412');
    await page.getByTestId('leg-out-record-slip').click();
    await expect(page.getByTestId('leg-out')).toHaveAttribute('data-status', 'slip_recorded');
    await expect(page.getByTestId('leg-out-witness')).toHaveCount(0);

    await as(page, 'alnoor_treasurer', transferUrl, 'transfer-drawer');
    await page.getByTestId('leg-out-witness').click();
    await expect(page.getByTestId('transfer-state')).toHaveAttribute('data-state', 'in_transit');

    await as(page, 'alnoor_accounts', '/backoffice/bank/transfers?drawer=statement', 'demo-statement-drawer');
    const demo = page.getByTestId('demo-statement-drawer');
    await expect(demo.getByTestId('sample-notice')).toContainText('Demo document, fictional data');
    await demo.getByTestId('demo-generate').click();
    await expect(demo.getByTestId('demo-file')).toContainText('#sample=Demo document, fictional data');
    await demo.getByTestId('demo-import').click();
    await expect(demo).toBeHidden();

    await office(page, transferUrl, 'transfer-drawer');
    await page.getByTestId('leg-in-candidates').locator('[data-strength="full"]').first().click();
    await page.getByTestId('leg-in-match').click();
    await expect(page.getByTestId('transfer-state')).toHaveAttribute('data-state', 'settled');
    await expect(page.getByTestId('leg-in-settled')).toContainText('matched by Saba Javed');

    const book = await api<{ totals: { closing: { amount: string } }; inTransit: { amount: string } }>(page, '/finance/cashbook', 'GET', {}, { account: 'cac_anr_office' });
    expect(book.ok && book.res.totals.closing.amount).toBe('5000.00');
    expect(book.ok && book.res.inTransit.amount).toBe('0.00');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 reference 2: bulk office collection — cash witnessed, cheques pending until cleared', () => {
  test('Saba collects cash and a cheque; Ayesha counts and confirms; receipts for cash, an acknowledgement for the cheque', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/sites/site_alnoor?tab=payment-methods', 'payment-methods');
    await page.getByTestId('method-toggle-office_cash').click();
    await expect(page.locator('[data-method="office_cash"]')).toHaveAttribute('data-allowed', 'true');
    await page.getByTestId('method-toggle-cheque').click();
    await expect(page.locator('[data-method="cheque"]')).toHaveAttribute('data-allowed', 'true');

    await as(page, 'alnoor_accounts', '/backoffice/fin/office-collections', 'office-collections-page');
    await page.getByTestId('new-batch').click();
    const drawer = page.getByTestId('batch-drawer');
    await expect(drawer.getByTestId('batch-state')).toHaveAttribute('data-state', 'draft');
    const add = async (q: string, method: 'add-cash' | 'add-cheque') => {
      await box(drawer, 'batch-find').fill(q);
      await drawer.getByTestId('batch-candidate').filter({ hasText: q }).first().getByTestId(method).click();
    };
    await add('A-404', 'add-cash');
    await add('B-306', 'add-cash');
    await add('A-101', 'add-cheque');
    await box(drawer, 'batch-line-amount-0').fill('8400');
    await box(drawer, 'batch-line-amount-1').fill('12600');
    await box(drawer, 'batch-line-amount-2').fill('5200');
    await box(drawer, 'batch-line-bank-2').fill('Demo Bank');
    await box(drawer, 'batch-line-number-2').fill('004512');
    await drawer.getByTestId('batch-save').click();
    await expect(drawer.getByTestId('batch-line')).toHaveCount(3);
    await box(drawer, 'batch-declared').fill('21000');
    await drawer.getByTestId('batch-submit').click();
    await expect(drawer.getByTestId('batch-state')).toHaveAttribute('data-state', 'submitted');
    // The collector sees why they cannot confirm their own collection.
    await expect(drawer.getByTestId('batch-not-yours')).toBeVisible();
    await expect(drawer.getByTestId('batch-confirm')).toHaveCount(0);
    const batchUrl = page.url().replace(BO, '');

    await as(page, 'alnoor_treasurer', batchUrl, 'batch-drawer');
    await expect(page.getByTestId('batch-review')).toContainText('Saba Javed counted');
    await box(page, 'batch-counted').fill('21000');
    await axe(page, testInfo, 'batch-review-1440-en');
    await page.getByTestId('batch-confirm').click();
    await expect(page.getByTestId('batch-state')).toHaveAttribute('data-state', 'confirmed');
    await expect(page.getByTestId('line-receipt')).toHaveCount(2);
    await expect(page.getByTestId('line-cheque')).toContainText('Cheque received — not a receipt of payment');
    await expect(page.getByTestId('batch-confirmed-cheques')).toBeVisible();

    // The cheque settled nothing: A-101 still owes 5,200.
    const a101 = await api<{ balance: { amount: string } }>(page, '/billing-accounts/ba_anr_a101');
    expect(a101.ok && a101.res.balance.amount).toBe('5200.00');
    const cash = await api<{ totals: { closing: { amount: string } } }>(page, '/finance/cashbook', 'GET', {}, { account: 'cac_anr_office' });
    expect(cash.ok && cash.res.totals.closing.amount).toBe('36000.00');
    expect(consoleErrors).toEqual([]);
  });

  test('a cheque clears only on its bank line; a returned cheque settles nothing; a cleared one is reversed with approval', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/fin/office-collections', 'office-collections-page');
    await api(page, '/sites/site_alnoor/cheque-rules', 'PATCH', { enabled: true, payableTo: 'Al-Noor Residency Owners’ Association (Demo)', depositAccountId: 'ben_anr_main', maxPostDatedDays: 0 });
    await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'cheque', enabled: true });
    await become(page, 'backoffice', 'alnoor_accounts');
    await office(page, '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101', 'office-drawer');
    const office2 = page.getByTestId('office-drawer');
    await office2.getByTestId('office-method').getByText('Cheque').click();
    await box(office2, 'office-amount').fill('5200');
    await box(office2, 'office-cheque-bank').fill('Demo Bank');
    await box(office2, 'office-cheque-number').fill('004512');
    await office2.getByTestId('office-submit').click();
    await expect(office2.getByTestId('office-cheque-done')).toContainText('Cheque received — not a receipt of payment');
    const chequeHref = await office2.getByRole('link').filter({ hasText: /Open the cheque/ }).getAttribute('href');

    await office(page, chequeHref!, 'cheque-drawer');
    const cheque = page.getByTestId('cheque-drawer');
    await box(cheque, 'cheque-slip').fill('CD-0091');
    await axe(page, testInfo, 'cheque-drawer-1440-en');
    await cheque.getByTestId('cheque-deposit').click();
    await expect(cheque.getByTestId('cheque-state')).toHaveAttribute('data-state', 'deposited');

    const options = await api<{ items: Array<{ id: string; kind: string }> }>(page, '/finance/demo-statement', 'GET', {}, { account: 'ben_anr_main' });
    const file = await api<{ fileName: string; content: string; from: string; to: string }>(page, '/finance/demo-statement', 'POST', { accountId: 'ben_anr_main', choices: (options.ok ? options.res.items : []).map((i) => ({ id: i.id, kind: i.kind, variant: 'full' })) });
    if (file.ok) await api(page, '/bank/statements', 'POST', { beneficiaryId: 'ben_anr_main', ...file.res });
    await office(page, chequeHref!, 'cheque-drawer');
    await cheque.getByTestId('cheque-candidates').locator('[data-strength="full"]').first().click();
    await cheque.getByTestId('cheque-clear').click();
    await expect(cheque.getByTestId('cheque-state')).toHaveAttribute('data-state', 'cleared');
    const cleared = await api<{ balance: { amount: string } }>(page, '/billing-accounts/ba_anr_a101');
    expect(cleared.ok && cleared.res.balance.amount).toBe('0.00');

    // The bank takes it back after clearing: its debit is the evidence, the treasurer approves the reversal.
    const back = await api<{ items: Array<{ id: string; kind: string }> }>(page, '/finance/demo-statement', 'GET', {}, { account: 'ben_anr_main' });
    const debit = await api<{ fileName: string; content: string; from: string; to: string }>(page, '/finance/demo-statement', 'POST', { accountId: 'ben_anr_main', choices: (back.ok ? back.res.items : []).map((i) => ({ id: i.id, kind: i.kind, variant: i.kind === 'cheque_return' ? 'returned_after_clearing' : 'skip' })) });
    if (debit.ok) await api(page, '/bank/statements', 'POST', { beneficiaryId: 'ben_anr_main', ...debit.res });
    await office(page, chequeHref!, 'cheque-drawer');
    await cheque.getByTestId('cheque-candidates').getByTestId('line-candidate').first().click();
    await box(cheque, 'cheque-reversal-reason').fill('Returned after clearing: account closed');
    await cheque.getByTestId('cheque-request-reversal').click();
    await expect(cheque.getByTestId('cheque-reversal-pending')).toBeVisible();
    const approvalHref = await cheque.getByTestId('cheque-reversal-pending').getByRole('link').getAttribute('href');
    await decide(page, 'alnoor_treasurer', new URL(approvalHref!, BO).searchParams.get('record')!);
    await as(page, 'alnoor_accounts', chequeHref!, 'cheque-drawer');
    await expect(cheque.getByTestId('cheque-state')).toHaveAttribute('data-state', 'reversed');
    const reopened = await api<{ balance: { amount: string } }>(page, '/billing-accounts/ba_anr_a101');
    expect(reopened.ok && reopened.res.balance.amount).toBe('5200.00');

    // The resident sees it plainly: the cheque was taken back and the bill is open again.
    await page.goto(`${CU}/customer/portal/payment-history`);
    await expect(page.getByTestId('history-cheque')).toHaveAttribute('data-status', 'reversed');
    await expect(page.getByTestId('history-receipt-reversed')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 reference 3: committee approvals — policy evaluation, independent decisions, audit', () => {
  test('a 12,000 voucher needs the treasurer and the general secretary; the preparer sees why they cannot decide', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_admin' });
    await office(page, '/backoffice/committee', 'committee-page');
    await expect(page.locator('[data-testid="committee-term"][data-office="general_secretary"]')).toContainText('Rabia Hashmi');
    await page.getByRole('tab', { name: 'Offices and authority' }).click();
    await expect(page.locator('[data-testid="committee-office"][data-office="treasurer"]').getByTestId('office-authority')).toContainText('Cash voucher');
    await axe(page, testInfo, 'committee-1440-en');

    await as(page, 'alnoor_accounts', '/backoffice/bank/cashbook?drawer=voucher', 'voucher-drawer');
    const v = page.getByTestId('voucher-drawer');
    await choose(v, page, 'voucher-account', /Office cash box/);
    await choose(v, page, 'voucher-category', /Repairs/);
    await box(v, 'voucher-amount').fill('12000');
    await box(v, 'voucher-counterparty').fill('Gulberg Electric Works (Demo)');
    await box(v, 'voucher-purpose').fill('Water pump motor rewinding');
    await v.getByTestId('voucher-sample-evidence').click();
    await axe(page, testInfo, 'voucher-drawer-1440-en');
    await v.getByTestId('voucher-create-submit').click();
    await expect(v).toBeHidden();
    const vouchers = await api<{ items: Array<{ approvalId?: string; purpose: string }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'submitted' });
    const approvalId = (vouchers.ok ? vouchers.res.items : []).find((x) => x.purpose.startsWith('Water pump'))!.approvalId!;

    await office(page, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
    await expect(page.getByTestId('approval-why')).toHaveAttribute('data-reason', 'own_request');
    await expect(page.getByTestId('approval-rule')).toContainText('Version 1');
    await expect(page.getByTestId('approval-eligible')).toContainText('Ayesha Malik');
    await expect(page.getByTestId('approval-eligible')).toContainText('Rabia Hashmi');

    await decide(page, 'alnoor_treasurer', approvalId, undefined, testInfo);
    await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'pending');
    await expect(page.getByTestId('approval-why')).toHaveAttribute('data-reason', 'already_decided');
    await decide(page, 'alnoor_admin', approvalId, 'Second signatory: quotation checked.');
    await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('approval-decisions').getByTestId('approval-decision')).toHaveCount(2);
    await expect(page.getByTestId('approval-audit')).toContainText('asked for approval');
    await axe(page, testInfo, 'approval-360-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 reference 4: month close — refused late posting, approved reopening, close again', () => {
  test('September refuses a late voucher; Rabia approves the reopening Ayesha asked for; a witnessed count lets it close', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await office(page, '/backoffice/bank/cashbook', 'cashbook-page');
    const late = { accountId: 'cac_anr_office', direction: 'payment', category: 'repairs', amount: '1800', onDate: '2026-09-30', purpose: 'Plumber paid on 30 September (bill found after the close)', counterparty: 'Model Town Plumbing (Demo)', evidence: { name: 'plumber.jpg', kind: 'bill', size: 1000 }, submit: true };
    const refused = await api(page, '/finance/vouchers', 'POST', late);
    expect(refused.ok ? 'posted' : refused.code).toBe('period_closed');

    await as(page, 'alnoor_treasurer', '/backoffice/bank/cashbook?drawer=close&period=2026-09', 'close-drawer');
    const close = page.getByTestId('close-drawer');
    await choose(close, page, 'close-month', /September/);
    await expect(close.getByTestId('close-is-closed')).toBeVisible();
    await expect(close.getByTestId('period-history').locator('[data-action="posting_refused"]')).toHaveCount(1);
    await box(close, 'reopen-reason').fill('A September plumbing bill was found after the close.');
    await close.getByTestId('reopen-request').click();
    const reopen = close.getByTestId('reopen-approval');
    await expect(reopen).toHaveAttribute('data-status', 'pending');
    await axe(page, testInfo, 'close-drawer-reopen-1440-en');
    const approvalId = new URL((await reopen.getByTestId('open-approval').getAttribute('href'))!, BO).searchParams.get('record')!;

    await as(page, 'alnoor_treasurer', `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
    await expect(page.getByTestId('approval-why')).toHaveAttribute('data-reason', 'own_request');
    await decide(page, 'alnoor_admin', approvalId, 'Agreed by the general secretary.');

    await switchTo(page, 'alnoor_accounts');
    const v = await api<{ voucher: { id: string; approvalId: string } }>(page, '/finance/vouchers', 'POST', late);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    await decide(page, 'alnoor_treasurer', v.res.voucher.approvalId);
    await switchTo(page, 'alnoor_accounts');
    await api(page, `/finance/vouchers/${v.res.voucher.id}/post`, 'POST');
    const count = await api<{ id: string }>(page, '/finance/cash-counts', 'POST', { accountId: 'cac_anr_office', denominations: [{ note: '5000', count: 2 }, { note: '1000', count: 3 }, { note: '100', count: 2 }] });

    await as(page, 'alnoor_treasurer', '/backoffice/bank/cashbook?drawer=close', 'close-drawer');
    await choose(close, page, 'close-month', /September/);
    await close.getByTestId('count-witness').first().click();
    await expect(close.locator('[data-key="cash_counted"]')).toHaveAttribute('data-outcome', 'passed');
    await close.getByTestId('close-period').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Close September/ }).click();
    await expect(close.getByTestId('close-is-closed')).toBeVisible();
    expect(count.ok).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 transfers, reminders and printing', () => {
  test('a society transfer: dues refusal, fee invoice, payment, approval, certificate, payer change raised', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice/own/transfers-list', 'ownership-page');
    const created = await api<{ transfer: { id: string } }>(page, '/ownership-transfers', 'POST', { flatId: 'unt_anr_b403', toName: 'Nadia Farooq', toPhone: '+92 399 555 0142', effectiveOn: '2026-12-01', reason: 'Sale deed registered on 20 October 2026' });
    const id = created.ok ? created.res.transfer.id : '';
    await office(page, `/backoffice/own/transfer-review-approval?record=${id}`, 'ownership-workspace');
    await page.getByTestId('ownership-check').click();
    await expect(page.getByTestId('ownership-outstanding')).toHaveAttribute('data-amount', '5700.00');
    await page.getByTestId('ownership-invoice-fee').click();
    await expect(page.getByTestId('ownership-fee-invoice')).toContainText('5,000.00');
    await switchTo(page, 'alnoor_treasurer');
    await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
    // D-46: the accounts officer records the cash; the treasurer counts it and confirms.
    await switchTo(page, 'alnoor_accounts');
    const people = await api<Array<{ payers: Array<{ partyId: string }>; billingAccountId: string }>>(page, '/office-collections/candidates', 'GET', {}, { q: 'B-403' });
    const p = people.ok ? people.res[0]! : null;
    const cash = await api<{ batch: { id: string } }>(page, '/payments/office', 'POST', { accountId: p!.billingAccountId, payerPartyId: p!.payers[0]!.partyId, amount: '10700' });
    await switchTo(page, 'alnoor_treasurer');
    expect(cash.ok && (await api(page, `/office-collections/${cash.res.batch.id}/confirm`, 'POST', { countedCash: '10700' })).ok).toBe(true);
    await as(page, 'alnoor_manager', `/backoffice/own/transfer-review-approval?record=${id}`, 'ownership-workspace');
    await page.getByTestId('ownership-check').click();
    await expect(page.getByTestId('ownership-outstanding')).toHaveAttribute('data-amount', '0.00');
    await as(page, 'alnoor_treasurer', `/backoffice/own/transfer-review-approval?record=${id}`, 'ownership-workspace');
    await page.getByTestId('ownership-approve').click();
    await page.getByTestId('ownership-certificate').click();
    await expect(page.getByTestId('ownership-certificate-issued')).toContainText('ANR-CLR-2026-0001');
    await expect(page.getByTestId('ownership-payer-change')).toHaveAttribute('data-state', 'pending_approval');
    await axe(page, testInfo, 'ownership-workspace-1440-en');
    await office(page, `/backoffice/own/transfer-review-approval?record=${id}&drawer=certificate`, 'certificate-drawer');
    await axe(page, testInfo, 'certificate-drawer-1440-en');
    await office(page, '/backoffice/billing/payer-changes', 'payer-changes');
    await expect(page.getByTestId('payer-change-raised-by').first()).toContainText('ANR-OWT-2026-0001');
    expect(consoleErrors).toEqual([]);
  });

  test('reminders skip pending proofs, wait in quiet hours, and never send twice; the run prints exactly its posted invoices', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_accounts' });
    await office(page, '/backoffice/col/reminders', 'reminders-page');
    await expect(page.getByTestId('reminder-steps')).toContainText('On the due date');
    await axe(page, testInfo, 'reminders-1440-en');
    await page.getByTestId('reminders-send-open').click();
    const drawer = page.getByTestId('send-reminder-drawer');
    await expect(drawer.getByTestId('reminder-row').first()).toBeVisible();
    await expect(drawer.locator('[data-account="ANR-A305"] [data-skip="proof_pending"]').first()).toBeVisible();
    await choose(drawer, page, 'reminder-clock', '22:30');
    await expect(drawer.getByTestId('reminder-quiet')).toBeVisible();
    await expect(drawer.locator('[data-channel="sms"][data-outcome="send"]')).toHaveCount(0);
    await choose(drawer, page, 'reminder-clock', '11:00');
    await axe(page, testInfo, 'send-reminder-drawer-1440-en');
    await drawer.getByTestId('reminder-send').click();
    await expect(drawer.getByTestId('reminder-done')).toHaveAttribute('data-replayed', 'false');
    // The same send again (a double click): nothing is sent twice.
    const history = await api<{ history: Array<{ sendKey: string }> }>(page, '/reminders');
    const key = history.ok ? history.res.history[0]!.sendKey.split('|')[0]! : '';
    const replay = await api<{ replayed: boolean }>(page, '/reminders/send', 'POST', { clock: '11:00', sendKey: key });
    expect(replay.ok && replay.res.replayed).toBe(true);

    await office(page, '/backoffice/billing/runs', 'runs-page');
    const runs = await api<{ runs: Array<{ id: string; state: string }> }>(page, '/billing-runs');
    const runId = runs.ok ? runs.res.runs.find((r) => r.state === 'NOTIFIED')!.id : '';
    await office(page, `/backoffice/billing/runs/${runId}?tab=posting`, 'run-workspace');
    await page.getByTestId('run-print-pack').click();
    const pack = page.getByTestId('print-drawer');
    const count = pack.getByTestId('print-run-count');
    await expect(count).toBeVisible();
    expect(await count.getAttribute('data-invoices')).toBe(await count.getAttribute('data-documents'));
    await expect(pack.getByTestId('print-document').first()).toContainText('Demo document, fictional data');
    await axe(page, testInfo, 'print-pack-drawer-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 delegation and dues notices', () => {
  test('Ayesha delegates vouchers to Rabia, who decides the lift voucher as Ayesha’s delegate; aging prints a notice per liable payer', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await seedSociety(page, { staff: 'alnoor_treasurer' });
    await office(page, '/backoffice/apr/delegation', 'delegation-page');
    const form = page.getByTestId('delegation-form');
    await choose(form, page, 'delegation-to', /Rabia Hashmi/);
    // Cash vouchers are offered ticked; deposits and transfers are added.
    await expect(form.getByTestId('delegation-subject-cash_voucher')).toHaveAttribute('data-selected', 'true');
    await form.getByTestId('delegation-subject-funds_transfer').click();
    await expect(form.getByTestId('delegation-subject-funds_transfer')).toHaveAttribute('data-selected', 'true');
    await box(form, 'delegation-reason').fill('Travelling to Karachi for three days');
    await form.getByTestId('delegation-create').click();
    await expect(page.getByTestId('delegation-row').first()).toHaveAttribute('data-state', 'active');

    // The 7,500 lift voucher needs the treasurer only: Rabia decides it for Ayesha, and the record says so.
    const vouchers = await api<{ items: Array<{ approvalId?: string; amount: { amount: string } }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'submitted' });
    const lift = (vouchers.ok ? vouchers.res.items : []).find((v) => v.amount.amount === '7500.00')!;
    await decide(page, 'alnoor_admin', lift.approvalId!, 'Approved for Ayesha during the trip.');
    await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('approval-decisions')).toContainText('delegate of Ayesha Malik');

    await as(page, 'alnoor_accounts', '/backoffice/col/aging-breakdown', 'aging-page');
    await page.getByTestId('aging-print-notices').click();
    const pack = page.getByTestId('print-drawer');
    await expect(pack.getByTestId('print-document').first()).toContainText('Demo document, fictional data');
    await axe(page, testInfo, 'dues-notices-drawer-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 governance records: policy version, reminder rules, committee minutes', () => {
  test('Rabia drafts policy v2 and cannot approve that draft; Ayesha does; a new reminder rules version; a meeting and its decision are recorded', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_admin' });
    await office(page, '/backoffice/apr/approval-settings', 'policies-page');
    await page.getByTestId('policy-new-draft').click();
    await office(page, '/backoffice/apr/approval-settings?tab=draft', 'policy-draft');
    await page.getByTestId('draft-approver-0-general_secretary').click();
    await choose(page, page, 'draft-required-0', '2');
    await box(page, 'draft-note').fill('Version 2: two signatures on small vouchers too (illustrative)');
    await axe(page, testInfo, 'policy-draft-1440-en');
    await page.getByTestId('draft-save').click();
    await page.getByTestId('draft-submit').click();
    await office(page, '/backoffice/apr/approval-settings?tab=versions', 'policy-versions');
    const pending = page.locator('[data-testid="policy-version"][data-status="pending"]');
    await expect(pending).toHaveCount(1);
    const approvalId = new URL((await pending.getByRole('link').getAttribute('href'))!, BO).searchParams.get('record')!;
    await office(page, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
    await expect(page.getByTestId('approval-why')).toHaveAttribute('data-reason', 'own_request');
    await decide(page, 'alnoor_treasurer', approvalId, 'Agreed at the committee meeting.');
    await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'approved');

    await as(page, 'alnoor_admin', '/backoffice/col/reminders', 'reminders-page');
    await page.getByTestId('reminder-new-version').click();
    await box(page, 'reminder-cap').fill('3');
    await box(page, 'reminder-note').fill('At most three reminders a month');
    await axe(page, testInfo, 'reminder-editor-1440-en');
    await page.getByTestId('reminder-save-activate').click();
    await expect(page.getByTestId('reminder-editor')).toHaveCount(0);
    const rules = await api<{ policies: Array<{ version: number; status: string; monthlyCap: number }> }>(page, '/reminders');
    expect(rules.ok && rules.res.policies[0]).toMatchObject({ version: 2, status: 'active', monthlyCap: 3 });

    await office(page, '/backoffice/committee?tab=meetings', 'record-meeting');
    const before = await page.getByTestId('committee-meeting').count();
    await box(page, 'meeting-title-input').fill('Committee meeting, 26 October');
    await page.getByTestId('record-meeting').getByLabel('Attending').fill('Tariq Mehmood، Rabia Hashmi, Ayesha Malik');
    await box(page, 'meeting-minutes').fill('Quotations for the lift door sensor reviewed.');
    await axe(page, testInfo, 'committee-meeting-form-1440-en');
    await page.getByTestId('meeting-record').click();
    await expect(page.getByTestId('committee-meeting')).toHaveCount(before + 1);
    // Names split on the Latin and the Urdu comma alike.
    await expect(page.getByTestId('committee-meeting').filter({ hasText: 'Committee meeting, 26 October' })).toContainText('3 attending');
    await office(page, '/backoffice/committee?tab=decisions', 'record-decision');
    await box(page, 'decision-subject').fill('Lift door sensor repair by Lahore Lift Services (Demo)');
    await page.getByTestId('decision-record').click();
    await expect(page.getByTestId('committee-decisions')).toContainText('Lift door sensor repair');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.1 access: features, roles and other organisations', () => {
  test('the guard has no finance; the secretary reads but does not prepare; other organisations are told what their plan lacks', async ({ page, consoleErrors }) => {
    await seedSociety(page, { staff: 'alnoor_guard' });
    await page.goto(`${BO}/backoffice/bank/cashbook`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await expect(page.getByTestId('cashbook-page')).toHaveCount(0);
    await expect(page.locator('nav').getByText('Society finance')).toHaveCount(0);
    await as(page, 'alnoor_admin', '/backoffice/bank/cashbook', 'cashbook-page');
    await expect(page.getByTestId('new-voucher')).toHaveCount(0);
    const prepare = await api(page, '/finance/vouchers', 'POST', {});
    expect(prepare.ok ? 'allowed' : prepare.status).toBe(403);
    await become(page, 'backoffice', 'society_admin');
    // Shalimar Court: residents only from 1 November.
    await page.goto(`${BO}/backoffice/committee`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'module_not_licensed');
    await expect(page.getByTestId('committee-page')).toHaveCount(0);
    const other = await api(page, '/finance/cashbook');
    expect(other.ok ? 'allowed' : other.status).toBe(403);
    // Larkspur: banking and residents licensed, but none of the S.1 features.
    await become(page, 'backoffice', 'manager');
    await page.goto(`${BO}/backoffice/bank/cashbook`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'feature_not_licensed');
    await expect(page.getByTestId('cashbook-page')).toHaveCount(0);
    expect(consoleErrors.filter((e) => !e.includes('403'))).toEqual([]);
  });
});

test.describe('S.1 phones, Urdu, text size and axe', () => {
  const pages: Array<[string, string, PersonaId]> = [
    ['/backoffice/fin/finance-dashboard', 'finance-dashboard', 'alnoor_treasurer'],
    ['/backoffice/bank/cashbook', 'cashbook-page', 'alnoor_treasurer'],
    ['/backoffice/bank/transfers', 'transfers-page', 'alnoor_manager'],
    ['/backoffice/bank/bank-accounts', 'bank-accounts-page', 'alnoor_treasurer'],
    ['/backoffice/fin/office-collections', 'office-collections-page', 'alnoor_accounts'],
    ['/backoffice/apr/my-approvals', 'approvals-inbox', 'alnoor_treasurer'],
    ['/backoffice/apr/approval-settings', 'policies-page', 'alnoor_admin'],
    ['/backoffice/apr/delegation', 'delegation-page', 'alnoor_treasurer'],
    ['/backoffice/committee', 'committee-page', 'alnoor_admin'],
    ['/backoffice/col/reminders', 'reminders-page', 'alnoor_accounts'],
    ['/backoffice/own/transfers-list', 'ownership-page', 'alnoor_manager'],
    ['/backoffice/bank/bank-account-360-workspace?record=ben_anr_main', 'account-workspace', 'alnoor_treasurer'],
    // The seeded lift voucher's approval (the fourth October voucher), waiting for the treasurer.
    ['/backoffice/apr/approval-360-view?record=apr_anr_0004', 'approval-workspace', 'alnoor_treasurer'],
    ['/backoffice/committee?tab=meetings', 'record-meeting', 'alnoor_admin'],
    ['/backoffice/committee?tab=decisions', 'record-decision', 'alnoor_admin'],
    ['/backoffice/bank/cashbook?drawer=voucher', 'voucher-drawer', 'alnoor_accounts'],
    ['/backoffice/bank/cashbook?drawer=count', 'count-drawer', 'alnoor_accounts'],
    ['/backoffice/bank/cashbook?drawer=close', 'close-drawer', 'alnoor_treasurer'],
    ['/backoffice/bank/transfers?drawer=new', 'new-transfer-drawer', 'alnoor_manager'],
    ['/backoffice/bank/transfers?drawer=statement', 'demo-statement-drawer', 'alnoor_accounts'],
  ];
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    test(`every S.1 screen at 390, 768 and 1440 px and at 320 px with 200 % text, ${locale}: no sideways scroll, no axe violation`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(540_000);
      await seedSociety(page, { staff: 'alnoor_treasurer', locale });
      for (const [path, ready, persona] of pages) {
        await page.setViewportSize(VIEWPORTS.phone);
        await as(page, persona, path, ready);
        for (const vp of ['phone', 'tablet', 'desktop'] as const) {
          await page.setViewportSize(VIEWPORTS[vp]);
          await expect(page.getByTestId(ready)).toBeVisible();
          expect(await overflowOf(page), `${path} ${VIEWPORTS[vp].width}`).toBeLessThanOrEqual(0);
          await axe(page, testInfo, `${ready}-${VIEWPORTS[vp].width}-${locale}`);
        }
        await page.setViewportSize(VIEWPORTS.reflow);
        await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '2'));
        expect(await overflowOf(page), `${path} 320 at 200 %`).toBeLessThanOrEqual(0);
        await page.evaluate(() => document.documentElement.style.removeProperty('--text-scale'));
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});

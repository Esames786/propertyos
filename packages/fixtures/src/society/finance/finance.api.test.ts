import {
  ApiError,
  type ApprovalDetail,
  type ApprovalInbox,
  type BatchDetail,
  type BillingAccountDetail,
  type CashbookView,
  type CashVoucher,
  type ChequeDetail,
  type CloseChecklist,
  type CollectionCandidate,
  type DemoStatementFile,
  type DemoStatementOptions,
  type FinanceOverview,
  type ModuleSelection,
  type OfficeCashRecorded,
  type OwnershipTransferDetail,
  type PortalAccessList,
  type PaymentDetail,
  type PolicyOverview,
  type ReminderPreview,
  type ReminderSendResult,
  type TransferDetail,
  type VoucherDetail,
} from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { directoryTenant } from '../../tenant-directory';

/**
 * Gate S.1 through the fail-closed mock API: the four reference experiences of the V3.2 plan and
 * the money rules behind them, with the people of the Al-Noor storyline (principal ids decide every
 * maker-checker check). Amounts are the fixture's; policy thresholds are illustrative.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

function session() {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_accounts';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
  };
  return api;
}
type Api = ReturnType<typeof session>;

const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.problem;
    throw e;
  }
  throw new Error('expected a refusal');
};

const SITE = '/sites/site_alnoor';
const MAIN = 'ben_anr_main';
const OFFICE = 'cac_anr_office';
const PETTY = 'cac_anr_petty';
const amount = (v: { amount: string }) => v.amount;
const closing = async (s: Api, account: string, period = '2026-10') => amount((await s.get<CashbookView>('/finance/cashbook', { account, period })).totals.closing);

/** Imports the demo helper's sample statement for an account (the helper never settles anything). */
async function importSample(s: Api, account: string, choose: (item: DemoStatementOptions['items'][number]) => string) {
  const options = await s.as('alnoor_accounts').get<DemoStatementOptions>('/finance/demo-statement', { account });
  const file = await s.post<DemoStatementFile>('/finance/demo-statement', { accountId: account, choices: options.items.map((i) => ({ id: i.id, kind: i.kind, ...(i.leg ? { leg: i.leg } : {}), variant: choose(i) })) });
  expect(file.content).toContain('#sample=Demo document, fictional data');
  await s.post('/bank/statements', { beneficiaryId: account, fileName: file.fileName, content: file.content, from: file.from, to: file.to });
  return file;
}

async function approve(s: Api, persona: string, approvalId: string, reason = 'Checked against the evidence.') {
  return s.as(persona).post<ApprovalDetail>(`/approvals/${approvalId}/decide`, { decision: 'approve', reason });
}

async function enableOfficeMethods(s: Api) {
  await s.as('alnoor_treasurer').patch(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true });
  await s.patch(`${SITE}/cheque-rules`, { enabled: true, payableTo: 'Al-Noor Residency Owners’ Association (Demo)', depositAccountId: MAIN, maxPostDatedDays: 0 });
}

async function payerOf(s: Api, q: string) {
  const [c] = await s.as('alnoor_accounts').get<CollectionCandidate[]>('/office-collections/candidates', { q });
  return { accountId: c!.billingAccountId, partyId: c!.payers[0]!.partyId, open: c!.payers[0]!.open.amount };
}

describe('S.1 seed: the cashbook is derived from settled sources only', () => {
  it('handover balances, September closed, October from vouchers and verified payments (no stored rows)', async () => {
    const s = session();
    const all = await s.get<CashbookView>('/finance/cashbook', { period: '2026-10' });
    expect([amount(all.totals.opening), amount(all.totals.receipts), amount(all.totals.payments), amount(all.totals.closing)]).toEqual(['302900.00', '15100.00', '4350.00', '313650.00']);
    expect(all.periods.find((p) => p.period === '2026-09')?.state).toBe('closed');
    expect(await closing(s, PETTY)).toBe('650.00');
    expect(await closing(s, OFFICE)).toBe('15000.00');
    expect(await closing(s, MAIN)).toBe('12600.00');
    expect(await closing(s, 'ben_anr_committee')).toBe('285400.00');
    // Every line is a source event, counted once, opening its record.
    expect(new Set(all.lines.map((l) => l.key)).size).toBe(all.lines.length);
    expect(all.lines.map((l) => l.source).sort()).toEqual(['cash_voucher', 'cash_voucher', 'cash_voucher', 'payment', 'payment', 'payment']);
    // The lift voucher waits for approval: listed as pending, never in a balance.
    expect(all.pending.some((p) => p.kind === 'awaiting_approval' && p.describe.values?.purpose?.includes('Lift'))).toBe(true);
    const overview = await s.as('alnoor_treasurer').get<FinanceOverview>('/finance/overview');
    expect(overview.closing.amount.amount).toBe('313650.00');
    expect(overview.pendingVerification.count).toBe(6);
    expect(overview.approvals.yours).toBe(1);
    // Billed ≠ collected ≠ cash received ≠ bank settled: four different numbers.
    expect([overview.ladder.billed.amount.amount, overview.ladder.collected.amount.amount, overview.ladder.cashReceived.amount.amount, overview.ladder.bankSettled.amount.amount]).toEqual(['49100.00', '12600.00', '0.00', '12600.00']);
  });
});

describe('Reference 1: a cash deposit — instruction, witnessed slip, matched statement line', () => {
  it('approval is not settlement; the cash leg needs a witness; the bank leg a full match; the cashbook moves only at each settlement', async () => {
    const s = session();
    const prepared = await s.as('alnoor_manager').post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '10000', purpose: 'Bank the office cash of the week', idempotencyKey: 'dep-1' });
    expect(prepared.transfer.status).toBe('awaiting_approval');
    // A repeat of the same request creates nothing new.
    const again = await s.post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '10000', purpose: 'Bank the office cash of the week', idempotencyKey: 'dep-1' });
    expect(again.transfer.id).toBe(prepared.transfer.id);
    // The preparer cannot approve (no decision right), and the rule names the treasurer.
    expect((await problem(s.post(`/approvals/${prepared.transfer.approvalId}/decide`, { decision: 'approve', reason: 'ok' }))).status).toBe(403);
    await approve(s, 'alnoor_treasurer', prepared.transfer.approvalId!);
    const approved = await s.as('alnoor_accounts').get<TransferDetail>(`/finance/transfers/${prepared.transfer.id}`);
    expect(approved.transfer.status).toBe('approved_instruction');
    expect(await closing(s, OFFICE)).toBe('15000.00');
    // The bank cannot show cash that has not left the office.
    expect((await problem(s.post(`/finance/transfers/${prepared.transfer.id}/legs/in/match`, { bankLineId: 'bnl_anr_0001' }))).code).toBe('cash_leg_first');
    // Cash leg: recorded by the depositor, witnessed by someone else.
    await s.as('alnoor_manager').post(`/finance/transfers/${prepared.transfer.id}/legs/out/slip`, { slipNo: 'DS-0412', on: '2026-10-26' });
    expect((await problem(s.post(`/finance/transfers/${prepared.transfer.id}/legs/out/witness`))).status).toBe(403);
    const witnessed = await s.as('alnoor_treasurer').post<TransferDetail>(`/finance/transfers/${prepared.transfer.id}/legs/out/witness`);
    expect(witnessed.transfer.status).toBe('in_transit');
    expect(await closing(s, OFFICE)).toBe('5000.00');
    expect(amount((await s.get<CashbookView>('/finance/cashbook')).inTransit)).toBe('10000.00');
    expect(await closing(s, MAIN)).toBe('12600.00');
    // Bank leg: the sample statement (fictional) imported for the verified account, then matched in full.
    await importSample(s, MAIN, () => 'full');
    const detail = await s.as('alnoor_accounts').get<TransferDetail>(`/finance/transfers/${prepared.transfer.id}`);
    const line = detail.candidates.in.find((c) => c.strength === 'full')!;
    expect(line.reasons).toEqual(['amount', 'date', 'reference', 'name']);
    // The preparer may not confirm their own instruction's settlement.
    expect((await problem(s.as('alnoor_manager').post(`/finance/transfers/${prepared.transfer.id}/legs/in/match`, { bankLineId: line.bankLine.id }))).status).toBe(403);
    const settled = await s.as('alnoor_accounts').post<TransferDetail>(`/finance/transfers/${prepared.transfer.id}/legs/in/match`, { bankLineId: line.bankLine.id });
    expect(settled.transfer.status).toBe('settled');
    expect(await closing(s, MAIN)).toBe('22600.00');
    expect(amount((await s.get<CashbookView>('/finance/cashbook')).inTransit)).toBe('0.00');
    // The line proved one leg; it never proves anything else (a proof or another leg).
    const used = (await s.get<{ lines: Array<{ id: string; state: string; settlementId?: string }> }>('/bank/feed')).lines.find((l) => l.id === line.bankLine.id)!;
    expect([used.state, !!used.settlementId]).toEqual(['matched', true]);
    const book = await s.get<CashbookView>('/finance/cashbook', { account: MAIN });
    expect(book.lines.filter((l) => l.source === 'transfer_leg')).toHaveLength(1);
  });

  it('a partly matching line settles only through a second person’s exception', async () => {
    const s = session();
    const t = await s.as('alnoor_manager').post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '2000', purpose: 'Small deposit' });
    await approve(s, 'alnoor_treasurer', t.transfer.approvalId!);
    await s.as('alnoor_manager').post(`/finance/transfers/${t.transfer.id}/legs/out/slip`, { slipNo: 'DS-0413' });
    await s.as('alnoor_treasurer').post(`/finance/transfers/${t.transfer.id}/legs/out/witness`);
    await importSample(s, MAIN, () => 'partial');
    const d = await s.as('alnoor_accounts').get<TransferDetail>(`/finance/transfers/${t.transfer.id}`);
    const partial = d.candidates.in.find((c) => c.reasons.includes('amount'))!;
    expect(partial.missing).toContain('reference');
    expect((await problem(s.post(`/finance/transfers/${t.transfer.id}/legs/in/match`, { bankLineId: partial.bankLine.id }))).code).toBe('exception_required');
    await s.post(`/finance/transfers/${t.transfer.id}/legs/in/exception`, { bankLineId: partial.bankLine.id, reason: 'The bank printed its own reference; amount, date and depositor agree.' });
    // The requester cannot decide it (and has no right to); the treasurer can.
    expect((await problem(s.post(`/finance/transfers/${t.transfer.id}/legs/in/exception/approve`))).status).toBe(403);
    const done = await s.as('alnoor_treasurer').post<TransferDetail>(`/finance/transfers/${t.transfer.id}/legs/in/exception/approve`, { note: 'Agreed.' });
    expect(done.transfer.status).toBe('settled');
    expect(done.settlements.find((x) => x.leg === 'in')?.exception?.approvedByName).toBe('Ayesha Malik');
  });

  it('money never moves to another entity or to an account the society does not have', async () => {
    const s = session();
    expect((await problem(s.as('alnoor_manager').post('/finance/transfers', { kind: 'transfer', fromAccountId: MAIN, toAccountId: 'ben_platform_saas', amount: '100', purpose: 'Pay the platform' }))).code).toBe('account_unknown');
    expect((await problem(s.post('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '999999', purpose: 'More than the box holds' }))).code).toBe('insufficient_funds');
  });
});

describe('Reference 2: bulk office collection — cash witnessed, cheques pending until cleared', () => {
  it('Saba collects 4 cash lines and 1 cheque; Ayesha confirms; the cheque clears on its line, another is returned, the cleared one is reversed', async () => {
    const s = session();
    await enableOfficeMethods(s);
    const lines = await Promise.all(['A-404', 'B-306', 'A-502', 'B-501', 'A-101'].map((q) => payerOf(s, q)));
    const [a404, b306, a502, b501, a101] = lines;
    const batch = await s.as('alnoor_accounts').post<BatchDetail>('/office-collections', { idempotencyKey: 'batch-1' });
    // Only the person liable on the account: another flat's payer is refused.
    const wrong = await problem(s.patch(`/office-collections/${batch.batch.id}/lines`, { lines: [{ billingAccountId: a404!.accountId, payerPartyId: b306!.partyId, method: 'office_cash', amount: '100' }] }));
    expect(wrong.code).toBe('payer_not_liable');
    const filled =await s.patch<BatchDetail>(`/office-collections/${batch.batch.id}/lines`, {
      lines: [
        { billingAccountId: a404!.accountId, payerPartyId: a404!.partyId, method: 'office_cash', amount: '8400' },
        { billingAccountId: b306!.accountId, payerPartyId: b306!.partyId, method: 'office_cash', amount: '12600' },
        { billingAccountId: a502!.accountId, payerPartyId: a502!.partyId, method: 'office_cash', amount: '6000' },
        { billingAccountId: b501!.accountId, payerPartyId: b501!.partyId, method: 'office_cash', amount: '5700' },
        { billingAccountId: a101!.accountId, payerPartyId: a101!.partyId, method: 'cheque', amount: '5200', cheque: { drawerBank: 'Demo Bank', number: '004512', date: '2026-10-26' } },
      ],
    });
    expect(filled.problems).toEqual([]);
    expect([filled.totals.cash.amount, filled.totals.cheques.amount]).toEqual(['32700.00', '5200.00']);
    expect((await problem(s.post(`/office-collections/${batch.batch.id}/submit`, { declaredCash: '32000' }))).code).toBe('count_mismatch');
    await s.post(`/office-collections/${batch.batch.id}/submit`, { declaredCash: '32700' });
    // The collector cannot confirm their own batch.
    expect((await problem(s.post(`/office-collections/${batch.batch.id}/confirm`, { countedCash: '32700' }))).status).toBe(403);
    const confirmed = await s.as('alnoor_treasurer').post<BatchDetail>(`/office-collections/${batch.batch.id}/confirm`, { countedCash: '32700' });
    expect(confirmed.batch.status).toBe('confirmed');
    const cash = confirmed.batch.lines.filter((l) => l.outcome?.kind === 'payment');
    expect(cash).toHaveLength(4);
    const chequeLine = confirmed.batch.lines.find((l) => l.method === 'cheque')!;
    expect(chequeLine.outcome).toMatchObject({ kind: 'cheque', status: 'received' });
    // Confirming again changes nothing (no second set of payments).
    await s.post(`/office-collections/${batch.batch.id}/confirm`, { countedCash: '32700' });
    const pay = await s.get<PaymentDetail>(`/payments/${(cash[0]!.outcome as { paymentId: string }).paymentId}`);
    expect(pay.payment).toMatchObject({ verification: 'witnessed', verifiedByName: 'Saba Javed', witness: { byName: 'Ayesha Malik' }, method: 'office_cash' });
    // Each payment settled only its own payer's lines on its own account.
    expect(new Set(pay.payment.allocations.map((a) => a.unitCode))).toEqual(new Set(['A-404']));
    expect(await closing(s, OFFICE)).toBe('47700.00');
    // The cheque is only acknowledged: A-101 still owes everything, and no receipt exists for it.
    const chequeId = (chequeLine.outcome as { chequeId: string }).chequeId;
    expect((await s.get<BillingAccountDetail>(`/billing-accounts/${a101!.accountId}`)).balance.amount).toBe('5200.00');
    const received = await s.get<ChequeDetail>(`/cheques/${chequeId}`);
    expect(received.cheque.receiptRef).toBeUndefined();
    // A duplicate of the same cheque is refused.
    expect((await problem(s.post('/cheques', { accountId: a101!.accountId, payerPartyId: a101!.partyId, amount: '5200', drawerBank: 'DEMO BANK', number: '004512', date: '2026-10-26' }))).code).toBe('cheque_duplicate');
    // Deposited, then cleared by its own credit line.
    await s.as('alnoor_accounts').post(`/cheques/${chequeId}/deposit`, { slipNo: 'CD-0091' });
    await importSample(s, MAIN, (i) => (i.kind === 'cheque' ? 'full' : 'skip'));
    const deposited = await s.get<ChequeDetail>(`/cheques/${chequeId}`);
    const credit = deposited.candidates.find((c) => c.strength === 'full')!;
    const cleared = await s.post<ChequeDetail>(`/cheques/${chequeId}/clear`, { bankLineId: credit.bankLine.id });
    expect(cleared.cheque.status).toBe('cleared');
    expect(cleared.cheque.receiptRef).toMatch(/^ANR-RCT-2026-/);
    expect((await s.get<BillingAccountDetail>(`/billing-accounts/${a101!.accountId}`)).balance.amount).toBe('0.00');
    expect(await closing(s, MAIN)).toBe('17800.00');

    // Another cheque is returned by the bank: nothing was settled, nothing changes.
    const b204 = await payerOf(s, 'B-204');
    const single = await s.post<ChequeDetail>('/cheques', { accountId: b204.accountId, payerPartyId: b204.partyId, amount: '4200', drawerBank: 'Demo Bank', number: '778801', date: '2026-10-26' });
    await s.post(`/cheques/${single.cheque.id}/deposit`, { slipNo: 'CD-0092' });
    const before = (await s.get<BillingAccountDetail>(`/billing-accounts/${b204.accountId}`)).balance.amount;
    const returned = await s.post<ChequeDetail>(`/cheques/${single.cheque.id}/return`, { reason: 'Insufficient funds (bank memo)', memo: 'R-01' });
    expect(returned.cheque.status).toBe('returned');
    expect((await s.get<BillingAccountDetail>(`/billing-accounts/${b204.accountId}`)).balance.amount).toBe(before);
    expect(await closing(s, MAIN)).toBe('17800.00');

    // The cleared cheque comes back after clearing: the bank's debit is the evidence, a second person approves.
    await importSample(s, MAIN, (i) => (i.kind === 'cheque_return' ? 'returned_after_clearing' : 'skip'));
    const back = await s.get<ChequeDetail>(`/cheques/${chequeId}`);
    const debit = back.candidates.find((c) => c.bankLine.direction === 'debit')!;
    const asked = await s.post<ChequeDetail>(`/cheques/${chequeId}/reversal-request`, { bankLineId: debit.bankLine.id, reason: 'Returned after clearing: account closed' });
    expect((await problem(approve(s, 'alnoor_accounts', asked.cheque.reversal!.approvalId))).status).toBe(403);
    await approve(s, 'alnoor_treasurer', asked.cheque.reversal!.approvalId);
    const reversed = await s.as('alnoor_accounts').get<ChequeDetail>(`/cheques/${chequeId}`);
    expect(reversed.cheque.status).toBe('reversed');
    const paid = await s.get<PaymentDetail>(`/payments/${reversed.cheque.paymentId}`);
    expect(paid.payment.reversal?.approvedByName).toBe('Ayesha Malik');
    expect(paid.receipt.reversed?.reason).toContain('account closed');
    // The lines reopen; the cashbook shows the reversal on its own date (the payment line never changes).
    expect((await s.get<BillingAccountDetail>(`/billing-accounts/${a101!.accountId}`)).balance.amount).toBe('5200.00');
    expect(await closing(s, MAIN)).toBe('12600.00');
  });

  it('cash needs a second person: the collector who also confirms is refused, and a count that differs is refused', async () => {
    const s = session();
    await enableOfficeMethods(s);
    const p = await payerOf(s, 'A-305');
    const b = await s.as('alnoor_treasurer').post<BatchDetail>('/office-collections');
    await s.patch(`/office-collections/${b.batch.id}/lines`, { lines: [{ billingAccountId: p.accountId, payerPartyId: p.partyId, method: 'office_cash', amount: '4200' }] });
    const d = await s.get<BatchDetail>(`/office-collections/${b.batch.id}`);
    // A proof is already waiting for this payer: shown, never silently taken twice.
    expect(d.warnings.map((w) => w.code)).toContain('proof_pending');
    await s.post(`/office-collections/${b.batch.id}/submit`, { declaredCash: '4200' });
    expect((await problem(s.post(`/office-collections/${b.batch.id}/confirm`, { countedCash: '4200' }))).code).toBe('maker_checker_required');
  });
});

describe('Reference 3: month close — checklist, refused late posting, approved reopening', () => {
  it('October is blocked; a September posting is refused; the reopening is approved by someone else; September closes again after a witnessed count', async () => {
    const s = session();
    const october = await s.as('alnoor_treasurer').get<CloseChecklist>('/finance/periods/2026-10/checklist');
    const blocking = october.checks.filter((c) => c.outcome === 'blocking').map((c) => c.key);
    expect(blocking).toEqual(expect.arrayContaining(['period_ended', 'unreconciled_lines', 'proofs_waiting', 'vouchers_open']));
    expect((await problem(s.post('/finance/periods/2026-10/close'))).code).toBe('blocking_checks');

    const late = { accountId: OFFICE, direction: 'payment', category: 'repairs', amount: '1800', onDate: '2026-09-30', purpose: 'Plumber paid on 30 September (bill found after the close)', counterparty: 'Model Town Plumbing (Demo)', evidence: { name: 'plumber-2909.jpg', kind: 'bill', size: 120000 }, submit: true };
    expect((await problem(s.as('alnoor_accounts').post('/finance/vouchers', late))).code).toBe('period_closed');

    const asked = await s.as('alnoor_treasurer').post<CloseChecklist>('/finance/periods/2026-09/reopen-request', { reason: 'A September plumbing bill was found after the close.' });
    expect(asked.period.history.map((h) => h.action)).toEqual(['closed', 'posting_refused', 'reopen_requested']);
    const reopenId = asked.reopenApproval!.id;
    expect((await problem(approve(s, 'alnoor_treasurer', reopenId))).code).toBe('decide_own_request');
    await approve(s, 'alnoor_admin', reopenId, 'Agreed by the general secretary.');
    expect((await s.get<CloseChecklist>('/finance/periods/2026-09/checklist')).period.state).toBe('reopened');

    const v = await s.as('alnoor_accounts').post<VoucherDetail>('/finance/vouchers', late);
    await approve(s, 'alnoor_treasurer', v.voucher.approvalId!);
    await s.as('alnoor_accounts').post(`/finance/vouchers/${v.voucher.id}/post`);
    expect(await closing(s, OFFICE, '2026-09')).toBe('10700.00');

    // The handover count no longer agrees with September's books: a new witnessed count is needed.
    const sept = await s.as('alnoor_treasurer').get<CloseChecklist>('/finance/periods/2026-09/checklist');
    expect(sept.checks.find((c) => c.key === 'cash_counted')?.outcome).toBe('blocking');
    const count = await s.as('alnoor_accounts').post<{ id: string; expected: { amount: string } }>('/finance/cash-counts', { accountId: OFFICE, denominations: [{ note: '5000', count: 2 }, { note: '1000', count: 3 }, { note: '100', count: 2 }] });
    expect(count.expected.amount).toBe('13200.00');
    await s.as('alnoor_treasurer').post(`/finance/cash-counts/${count.id}/witness`);
    const closed = await s.post<CloseChecklist>('/finance/periods/2026-09/close');
    expect(closed.period.state).toBe('closed');
    expect((await problem(s.as('alnoor_accounts').post('/finance/vouchers', { ...late, amount: '100' }))).code).toBe('period_closed');
  });
});

describe('Reference 4: committee approvals — policy evaluation, independent decisions, delegation', () => {
  it('a 12,000 voucher needs the treasurer and the secretary; nobody approves twice or their own', async () => {
    const s = session();
    const v = await s.as('alnoor_accounts').post<VoucherDetail>('/finance/vouchers', { accountId: OFFICE, direction: 'payment', category: 'repairs', amount: '12000', onDate: '2026-10-26', purpose: 'Water pump motor rewinding', counterparty: 'Gulberg Electric Works (Demo)', evidence: { name: 'pump-quote.pdf', kind: 'quotation', size: 90000 }, submit: true });
    const detail = await s.as('alnoor_treasurer').get<ApprovalDetail>(`/approvals/${v.voucher.approvalId}`);
    expect(detail.request.rule.id).toBe('rul_v1_voucher_large');
    expect(detail.evaluation.eligible.map((e) => e.name).sort()).toEqual(['Ayesha Malik', 'Rabia Hashmi']);
    const one = await approve(s, 'alnoor_treasurer', v.voucher.approvalId!);
    expect([one.request.status, one.evaluation.remaining]).toEqual(['pending', 1]);
    expect((await problem(approve(s, 'alnoor_treasurer', v.voucher.approvalId!))).code).toBe('decide_already_decided');
    const two = await approve(s, 'alnoor_admin', v.voucher.approvalId!);
    expect(two.request.status).toBe('approved');
    expect((await s.as('alnoor_accounts').get<VoucherDetail>(`/finance/vouchers/${v.voucher.id}`)).voucher.status).toBe('approved');
  });

  it('a delegate approves within the delegation, never a request that pays themselves', async () => {
    const s = session();
    await s.as('alnoor_treasurer').post('/delegations', { toPrincipalId: 'usr_anr_r0003', subjects: ['cash_voucher'], from: '2026-10-26', to: '2026-11-02', reason: 'Treasurer travelling' });
    const v = await s.as('alnoor_accounts').post<VoucherDetail>('/finance/vouchers', { accountId: PETTY, direction: 'payment', category: 'office_supplies', amount: '300', onDate: '2026-10-26', purpose: 'Printer paper', counterparty: 'Stationers (Demo)', evidence: { name: 'paper.jpg', kind: 'bill', size: 1000 }, submit: true });
    const decided = await approve(s, 'alnoor_admin', v.voucher.approvalId!);
    expect(decided.request.decisions[0]!.as).toMatchObject({ kind: 'delegate', forName: 'Ayesha Malik', office: 'treasurer' });
    // Rabia's own reimbursement: Rabia is named in it, so cannot approve it, as delegate or otherwise.
    const own = await s.as('alnoor_accounts').post<VoucherDetail>('/finance/vouchers', { accountId: PETTY, direction: 'payment', category: 'office_supplies', amount: '250', onDate: '2026-10-26', purpose: 'Reimburse the secretary for notices printed', counterparty: 'Rabia Hashmi', counterpartyPartyId: 'pty_anr_0010', evidence: { name: 'print.jpg', kind: 'receipt', size: 1000 }, submit: true });
    expect((await problem(approve(s, 'alnoor_admin', own.voucher.approvalId!))).code).toBe('decide_conflict_of_interest');
    await approve(s, 'alnoor_treasurer', own.voucher.approvalId!);
  });

  it('a draft policy never governs its own approval, and its author cannot approve it', async () => {
    const s = session();
    const drafted = await s.as('alnoor_admin').post<PolicyOverview>('/approval-policies');
    const draft = drafted.versions.find((v) => v.status === 'draft')!;
    // The draft tries to make the secretary (its author) the only approver of policies.
    const rules = draft.rules.map((r) => (r.subject === 'approval_policy' ? { ...r, approvers: [{ kind: 'office', office: 'general_secretary' }] } : r)).map((r) => ({ ...r, minAmount: r.minAmount?.amount, maxAmount: r.maxAmount?.amount }));
    await s.patch(`/approval-policies/${draft.id}`, { rules, effectiveFrom: '2026-11-01', note: 'Secretary approves policy changes' });
    const submitted = await s.post<PolicyOverview>(`/approval-policies/${draft.id}/submit`);
    const pending = submitted.versions.find((v) => v.id === draft.id)!;
    const request = await s.get<ApprovalDetail>(`/approvals/${pending.approvalId}`);
    expect(request.request.rule.id).toBe('rul_v1_policy');
    expect(request.request.policy.version).toBe(1);
    expect((await problem(approve(s, 'alnoor_admin', pending.approvalId!))).code).toBe('decide_own_request');
    await approve(s, 'alnoor_treasurer', pending.approvalId!);
    const after = await s.get<PolicyOverview>('/approval-policies');
    expect(after.versions.find((v) => v.id === draft.id)?.status).toBe('active');
    // Version 1 still governs today; version 2 from 1 November.
    expect(after.active.version).toBe(1);
  });

  it('the inbox lists S.1 requests and the C.1/C.2 approvals that keep their own maker-checker', async () => {
    const s = session();
    const inbox = await s.as('alnoor_treasurer').get<ApprovalInbox>('/approvals');
    expect(inbox.mine.map((r) => r.subject)).toEqual(['cash_voucher']);
    const saba = await s.as('alnoor_accounts').get<ApprovalInbox>('/approvals');
    expect(saba.mine).toEqual([]);
    expect(saba.requested.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Society transfer and clearance (OWN-003/004/006)', () => {
  it('dues refusal → fee invoice → payment → approval → certificate → payer change in BILL-017', async () => {
    const s = session();
    await enableOfficeMethods(s);
    // Resident app access of B-403 before the transfer (D.1 RES-007).
    const accessOf = async () => (await s.as('alnoor_manager').get<PortalAccessList>('/portal-access')).rows.filter((r) => r.flats.some((x) => x.flatCode === 'B-403') || r.name === 'Nadia Farooq').map((r) => ({ name: r.name, status: r.status, flats: r.flats }));
    const accessBefore = await accessOf();
    expect(accessBefore.length).toBeGreaterThan(0);
    const t = await s.as('alnoor_manager').post<OwnershipTransferDetail>('/ownership-transfers', { flatId: 'unt_anr_b403', toName: 'Nadia Farooq', toPhone: '+92 399 555 0142', effectiveOn: '2026-12-01', reason: 'Sale deed registered on 20 October 2026' });
    const blocked = await s.post<OwnershipTransferDetail>(`/ownership-transfers/${t.transfer.id}/dues-check`);
    expect([blocked.transfer.status, blocked.transfer.dues!.outstanding.amount]).toEqual(['dues_blocked', '5700.00']);
    expect((await problem(s.as('alnoor_treasurer').post(`/ownership-transfers/${t.transfer.id}/approve`))).code).toBe('balance_not_zero');
    const fee = await s.as('alnoor_manager').post<OwnershipTransferDetail>(`/ownership-transfers/${t.transfer.id}/fee-invoice`);
    expect(fee.feeInvoice!.total.amount).toBe('5000.00');
    expect(fee.transfer.fee!.bylawRef).toContain('Bylaw 14(2)');
    const p = await payerOf(s, 'B-403');
    expect(p.open).toBe('10700.00');
    const cash = await s.as('alnoor_accounts').post<OfficeCashRecorded>('/payments/office', { accountId: p.accountId, payerPartyId: p.partyId, amount: '10700' });
    // D-46: cash not yet counted by a second person clears nothing.
    const stillOwed = await s.as('alnoor_manager').post<OwnershipTransferDetail>(`/ownership-transfers/${t.transfer.id}/dues-check`);
    expect([stillOwed.transfer.status, stillOwed.transfer.dues!.outstanding.amount]).toEqual(['fee_invoiced', '10700.00']);
    await s.as('alnoor_treasurer').post(`/office-collections/${cash.batch.id}/confirm`, { countedCash: '10700' });
    await s.as('alnoor_manager').post(`/ownership-transfers/${t.transfer.id}/dues-check`);
    // The person who requested the transfer never approves it.
    expect((await problem(s.post(`/ownership-transfers/${t.transfer.id}/approve`))).status).toBe(403);
    await s.as('alnoor_treasurer').post(`/ownership-transfers/${t.transfer.id}/approve`, { note: 'Clear.' });
    const done = await s.post<OwnershipTransferDetail>(`/ownership-transfers/${t.transfer.id}/certificate`);
    expect(done.transfer.status).toBe('completed');
    expect(done.transfer.certificate!.ref).toBe('ANR-CLR-2026-0001');
    const changes = await s.get<Array<{ id: string; state: string; flatCode: string; from: string; raisedBy?: { ref: string }; requestedBy: string }>>('/payer-changes');
    const raised = changes.find((c) => c.raisedBy?.ref === done.transfer.ref)!;
    expect(raised).toMatchObject({ state: 'pending_approval', flatCode: 'B-403', from: '2026-12-01', requestedBy: 'usr_anr_0001' });
    await s.as('alnoor_treasurer').post(`/payer-changes/${raised.id}/approve`, { note: 'Transfer cleared.' });
    // Issue #6 item 7: the resident links stay as they were; no account or invitation is created for the
    // buyer and nobody's access moves automatically (the owner/payer link lifecycle is pending D.2).
    expect(await accessOf()).toEqual(accessBefore);
    expect(accessBefore.some((r) => r.name === 'Nadia Farooq')).toBe(false);
  });
});

describe('Reminders (COL-007/009): skip rules, quiet hours, no duplicates', () => {
  it('never reminds a payer whose proof is pending; SMS waits in quiet hours; the same send key never sends twice', async () => {
    const s = session();
    const day = await s.as('alnoor_accounts').post<ReminderPreview>('/reminders/preview', { clock: '11:00' });
    const a305 = day.rows.find((r) => r.flats.includes('A-305'));
    expect(a305?.channels.every((c) => c.skip === 'proof_pending')).toBe(true);
    expect(day.rows.every((r) => paisaOf(r.amount) > 0n)).toBe(true);
    const night = await s.post<ReminderPreview>('/reminders/preview', { clock: '22:30' });
    expect(night.rows.flatMap((r) => r.channels).some((c) => c.channel === 'sms' && c.outcome === 'send')).toBe(false);
    const first = await s.post<ReminderSendResult>('/reminders/send', { clock: '11:00', sendKey: 'send-2026-10-26-a' });
    const again = await s.post<ReminderSendResult>('/reminders/send', { clock: '11:00', sendKey: 'send-2026-10-26-a' });
    expect([again.replayed, again.sent]).toEqual([true, first.sent]);
    const second = await s.post<ReminderSendResult>('/reminders/send', { clock: '11:00', sendKey: 'send-2026-10-26-b' });
    expect(second.events.filter((e) => e.outcome === 'sent' && e.channel === 'in_app')).toHaveLength(0);
  });
});

describe('Authorization (module, feature, permission, maker-checker)', () => {
  it('the guard sees no money; the secretary reads the cashbook but prepares nothing; a resident never reaches finance', async () => {
    const s = session();
    expect((await problem(s.as('alnoor_guard').get('/finance/cashbook'))).status).toBe(403);
    await s.as('alnoor_admin').get('/finance/cashbook');
    expect((await problem(s.post('/finance/vouchers', {}))).status).toBe(403);
    expect((await problem(s.as('alnoor_resident_a101').get('/finance/overview'))).status).toBe(403);
    expect((await problem(s.as('alnoor_resident_a101').get('/approvals'))).status).toBe(403);
    // Another organisation without the S.1 features: refused before any handler.
    expect((await problem(s.as('society_admin').get('/finance/cashbook'))).status).toBe(403);
    expect((await problem(s.as('society_admin').get('/committee'))).status).toBe(403);
  });

  it('expense vouchers are refused outside cash accounts and a posted voucher is corrected only by a reversal', async () => {
    const s = session();
    const bank = await problem(s.as('alnoor_accounts').post('/finance/vouchers', { accountId: MAIN, direction: 'payment', category: 'repairs', amount: '100', onDate: '2026-10-26', purpose: 'Not from a bank', counterparty: 'X Co', evidence: { name: 'x.jpg' } }));
    expect(bank.code).toBe('voucher_cash_only');
    const book = await s.get<{ items: CashVoucher[] }>('/finance/vouchers', { status: 'posted' });
    const diesel = book.items.find((v) => v.purpose.startsWith('Generator diesel'))!;
    const rev = await s.post<VoucherDetail>(`/finance/vouchers/${diesel.id}/reverse`, { reason: 'Duplicate bill: the station billed twice' });
    expect(rev.voucher).toMatchObject({ direction: 'receipt', reversalOf: { id: diesel.id }, status: 'submitted' });
    await approve(s, 'alnoor_treasurer', rev.voucher.approvalId!);
    await s.as('alnoor_accounts').post(`/finance/vouchers/${rev.voucher.id}/post`);
    expect(await closing(s, PETTY)).toBe('3850.00');
    const original = await s.get<VoucherDetail>(`/finance/vouchers/${diesel.id}`);
    expect([original.voucher.status, original.voucher.amount.amount, original.voucher.reversedBy?.id]).toEqual(['posted', '3200.00', rev.voucher.id]);
  });

  it('D-34: once payables is licensed, an expense voucher is refused (expenses belong to payables); receipts still work', async () => {
    // No demo tenant licenses both, so this test adds a payables grant to Al-Noor for itself only.
    const modules = directoryTenant('tnt_alnoor')!.modules as ModuleSelection[];
    modules.push({ module: 'payables', sites: 'all' });
    try {
      const s = session().as('alnoor_accounts');
      const base = { accountId: OFFICE, amount: '1200', onDate: '2026-10-26', evidence: { name: 'slip.jpg', kind: 'bill', size: 1000 } };
      const expense = await problem(s.post('/finance/vouchers', { ...base, direction: 'payment', category: 'cleaning', purpose: 'Cleaning supplies for both lobbies', counterparty: 'Model Town Stores (Demo)' }));
      expect(expense.code).toBe('expense_owned_by_payables');
      const receipt = await s.post<{ voucher: CashVoucher }>('/finance/vouchers', { ...base, direction: 'receipt', category: 'hall_booking', purpose: 'Community hall booking, 26 October', counterparty: 'Hina Rana (B-204)' });
      expect(receipt.voucher.direction).toBe('receipt');
    } finally {
      modules.pop();
    }
  });
});

const paisaOf = (m: { amount: string }) => BigInt(Math.round(Number(m.amount) * 100));

describe('Issue #6: actions near midnight in Karachi keep the demo date and the posting period', () => {
  it('a voucher prepared at 23:59:59 and posted at 00:00:30 (Karachi) stays dated 26 October; October holds it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-31T18:59:59.000Z')); // 23:59:59 in Karachi
      const s = session().as('alnoor_accounts');
      const created = await s.post<{ voucher: CashVoucher }>('/finance/vouchers', { accountId: OFFICE, direction: 'receipt', category: 'hall_booking', amount: '1500', onDate: '2026-10-26', purpose: 'Community hall booking, late evening', counterparty: 'Hina Rana (B-204)', evidence: { name: 'hall-booking.pdf', kind: 'receipt', size: 1000 }, submit: true });
      expect(created.voucher.preparedAt).toMatch(/^2026-10-26T23:59:59\.\d{3}\+05:00$/);
      vi.setSystemTime(new Date('2026-10-31T19:00:30.000Z')); // 00:00:30 in Karachi, the next calendar day
      await approve(s, 'alnoor_treasurer', created.voucher.approvalId!);
      const posted = await s.as('alnoor_accounts').post<VoucherDetail>(`/finance/vouchers/${created.voucher.id}/post`);
      expect(posted.voucher.postedAt).toMatch(/^2026-10-26T00:00:30\.\d{3}\+05:00$/);
      const october = await s.get<CashbookView>('/finance/cashbook', { account: OFFICE, period: '2026-10' });
      expect(october.lines.find((l) => l.sourceRef === created.voucher.ref)?.date).toBe('2026-10-26');
      const november = await s.get<CashbookView>('/finance/cashbook', { account: OFFICE, period: '2026-11' }).catch(() => null);
      expect(november?.lines.some((l) => l.sourceRef === created.voucher.ref) ?? false).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});


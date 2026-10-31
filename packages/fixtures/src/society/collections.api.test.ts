import {
  ApiError,
  type BankFeed,
  type BatchDetail,
  type BillingAccountDetail,
  type OfficeCashRecorded,
  type BillingRunDetail,
  type CollectionSettings,
  type CollectionsSummary,
  type DuesBills,
  type DuesHome,
  type DuesPayInfo,
  type FlatDetail,
  type InvoiceDetail,
  type LiabilityChange,
  type PaymentDetail,
  type Receipt,
  type ReconciliationSummary,
  type ResidentSubmissionDetail,
  type Statement,
  type SubmissionDetail,
  type SubmissionQueue,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';

/**
 * Gate C.2 through the fail-closed mock API (A7 §C.3 storyline 8–14): residents and finance in one
 * browser's demo session. Every invariant the screens show is enforced here, by the server.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

function session(mode: 'ready' | 'collecting' = 'collecting') {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_accounts';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode } });
  return {
    as(id: string | null) {
      personaId = id;
      return this;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
  };
}

const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.problem;
    throw e;
  }
  throw new Error('expected a refusal');
};

const slip = (name = 'kamran-ibft.jpg') => ({ name, type: 'image/jpeg', size: 214_000 });
const SITE = '/sites/site_alnoor';

describe('Gate C.2 storyline: resident → finance → receipt', () => {
  it('A-101 pays 5,200 by transfer: pending until verified, then both balances settled with a receipt (AC-9, AC-10)', async () => {
    const s = session().as('alnoor_resident_a101');

    // 8. This month's bill 4,200 + previous balance 1,000 = 5,200; the verified payee, never the platform.
    const home = await s.get<DuesHome>('/portal/dues/home');
    expect(home.property.flats.map((f) => f.code)).toEqual(['A-101']);
    expect(home.position.current!.total.amount).toBe('4200.00');
    expect([home.position.previousBalance.amount, home.position.totalPayable.amount, home.position.overdue.amount]).toEqual(['1000.00', '5200.00', '1000.00']);
    expect(home.position.current!.lines.map((l) => [l.category, l.amount.amount])).toEqual([['maintenance', '3000.00'], ['security', '500.00'], ['lift', '300.00'], ['water', '400.00']]);
    expect(home.payee).toMatchObject({ iban: 'PK36DEMO0000001234567890', reference: 'ANR-A101-2026-11', amount: { amount: '5200.00' }, changedOn: '2026-10-12' });
    expect(home.payee!.qrPayload).toContain('NOT A REAL ACCOUNT');
    expect(home.methods).toMatchObject({ bankTransfer: true, officeCash: { enabled: false }, online: { available: false, gate: 'D' } });

    // Upload proof → Pending verification (never Paid). The amount still owed does not change.
    const sent = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-26', bankReference: 'ANR-A101-2026-11', file: slip() });
    expect(sent.submission.state).toBe('submitted');
    const after = await s.get<DuesHome>('/portal/dues/home');
    expect(after.position).toMatchObject({ status: 'pending_verification', totalPayable: { amount: '5200.00' }, pendingVerification: { amount: '5200.00' } });
    expect(after.receipts).toEqual([]);
    // Sending the same file again asks first.
    expect(await problem(s.post('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-26', bankReference: 'ANR-A101-2026-11', file: slip() }))).toMatchObject({ status: 409, code: 'possible_duplicate' });

    // 9. Accounts officer: review → the bank line matches → oldest first (Oct 1,000 + Nov 4,200) → verify.
    s.as('alnoor_accounts');
    const queue = await s.get<SubmissionQueue>('/payment-submissions', { state: 'to_review' });
    const row = queue.items.find((r) => r.id === sent.submission.id)!;
    expect(row.match).toBe('exact');
    const detail = await s.post<SubmissionDetail>(`/payment-submissions/${row.id}/review`);
    expect(detail.submission.state).toBe('under_review');
    const best = detail.candidates[0]!;
    expect(best.bankLine).toMatchObject({ counterpartyName: 'KAMRAN SIDDIQUI', amount: { amount: '5200.00' } });
    expect(detail.allocation.lines.map((l) => [l.kind, l.amount.amount])).toEqual([['opening_balance', '1000.00'], ['charge', '3000.00'], ['charge', '500.00'], ['charge', '300.00'], ['charge', '400.00']]);
    expect(await problem(s.post(`/payment-submissions/${row.id}/verify`, { bankLineId: best.bankLine.id, amount: '5000' }))).toMatchObject({ status: 422 });
    const paid = await s.post<PaymentDetail>(`/payment-submissions/${row.id}/verify`, { bankLineId: best.bankLine.id, amount: '5200' });
    expect(paid.payment).toMatchObject({ verification: 'bank_matched', amount: { amount: '5200.00' }, unapplied: { amount: '0.00' } });
    expect(paid.receipt.ref).toMatch(/^ANR-RCT-2026-\d{5}$/);
    expect(paid.accountBalance.amount).toBe('0.00');

    // Verifying twice changes nothing; the bank line now settles this payment only.
    expect(await problem(s.post(`/payment-submissions/${row.id}/verify`, { bankLineId: best.bankLine.id, amount: '5200' }))).toMatchObject({ status: 409, code: 'already_verified' });

    // The resident sees the receipt and the updated statement.
    s.as('alnoor_resident_a101');
    const done = await s.get<DuesHome>('/portal/dues/home');
    expect(done.position).toMatchObject({ status: 'paid', totalPayable: { amount: '0.00' } });
    expect(done.receipts[0]!.ref).toBe(paid.receipt.ref);
    const receipt = await s.get<Receipt>(`/portal/dues/receipts/${done.receipts[0]!.id}`);
    expect(receipt.allocations.map((a) => a.amount.amount)).toEqual(['1000.00', '3000.00', '500.00', '300.00', '400.00']);
    const st = await s.get<Statement>('/portal/dues/statement');
    expect(st.entries.map((e) => [e.kind, e.debit?.amount ?? e.credit?.amount])).toEqual([['opening_balance', '1000.00'], ['payment', '5200.00'], ['invoice', '4200.00']]);
    expect(st.closingBalance.amount).toBe('0.00');
    const sub = await s.get<ResidentSubmissionDetail>(`/portal/dues/submissions/${row.id}`);
    expect(sub.timeline.map((t) => t.step)).toEqual(['submitted', 'under_review', 'verified']);
    expect(sub.submission.receiptRef).toBe(paid.receipt.ref);
  });

  it('the duplicate, the shared reference, needs-information with resubmission, and a rejection (AC-11)', async () => {
    const s = session();
    const queue = await s.get<SubmissionQueue>('/payment-submissions');
    const by = (flat: string) => queue.items.find((r) => r.flats[0] === flat && r.state === 'submitted')!;

    // A-204 sends again the transfer verified on 24 Oct: matching it is refused, whoever asks.
    const resend = await s.get<SubmissionDetail>(`/payment-submissions/${by('A-204').id}`);
    const taken = resend.candidates.find((c) => c.alreadyMatched)!;
    expect(resend.possibleDuplicates.map((d) => d.state)).toEqual(['verified']);
    expect(await problem(s.post(`/payment-submissions/${by('A-204').id}/verify`, { bankLineId: taken.bankLine.id, amount: '4200' }))).toMatchObject({ status: 409, code: 'bank_line_already_matched' });
    await s.post(`/payment-submissions/${by('A-204').id}/reject`, { reason: 'Already received on 22 October (receipt ANR-RCT-2026-00002).' });

    // B-405's reference is shared with B-406's genuine transfer: both are accepted, separately.
    const komal = await s.get<SubmissionDetail>(`/payment-submissions/${by('B-405').id}`);
    const mine = komal.candidates[0]!;
    expect(mine.sharesReferenceWith).toHaveLength(1);
    await s.post(`/payment-submissions/${by('B-405').id}/verify`, { bankLineId: mine.bankLine.id, amount: '4200' });
    const other = (await s.get<BankFeed>('/bank/feed')).lines.find((l) => l.id === mine.sharesReferenceWith![0])!;
    expect(other.state).toBe('unmatched');

    // A-102's blurred photo: needs information → the tenant resubmits (history kept) → verified.
    const sana = by('A-102');
    await s.post(`/payment-submissions/${sana.id}/request-information`, { message: 'The photo is blurred. Please upload the bank’s PDF receipt.' });
    s.as('alnoor_tenant_a102');
    const asked = await s.get<ResidentSubmissionDetail>(`/portal/dues/submissions/${sana.id}`);
    expect(asked).toMatchObject({ canResubmit: true, submission: { state: 'needs_information', request: 'The photo is blurred. Please upload the bank’s PDF receipt.' } });
    const again = await s.post<ResidentSubmissionDetail>(`/portal/dues/submissions/${sana.id}/resubmit`, { amount: '4200', transferDate: '2026-10-25', bankReference: 'A102', file: { name: 'sana-raast.pdf', type: 'application/pdf', size: 88_000 } });
    expect(again.submission.versions.map((v) => v.fileName)).toEqual(['IMG_2041.jpg', 'sana-raast.pdf']);
    expect(again.timeline.map((t) => t.step)).toEqual(['submitted', 'information_requested', 'resubmitted']);
    s.as('alnoor_accounts');
    const sanaDetail = await s.get<SubmissionDetail>(`/payment-submissions/${sana.id}`);
    await s.post(`/payment-submissions/${sana.id}/verify`, { bankLineId: sanaDetail.candidates[0]!.bankLine.id, amount: '4200' });

    // B-207 paid into an account that is not the association's: rejected, and the resident is told why.
    await s.post(`/payment-submissions/${by('B-207').id}/reject`, { reason: 'The transfer went to an account that is not the association’s.' });
    const after = await s.get<SubmissionQueue>('/payment-submissions');
    expect(after.counts).toMatchObject({ verified: 5, rejected: 2, submitted: 2, needs_information: 0 });
    expect(await problem(s.post(`/payment-submissions/${by('B-207').id}/verify`, { amount: '4200', manualReason: 'Trying after rejection' }))).toMatchObject({ status: 409, code: 'invalid_state' });
  });

  it('3,000 leaves 2,200 outstanding; 6,000 leaves 800 credit; credit applies only to the same payer (AC-10)', async () => {
    const s = session().as('alnoor_resident_a101');
    const part = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '3000', transferDate: '2026-10-26', bankReference: 'A101 PART', file: slip('part.jpg') });
    s.as('alnoor_accounts');
    // Not on any statement yet: the proof waits; nothing is settled.
    const waiting = await s.get<SubmissionDetail>(`/payment-submissions/${part.submission.id}`);
    expect(waiting.candidates.filter((c) => c.strength === 'full')).toEqual([]);
    await s.post(`/payment-submissions/${part.submission.id}/await-bank`, { note: 'Not on the statements imported so far; checking the next one.' });
    await s.post('/bank/statements', { sample: 3, beneficiaryId: 'ben_anr_main' });
    const ready = await s.get<SubmissionDetail>(`/payment-submissions/${part.submission.id}`);
    const line = ready.candidates.find((c) => c.strength === 'full')!;
    expect(line.bankLine).toMatchObject({ bankTxnId: 'DEMO-TXN-26102616', amount: { amount: '3000.00' } });
    const p1 = await s.post<PaymentDetail>(`/payment-submissions/${part.submission.id}/verify`, { bankLineId: line.bankLine.id, amount: '3000' });
    expect(p1.payment.verification).toBe('bank_matched');
    expect(p1.accountBalance.amount).toBe('2200.00');
    const inv = await s.get<InvoiceDetail>(`/billing/invoices/${p1.payment.allocations.find((a) => a.kind === 'charge')!.invoiceId}`);
    expect(inv.invoice).toMatchObject({ settlement: 'partially_paid', outstanding: { amount: '2200.00' } });
    expect(inv.payments.map((p) => p.amount.amount)).toEqual(['2000.00']);

    s.as('alnoor_resident_a101');
    expect((await s.get<DuesHome>('/portal/dues/home')).position).toMatchObject({ status: 'partially_paid', totalPayable: { amount: '2200.00' } });
  });

  it('6,000 against its statement line settles 5,200 and leaves 800 as credit, applied only to the same payer (AC-10)', async () => {
    const s = session().as('alnoor_resident_a101');
    const over = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '6000', transferDate: '2026-10-26', bankReference: 'A101 ALL DUES', file: slip('all.jpg') });
    s.as('alnoor_accounts');
    await s.post('/bank/statements', { sample: 3, beneficiaryId: 'ben_anr_main' });
    const d = await s.get<SubmissionDetail>(`/payment-submissions/${over.submission.id}`);
    const line = d.candidates.find((c) => c.strength === 'full')!;
    expect(line.bankLine.bankTxnId).toBe('DEMO-TXN-26102615');
    const p2 = await s.post<PaymentDetail>(`/payment-submissions/${over.submission.id}/verify`, { bankLineId: line.bankLine.id, amount: '6000' });
    expect(p2.payment.unapplied.amount).toBe('800.00');
    expect(p2.accountBalance.amount).toBe('-800.00');
    expect(p2.actions.applyCredit).toBe(false); // nothing of this payer is open
    s.as('alnoor_resident_a101');
    expect((await s.get<DuesHome>('/portal/dues/home')).position).toMatchObject({ status: 'paid', totalPayable: { amount: '0.00' }, credit: { amount: '800.00' } });
  });

  it('a shared account: the tenant pays only A-202; allocating to the owner’s flat is refused (AC-11a)', async () => {
    const s = session().as('alnoor_tenant_a202');
    const home = await s.get<DuesHome>('/portal/dues/home');
    expect(home.position).toMatchObject({ previousBalance: { amount: '0.00' }, totalPayable: { amount: '4200.00' } });
    expect(home.position.current!.flats).toEqual(['A-202']);
    const sent = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '4200', transferDate: '2026-10-25', bankReference: 'A202 NOV', file: slip('junaid.jpg') });
    s.as('alnoor_owner_a201');
    const rabia = await s.get<DuesBills>('/portal/dues/bills');
    expect(rabia.position.totalPayable.amount).toBe('7200.00');
    expect(rabia.bills.flatMap((b) => b.flats)).toEqual(['A-201', 'A-201']);
    // The owner cannot open the tenant's bill or proof (not found, not forbidden).
    const junaidBill = home.position.current!.invoiceId;
    expect(await problem(s.get(`/portal/dues/bills/${junaidBill}`))).toMatchObject({ status: 404 });
    expect(await problem(s.get(`/portal/dues/submissions/${sent.submission.id}`))).toMatchObject({ status: 404 });

    s.as('alnoor_accounts');
    const d = await s.get<SubmissionDetail>(`/payment-submissions/${sent.submission.id}`);
    expect(new Set(d.openLines.map((l) => l.unitCode))).toEqual(new Set(['A-202']));
    const rabiaLine = (await s.get<InvoiceDetail>(`/billing/invoices/${rabia.bills[0]!.invoiceId}`)).invoice.lines[0]!;
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: d.candidates[0]!.bankLine.id, amount: '4200', allocations: [{ lineId: rabiaLine.id, amount: '4200' }], overrideReason: 'Owner asked' }))).toMatchObject({ status: 403, code: 'cross_payer_forbidden' });
    // An edited allocation within the payer's own lines needs a reason.
    const own = d.openLines[0]!;
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: d.candidates[0]!.bankLine.id, amount: '4200', allocations: [{ lineId: own.lineId, amount: own.open.amount }] }))).toMatchObject({ status: 422 });
    const ok = await s.post<PaymentDetail>(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: d.candidates[0]!.bankLine.id, amount: '4200' });
    expect(new Set(ok.payment.allocations.map((a) => a.unitCode))).toEqual(new Set(['A-202']));
    s.as('alnoor_owner_a201');
    expect((await s.get<DuesHome>('/portal/dues/home')).position.totalPayable.amount).toBe('7200.00');
  });
});

describe('office cash, the bank feed and reconciliation (AC-13, AC-14)', () => {
  it('office cash is refused until the method rule allows it; then it waits for a second count (D-46) and only then has a receipt', async () => {
    const s = session();
    const payer = (await s.get<FlatDetail>(`${SITE}/units/unt_anr_a101`)).currentPayer!;
    const cash = { accountId: 'ba_anr_a101', payerPartyId: payer.partyId, amount: '5200' };
    expect(await problem(s.post('/payments/office', cash))).toMatchObject({ status: 409, code: 'method_not_allowed' });
    // The accounts officer may not change method rules; the treasurer may.
    expect(await problem(s.patch(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true }))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    const settings = await s.patch<CollectionSettings>(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true });
    expect(settings.methods.find((m) => m.method === 'office_cash')!.enabled).toBe(true);
    // The limit is the society's own setting (50,000 is only the demo's starting value); changing it
    // leaves cash allowed.
    const limited = await s.patch<CollectionSettings>(`${SITE}/payment-methods`, { method: 'office_cash', maxAmount: '5000' });
    expect(limited.methods.find((m) => m.method === 'office_cash')).toMatchObject({ enabled: true, maxAmount: { amount: '5000.00' } });
    s.as('alnoor_accounts');
    expect(await problem(s.post('/payments/office', { ...cash, amount: '5200' }))).toMatchObject({ status: 422 });
    s.as('alnoor_treasurer');
    await s.patch<CollectionSettings>(`${SITE}/payment-methods`, { method: 'office_cash', maxAmount: '50000' });
    s.as('alnoor_accounts');
    expect(await problem(s.post('/payments/office', { ...cash, amount: '60000' }))).toMatchObject({ status: 422 });
    // Owner decision D-46 (D.1/S.1 integration): the counter records the cash; nothing is paid yet.
    const recorded = await s.post<OfficeCashRecorded>('/payments/office', cash);
    expect(recorded).toMatchObject({ status: 'awaiting_count', amount: { amount: '5200.00' }, replayed: false });
    const before = await s.get<BillingAccountDetail>('/billing-accounts/ba_anr_a101');
    expect(before.cashAwaitingCount).toEqual([expect.objectContaining({ batchId: recorded.batch.id, amount: { amount: '5200.00', currency: 'PKR' } })]);
    // The collector never confirms their own cash; a second person counts it, and only then is there a receipt.
    expect(await problem(s.post(`/office-collections/${recorded.batch.id}/confirm`, { countedCash: '5200' }))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    expect(await problem(s.post(`/office-collections/${recorded.batch.id}/confirm`, { countedCash: '5000' }))).toMatchObject({ code: 'count_mismatch' });
    const confirmed = await s.post<BatchDetail>(`/office-collections/${recorded.batch.id}/confirm`, { countedCash: '5200' });
    const outcome = confirmed.batch.lines[0]!.outcome;
    if (outcome?.kind !== 'payment') throw new Error('expected a payment');
    // A settled line carries no review warning: what is owed now already includes its own payment.
    expect(confirmed.warnings).toEqual([]);
    const paid = await s.get<PaymentDetail>(`/payments/${outcome.paymentId}`);
    expect(paid.payment).toMatchObject({ method: 'office_cash', verification: 'witnessed', amount: { amount: '5200.00' } });
    expect(paid.receipt.ref).toBe(outcome.receiptRef);
    expect((await s.get<BillingAccountDetail>('/billing-accounts/ba_anr_a101')).cashAwaitingCount).toEqual([]);
    s.as('alnoor_accounts');
    // A guard holds no payment permission at all.
    s.as('alnoor_guard');
    expect(await problem(s.post('/payments/office', cash))).toMatchObject({ status: 403 });
  });

  it('statements import once; reconciliation marks verified payments matched; two lines stay unidentified', async () => {
    const s = session();
    expect(await s.post<{ created: number; alreadyImported: boolean }>('/bank/statements', { sample: 2, beneficiaryId: 'ben_anr_main' })).toMatchObject({ created: 0, alreadyImported: true });
    const rec = await s.get<ReconciliationSummary>('/bank/reconciliation');
    expect([rec.matched.count, rec.unidentified.count]).toEqual([3, 2]);
    const unknown = rec.lines.find((l) => l.counterpartyName === 'M ALI')!;
    expect(await problem(s.post(`/bank/lines/${unknown.id}/exclude`, { reason: 'x' }))).toMatchObject({ status: 422 });
    await s.post(`/bank/lines/${unknown.id}/exclude`, { reason: 'Refund from the generator contractor' });
    expect((await s.get<ReconciliationSummary>('/bank/reconciliation')).excluded.count).toBe(1);
    const summary = await s.get<CollectionsSummary>('/collections/summary');
    expect(summary).toMatchObject({ billed: { amount: { amount: '355800.00' }, invoices: 79 }, collected: { amount: { amount: '12600.00' }, payments: 3 }, pending: { submissions: 6 } });
    // The manager sees collections (read only) but cannot touch the bank.
    s.as('alnoor_manager');
    expect((await s.get<CollectionsSummary>('/collections/summary')).queue.toReview).toBe(6);
    expect(await problem(s.get('/bank/feed'))).toMatchObject({ status: 403 });
    expect(await problem(s.post('/payment-submissions/psb_anr_0004/review'))).toMatchObject({ status: 403 });
  });
});

describe('settlement evidence (C.2 review)', () => {
  it('a reviewer\u2019s note settles nothing: the proof waits for its bank line, then is verified once', async () => {
    const s = session().as('alnoor_resident_a101');
    const sent = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '6000', transferDate: '2026-10-26', bankReference: 'A101 ALL DUES', file: slip('evidence.jpg') });
    s.as('alnoor_accounts');
    const before = await s.get<CollectionsSummary>('/collections/summary');
    // A fabricated or well-meant reason is not evidence of funds: verification without a line is refused.
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/verify`, { amount: '6000', manualReason: 'Seen on the bank portal this morning.' }))).toMatchObject({ status: 422, code: 'bank_evidence_required' });
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/await-bank`, { note: 'short' }))).toMatchObject({ status: 422 });
    const waiting = await s.post<SubmissionDetail>(`/payment-submissions/${sent.submission.id}/await-bank`, { note: 'Resident says it was sent today; not on the imported statements yet.' });
    expect(waiting.submission).toMatchObject({ state: 'awaiting_bank_evidence', awaiting: { byName: 'Saba Javed' } });
    expect(waiting.submission.paymentId).toBeUndefined();
    // Not settled, not allocated, no receipt; the figures do not move; reconciliation lists it as waiting.
    const summary = await s.get<CollectionsSummary>('/collections/summary');
    expect([summary.collected.amount.amount, summary.collected.payments, summary.outstanding.amount.amount]).toEqual([before.collected.amount.amount, before.collected.payments, before.outstanding.amount.amount]);
    expect(summary.queue.awaitingBank).toBe(1);
    expect((await s.get<ReconciliationSummary>('/bank/reconciliation')).awaitingBankLine).toMatchObject({ count: 1, amount: { amount: '6000.00' } });
    expect((await s.get<{ items: unknown[] }>('/payments', { account: 'ba_anr_a101' })).items).toEqual([]);
    s.as('alnoor_resident_a101');
    const home = await s.get<DuesHome>('/portal/dues/home');
    expect(home.position).toMatchObject({ status: 'pending_verification', totalPayable: { amount: '5200.00' } });
    expect(home.receipts).toEqual([]);
    expect((await s.get<ResidentSubmissionDetail>(`/portal/dues/submissions/${sent.submission.id}`)).timeline.map((t) => t.step)).toEqual(['submitted', 'awaiting_bank_evidence']);

    // The statement arrives: the import points at the waiting proof (it settles nothing by itself).
    s.as('alnoor_accounts');
    const imported = await s.post<{ created: number; nowMatchable: Array<{ id: string }> }>('/bank/statements', { sample: 3, beneficiaryId: 'ben_anr_main' });
    expect(imported.created).toBe(2);
    expect(imported.nowMatchable.map((x) => x.id)).toEqual([sent.submission.id]);
    const detail = await s.get<SubmissionDetail>(`/payment-submissions/${sent.submission.id}`);
    expect(detail.submission.state).toBe('awaiting_bank_evidence');
    const line = detail.candidates.find((c) => c.strength === 'full')!;
    const paid = await s.post<PaymentDetail>(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: line.bankLine.id, amount: '6000' });
    expect(paid.payment).toMatchObject({ verification: 'bank_matched', bankTxnId: 'DEMO-TXN-26102615', unapplied: { amount: '800.00' } });
    // No second recognition: verifying again, importing again, or using the same line for another proof.
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: line.bankLine.id, amount: '6000' }))).toMatchObject({ status: 409, code: 'already_verified' });
    expect(await s.post('/bank/statements', { sample: 3, beneficiaryId: 'ben_anr_main' })).toMatchObject({ created: 0, alreadyImported: true });
    s.as('alnoor_resident_a101');
    const again = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '6000', transferDate: '2026-10-26', bankReference: 'A101 ALL DUES', file: slip('evidence-again.jpg'), confirmDuplicate: true });
    s.as('alnoor_accounts');
    expect(await problem(s.post(`/payment-submissions/${again.submission.id}/verify`, { bankLineId: line.bankLine.id, amount: '6000' }))).toMatchObject({ status: 409, code: 'bank_line_already_matched' });
    const payments = await s.get<{ items: Array<{ amount: { amount: string } }> }>('/payments', { account: 'ba_anr_a101' });
    expect(payments.items.map((p) => p.amount.amount)).toEqual(['6000.00']);
  });

  it('statements are bound to a chosen verified account; another account\u2019s transfer never settles; the same bank id on two accounts is two transactions', async () => {
    const s = session();
    // The account is chosen, never assumed; it must be one of this entity's verified accounts.
    expect(await problem(s.post('/bank/statements', { sample: 3 }))).toMatchObject({ status: 422 });
    expect(await problem(s.post('/bank/statements', { sample: 3, beneficiaryId: 'ben_other_main' }))).toMatchObject({ status: 422 });
    // A statement that names another account is refused.
    expect(await problem(s.post('/bank/statements', { sample: 4, beneficiaryId: 'ben_anr_main' }))).toMatchObject({ status: 422, code: 'statement_account_mismatch' });
    const old = await s.post<{ created: number; statement: { beneficiaryId: string; iban: string } }>('/bank/statements', { sample: 4, beneficiaryId: 'ben_anr_committee' });
    // DEMO-TXN-26102201 is already on the association's account: on the old account it is another transaction.
    expect(old).toMatchObject({ created: 1, statement: { beneficiaryId: 'ben_anr_committee', iban: 'PK70DEMO0000000987654321' } });
    const feed = await s.get<BankFeed>('/bank/feed');
    expect(feed.lines.filter((l) => l.bankTxnId === 'DEMO-TXN-26102201').map((l) => l.beneficiaryId).sort()).toEqual(['ben_anr_committee', 'ben_anr_main']);
    expect(feed.accounts.map((a) => a.id).sort()).toEqual(['ben_anr_committee', 'ben_anr_main']);

    // Kamran paid the old committee account on 20 October (retired on the 12th): it never settles his proof.
    s.as('alnoor_resident_a101');
    const sent = await s.post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-20', bankReference: 'ANR-A101-2026-11', file: slip('old-account.jpg') });
    s.as('alnoor_accounts');
    const d = await s.get<SubmissionDetail>(`/payment-submissions/${sent.submission.id}`);
    const wrong = d.candidates.find((c) => c.bankLine.beneficiaryId === 'ben_anr_committee')!;
    expect(wrong).toMatchObject({ strength: 'full', destination: 'wrong_account' });
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: wrong.bankLine.id, amount: '5200' }))).toMatchObject({ status: 422, code: 'wrong_destination' });
    expect(await problem(s.post(`/payment-submissions/${sent.submission.id}/exception`, { bankLineId: wrong.bankLine.id, reason: 'Resident paid the old committee account by mistake.' }))).toMatchObject({ status: 422, code: 'wrong_destination' });
    expect((await s.get<SubmissionQueue>('/payment-submissions')).items.find((r) => r.id === sent.submission.id)!.match).not.toBe('exact');
  });

  it('a partly matching line settles only through an exception approved by someone else', async () => {
    const s = session();
    const queue = await s.get<SubmissionQueue>('/payment-submissions');
    const komal = queue.items.find((r) => r.flats[0] === 'B-405' && r.state === 'submitted')!;
    const d = await s.get<SubmissionDetail>(`/payment-submissions/${komal.id}`);
    const own = d.candidates.find((c) => c.bankLine.counterpartyName === 'KOMAL MIRZA')!;
    const imran = d.candidates.find((c) => c.bankLine.counterpartyName === 'IMRAN HUSSAIN')!;
    expect(own).toMatchObject({ strength: 'full', missing: [] });
    expect(imran).toMatchObject({ strength: 'partial', missing: ['name'], destination: 'ok' });
    // Same amount and words, another payer: verifying directly is refused.
    expect(await problem(s.post(`/payment-submissions/${komal.id}/verify`, { bankLineId: imran.bankLine.id, amount: '4200' }))).toMatchObject({ status: 409, code: 'exception_required' });
    // A full match needs no exception; an exception needs a real reason.
    expect(await problem(s.post(`/payment-submissions/${komal.id}/exception`, { bankLineId: own.bankLine.id, reason: 'This is clearly the right transfer for B-405.' }))).toMatchObject({ status: 409, code: 'exception_not_needed' });
    expect(await problem(s.post(`/payment-submissions/${komal.id}/exception`, { bankLineId: imran.bankLine.id, reason: 'same' }))).toMatchObject({ status: 422 });
    const asked = await s.post<SubmissionDetail>(`/payment-submissions/${komal.id}/exception`, { bankLineId: imran.bankLine.id, reason: 'Komal says her husband Imran sent it from his account; confirmed by phone.' });
    expect(asked.submission).toMatchObject({ state: 'exception_pending', exception: { missing: ['name'], requestedByName: 'Saba Javed' } });
    expect(asked.submission.paymentId).toBeUndefined();
    // The line is held: no other proof may use it while the exception waits.
    const b406 = (await s.get<BankFeed>('/bank/feed')).lines.find((l) => l.id === imran.bankLine.id)!;
    expect(b406.heldFor).toMatchObject({ submissionId: komal.id });
    // The accounts officer cannot approve (no permission); the treasurer can, unless she asked.
    expect(await problem(s.post(`/payment-submissions/${komal.id}/exception/approve`))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    const view = await s.get<SubmissionDetail>(`/payment-submissions/${komal.id}`);
    expect(view.actions).toMatchObject({ decideException: true });
    expect(await problem(s.post(`/payment-submissions/${komal.id}/exception/reject`, { note: '' }))).toMatchObject({ status: 422 });
    const paid = await s.post<PaymentDetail>(`/payment-submissions/${komal.id}/exception/approve`);
    expect(paid.payment).toMatchObject({ verification: 'exception_approved', bankTxnId: imran.bankLine.bankTxnId, exception: { missing: ['name'], requestedByName: 'Saba Javed', approvedByName: 'Ayesha Malik' } });
    expect((await s.get<BankFeed>('/bank/feed')).lines.find((l) => l.id === imran.bankLine.id)).toMatchObject({ state: 'matched' });

    // A treasurer who asks cannot approve her own exception; a rejection releases the line.
    const queue2 = await s.get<SubmissionQueue>('/payment-submissions');
    const sana = queue2.items.find((r) => r.flats[0] === 'A-102' && r.state === 'submitted')!;
    const sd = await s.get<SubmissionDetail>(`/payment-submissions/${sana.id}`);
    const spare = sd.candidates.find((c) => c.strength === 'partial' && c.destination === 'ok' && !c.alreadyMatched && !c.heldFor)!;
    await s.post(`/payment-submissions/${sana.id}/exception`, { bankLineId: spare.bankLine.id, reason: 'Trying a line that only partly matches, to show the rule.' });
    expect(await problem(s.post(`/payment-submissions/${sana.id}/exception/approve`))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    s.as('alnoor_accounts');
    expect(await problem(s.post(`/payment-submissions/${sana.id}/exception/reject`, { note: 'Not this one.' }))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    // Same principal: the requester may not reject either (a second person decides).
    expect(await problem(s.post(`/payment-submissions/${sana.id}/exception/reject`, { note: 'Not this one.' }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
  });
});

describe('collection account, posting policy, numbering and payer changes (owner decisions, C.1 review)', () => {
  it('a new collection account needs a second person and stays hidden from residents through cooling-off (AC-12)', async () => {
    const s = session().as('alnoor_manager');
    const proposal = { bankName: 'Demo Bank', branch: 'DHA Phase 5, Lahore', accountTitle: 'Al-Noor Residency Owners’ Association (Demo)', iban: 'PK90DEMO0000005550001111', reason: 'Moving to the branch next to the society office.', verification: 'bank_letter_checked' };
    // Only fictional (DEMO) accounts are accepted in the prototype.
    expect(await problem(s.post(`${SITE}/beneficiary-changes`, { ...proposal, iban: 'PK90XXXX0000005550001111' }))).toMatchObject({ status: 422 });
    const proposed = await s.post<CollectionSettings>(`${SITE}/beneficiary-changes`, proposal);
    const change = proposed.changes[0]!;
    expect(change.state).toBe('pending_approval');
    expect(await problem(s.post(`/beneficiary-changes/${change.id}/approve`))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    const approved = await s.post<CollectionSettings>(`/beneficiary-changes/${change.id}/approve`);
    expect(approved.changes[0]).toMatchObject({ state: 'cooling_off', effectiveOn: '2026-10-29' });
    expect(approved.payee!.iban).toBe('PK36DEMO0000001234567890');
    s.as('alnoor_resident_a101');
    expect((await s.get<DuesPayInfo>('/portal/dues/pay')).payee!.iban).toBe('PK36DEMO0000001234567890');
    // Demo only: end the cooling-off period by hand; residents then see the new account.
    s.as('alnoor_treasurer');
    await s.post(`/beneficiary-changes/${change.id}/end-cooling-off`);
    s.as('alnoor_resident_a101');
    expect((await s.get<DuesPayInfo>('/portal/dues/pay')).payee).toMatchObject({ iban: 'PK90DEMO0000005550001111', changedOn: '2026-10-26' });
  });

  it('posting is for finance by default; the preparer never posts; the policy narrows it further', async () => {
    const s = session('ready').as('alnoor_manager');
    let run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    await s.post(`/billing-runs/${run.run.id}/preview`);
    await s.post(`/billing-runs/${run.run.id}/submit`);
    s.as('alnoor_treasurer');
    run = await s.post<BillingRunDetail>(`/billing-runs/${run.run.id}/approve`);
    s.as('alnoor_manager');
    expect((await s.get<BillingRunDetail>(`/billing-runs/${run.run.id}`)).actions.post).toEqual({ allowed: false, reason: 'maker_checker_required' });
    expect(await problem(s.post(`/billing-runs/${run.run.id}/post`))).toMatchObject({ status: 403 });
    // The committee narrows posting to the treasurer only: the accounts officer may no longer post.
    s.as('alnoor_treasurer');
    await s.patch(`${SITE}/posting-policy`, { roles: ['treasurer'], reason: 'Committee resolution 9/2026' });
    expect(await problem(s.patch(`${SITE}/posting-policy`, { roles: ['manager'], reason: 'Not eligible' }))).toMatchObject({ status: 422 });
    s.as('alnoor_accounts');
    expect((await s.get<BillingRunDetail>(`/billing-runs/${run.run.id}`)).actions.post).toEqual({ allowed: false, reason: 'posting_policy' });
    expect(await problem(s.post(`/billing-runs/${run.run.id}/post`))).toMatchObject({ status: 403, code: 'posting_policy' });
    s.as('alnoor_treasurer');
    expect((await s.post<{ invoiceIds: string[] }>(`/billing-runs/${run.run.id}/post`)).invoiceIds).toHaveLength(79);
  });

  it('numbering is configured per issuing entity: new documents only; issued references never change', async () => {
    const s = session().as('alnoor_treasurer');
    expect(await problem(s.patch(`${SITE}/numbering`, { receipt: 'RCPT-{yyyy}' }))).toMatchObject({ status: 422 });
    await s.patch(`${SITE}/numbering`, { receipt: '{code}/RCPT/{yyyy}/{seq:4}' });
    s.as('alnoor_treasurer').as('alnoor_accounts');
    const queue = await s.get<SubmissionQueue>('/payment-submissions', { state: 'to_review' });
    const a305 = queue.items.find((r) => r.flats[0] === 'A-305')!;
    const d = await s.get<SubmissionDetail>(`/payment-submissions/${a305.id}`);
    const paid = await s.post<PaymentDetail>(`/payment-submissions/${a305.id}/verify`, { bankLineId: d.candidates[0]!.bankLine.id, amount: '8400' });
    expect(paid.receipt.ref).toBe('ANR/RCPT/2026/0004');
    const earlier = await s.get<Receipt>('/receipts/rct_anr_0001');
    expect(earlier.ref).toBe('ANR-RCT-2026-00001');
  });

  it('payer changes need approval; two future changes apply by date; a correction supersedes; history is kept', async () => {
    const s = session('ready').as('alnoor_manager');
    const a102 = await s.get<FlatDetail>(`${SITE}/units/unt_anr_a102`);
    const owner = a102.owners[0]!.partyId;
    const tenant = a102.currentPayer!.partyId;
    const dec = await s.post<LiabilityChange>(`${SITE}/units/unt_anr_a102/payer`, { partyId: owner, from: '2026-12-01', reason: 'Tenant on leave, owner pays' });
    // One pending change per flat at a time; the requester cannot approve it.
    expect(await problem(s.post(`${SITE}/units/unt_anr_a102/payer`, { partyId: owner, from: '2027-01-01', reason: 'Again' }))).toMatchObject({ status: 409, code: 'change_pending' });
    s.as('alnoor_treasurer');
    await s.post(`/payer-changes/${dec.id}/approve`);
    s.as('alnoor_manager');
    const jan = await s.post<LiabilityChange>(`${SITE}/units/unt_anr_a102/payer`, { partyId: tenant, from: '2027-01-01', reason: 'Tenant back from leave' });
    expect(await problem(s.post(`/payer-changes/${jan.id}/approve`))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    await s.post(`/payer-changes/${jan.id}/approve`);
    let flat = await s.get<FlatDetail>(`${SITE}/units/unt_anr_a102`);
    expect(flat.payers.map((p) => [p.partyName, p.from, p.to ?? null])).toEqual([
      ['Sana Iqbal', '2027-01-01', null],
      ['Tariq Mehmood', '2026-12-01', '2027-01-01'],
      ['Sana Iqbal', '2026-03-01', '2026-12-01'],
      ['Tariq Mehmood', '2019-06-01', '2026-03-01'],
    ]);
    // Correction: December was a mistake; the owner takes over in February instead.
    s.as('alnoor_manager');
    const fix = await s.post<LiabilityChange>(`${SITE}/units/unt_anr_a102/payer`, { partyId: owner, from: '2027-02-01', reason: 'December was entered by mistake', corrects: dec.id });
    s.as('alnoor_treasurer');
    await s.post(`/payer-changes/${fix.id}/approve`);
    flat = await s.get<FlatDetail>(`${SITE}/units/unt_anr_a102`);
    expect(flat.changes.map((c) => [c.from, c.state])).toEqual([['2027-02-01', 'approved'], ['2027-01-01', 'approved'], ['2026-12-01', 'superseded']]);
    expect(flat.payers.map((p) => [p.partyName, p.from])).toEqual([['Tariq Mehmood', '2027-02-01'], ['Sana Iqbal', '2026-03-01'], ['Tariq Mehmood', '2019-06-01']]);
    // A December run bills the tenant again.
    s.as('alnoor_manager');
    const run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    const preview = await s.post<BillingRunDetail>(`/billing-runs/${run.run.id}/preview`);
    expect(preview.items.find((i) => i.unitCode === 'A-102')!.payerName).toBe('Sana Iqbal');
  });
});

describe('isolation: tenants, sites, legal entities and payers (AC-15)', () => {
  it('residents and staff of other organisations see nothing of Al-Noor; residents never see staff screens', async () => {
    const s = session().as('resident'); // Larkspur's buyer
    expect(await problem(s.get('/portal/dues/home'))).toMatchObject({ status: 404 });
    s.as('society_admin'); // Shalimar: core + maintenance only
    expect(await problem(s.get('/payment-submissions'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(await problem(s.get('/bank/feed'))).toMatchObject({ status: 403 });
    s.as('cedar_treasurer'); // suspended co-operative: history readable, no verification
    expect(await problem(s.post('/payment-submissions/psb_anr_0004/verify', { amount: '1' }))).toMatchObject({ status: 403, code: 'tenant_suspended' });
    s.as('alnoor_resident_a101'); // a resident calls finance endpoints
    for (const path of ['/payment-submissions', '/payments', '/bank/feed', '/collections/summary', '/billing/invoices']) expect(await problem(s.get(path)), path).toMatchObject({ status: 403 });
    s.as('alnoor_guard');
    for (const path of ['/payment-submissions', '/payments', '/collections/summary', '/portal/dues/home']) expect(await problem(s.get(path)), path).toMatchObject({ status: 403 });
  });

  it('a site that is not this tenant’s is not found; another resident’s receipt and statement are not found', async () => {
    const s = session().as('alnoor_treasurer');
    expect(await problem(s.get('/sites/site_other/collection-settings'))).toMatchObject({ status: 404 });
    expect(await problem(s.patch('/sites/site_other/payment-methods', { method: 'office_cash', enabled: true }))).toMatchObject({ status: 404 });
    s.as('alnoor_tenant_a102');
    expect(await problem(s.get('/portal/dues/receipts/rct_anr_0001'))).toMatchObject({ status: 404 });
    expect(await problem(s.get('/portal/dues/statement', { account: 'ba_anr_a101' }))).toMatchObject({ status: 404 });
    const sana = await s.get<DuesBills>('/portal/dues/bills');
    expect(sana.bills.flatMap((b) => b.flats)).toEqual(['A-102']);
  });
});

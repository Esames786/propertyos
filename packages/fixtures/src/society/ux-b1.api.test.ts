import {
  ApiError,
  type ApprovalDetail,
  type BatchDetail,
  type BillingAccountDetail,
  type CashbookView,
  type CollectionsSummary,
  type CreditNote,
  type DuesBillDetail,
  type DuesBills,
  type DuesHome,
  type DuesPayInfo,
  type EffectiveAccess,
  type FinanceOverview,
  type FlatDetail,
  type InvoiceDetail,
  type InvoiceList,
  type MyProperty,
  type OfficeCashRecorded,
  type PaymentDetail,
  type PaymentList,
  type Permission,
  type Persona,
  type PolicyOverview,
  type Receipt,
  type ResidentSubmissionDetail,
  type SocietyDashboard,
  type Statement,
  type SubmissionDetail,
  type SubmissionQueue,
  type VoucherDetail,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import { SOCIETY_SECTION, type SocietyState } from './state';

/**
 * UX repair batch B1 "Money truth" (backlog `docs/ux-backlog@90c2b0a`), through the fail-closed mock API
 * (Al-Noor Residency, demo date 26 October 2026). The shared scenario: office cash that left unapplied
 * credit on A-101 is reversed after an approval; every resident and office projection must then say so
 * and never count it as money received (RES-01 with N-1, COL-02, RES-02, COL-12). Also the credit-note
 * cap (COL-01, owner decision OD-1 pending: the recommended default), voucher drafts found again
 * (FIN-03), the policy draft sent as seen (FIN-04), "waiting for verification" (COL-04) and the pending
 * proof the resident can open (RES-03). Every refusal leaves the society's stores byte-identical, runs
 * after the authority checks and answers the same for another person's record as for one never issued.
 */
const SABA = 'alnoor_accounts';
const AYESHA = 'alnoor_treasurer';
const IMRAN = 'alnoor_manager';
const RABIA = 'alnoor_admin';
const KAMRAN = 'alnoor_resident_a101';
const SANA = 'alnoor_tenant_a102';
const SITE = '/sites/site_alnoor';
const A101 = 'ba_anr_a101';
const PETTY = 'cac_anr_petty';
const OFFICE = 'cac_anr_office';
const REASON = 'Recorded against the wrong flat by mistake';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type AccessFor = (p: Persona) => EffectiveAccess | null;
/** Access as configured, with test-only changes for named personas (added or removed permissions). */
const changed =
  (rules: Record<string, { add?: Permission[]; remove?: Permission[] } | (() => { add?: Permission[]; remove?: Permission[] })>): AccessFor =>
  (p) => {
    const a = effectiveAccessFor(p);
    const raw = rules[p.id];
    const r = typeof raw === 'function' ? raw() : raw;
    if (!a || !r) return a;
    return { ...a, permissions: [...a.permissions.filter((x) => !(r.remove ?? []).includes(x)), ...(r.add ?? [])] };
  };

function session(accessFor?: AccessFor) {
  const demo = new DemoStore(memory());
  let personaId: string | null = SABA;
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(accessFor ? { accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: IMRAN, projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}, opts: { key?: string } = {}) => (await ready, t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}) })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
    /** The society's stores (finance, bank, collections, billing, audit). */
    state: () =>
      demo.partition('tnt_alnoor').section<SocietyState>(SOCIETY_SECTION, () => {
        throw new Error('society state not created yet');
      }),
    snapshot: () => JSON.stringify(api.state()),
  };
  return api;
}
type Api = ReturnType<typeof session>;

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};

/** A refusal that changes nothing: the society's stores are byte-identical before and after. */
async function refusedUnchanged(s: Api, request: () => Promise<unknown>) {
  const before = s.snapshot();
  const r = await refusal(request());
  expect(s.snapshot()).toBe(before);
  return r;
}

const approve = (s: Api, persona: string, approvalId: string) => s.as(persona).post<ApprovalDetail>(`/approvals/${approvalId}/decide`, { decision: 'approve', reason: 'Checked against the cash book.' });

/** Office cash recorded by Saba and counted by Ayesha (D-46): the payment and its receipt. */
async function officeCash(s: Api, amount: string) {
  await s.as(AYESHA).patch(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true });
  const payer = (await s.as(SABA).get<FlatDetail>(`${SITE}/units/unt_anr_a101`)).currentPayer!;
  const recorded = await s.post<OfficeCashRecorded>('/payments/office', { accountId: A101, payerPartyId: payer.partyId, amount, idempotencyKey: `b1-cash-${amount}` }, { key: `b1-cash-${amount}` });
  const confirmed = await s.as(AYESHA).post<BatchDetail>(`/office-collections/${recorded.batch.id}/confirm`, { countedCash: amount });
  const outcome = confirmed.batch.lines[0]!.outcome;
  if (outcome?.kind !== 'payment') throw new Error('expected a payment');
  return s.as(SABA).get<PaymentDetail>(`/payments/${outcome.paymentId}`);
}

/** Saba asks, Ayesha approves: the approved reversal of an office-cash payment (Gate S.1). */
async function reverse(s: Api, paymentId: string) {
  const asked = await s.as(SABA).post<{ approvalId: string }>(`/payments/${paymentId}/reversal-request`, { reason: REASON });
  await approve(s, AYESHA, asked.approvalId);
  return asked.approvalId;
}

const officeBalance = async (s: Api) => (await s.as(SABA).get<BillingAccountDetail>(`/billing-accounts/${A101}`)).balance.amount;

describe('B1 shared scenario: office cash with 800 credit on A-101, then reversed', () => {
  it('RES-01 / N-1: every resident projection carries the reversal; the total equals the office balance; no credit is left', async () => {
    const s = session();
    const paid = await officeCash(s, '6000');
    expect(paid.payment).toMatchObject({ method: 'office_cash', unapplied: { amount: '800.00' } });
    const receiptId = paid.receipt.id;
    // Before: paid in full with 800 kept as credit (C.2 behaviour, unchanged).
    const before = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    expect(before.position).toMatchObject({ status: 'paid', totalPayable: { amount: '0.00' }, credit: { amount: '800.00' } });
    expect(before.receipts.find((r) => r.id === receiptId)?.reversed).toBeUndefined();
    expect(await officeBalance(s)).toBe('-800.00');

    await reverse(s, paid.payment.id);

    // (1) The receipt is kept and says it was reversed, with the date and the reason.
    const receipt = await s.as(KAMRAN).get<Receipt>(`/portal/dues/receipts/${receiptId}`);
    expect(receipt.reversed).toEqual({ on: '2026-10-26', reason: REASON });
    // (2) Home's receipt card is flagged; (4) the total equals the office balance (no reversed credit).
    const home = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    expect(home.receipts.find((r) => r.id === receiptId)).toMatchObject({ reversed: { on: '2026-10-26', reason: REASON } });
    expect(home.position).toMatchObject({ totalPayable: { amount: '5200.00' }, credit: { amount: '0.00' }, previousBalance: { amount: '1000.00' } });
    expect(home.position.totalPayable.amount).toBe(await officeBalance(s));
    expect(home.payee?.amount.amount).toBe('5200.00');
    // (3) The bill lists the payment as reversed; it settles nothing.
    const bill = await s.as(KAMRAN).get<DuesBillDetail>(`/portal/dues/bills/${home.position.current!.invoiceId}`);
    expect(bill.bill).toMatchObject({ paid: { amount: '0.00' }, open: { amount: '4200.00' }, settlement: 'unpaid' });
    expect(bill.payments).toEqual([expect.objectContaining({ receiptId, reversed: { on: '2026-10-26', reason: REASON } })]);
    expect(bill.position.totalPayable.amount).toBe('5200.00');
    // Pay and the bills list: the same total; the history row keeps no credit.
    expect((await s.as(KAMRAN).get<DuesPayInfo>('/portal/dues/pay')).position.totalPayable.amount).toBe('5200.00');
    const bills = await s.as(KAMRAN).get<DuesBills>('/portal/dues/bills');
    expect(bills.position.totalPayable.amount).toBe('5200.00');
    expect(bills.payments.find((p) => p.receiptId === receiptId)).toMatchObject({ reversed: true, unapplied: { amount: '0.00' } });
    expect(bills.receipts.find((r) => r.id === receiptId)?.reversed?.on).toBe('2026-10-26');
    // The stored record is history: never rewritten (the payment keeps its allocations and its 800).
    const stored = s.state().payments.find((p) => p.id === paid.payment.id)!;
    expect(stored).toMatchObject({ unapplied: { amount: '800.00' }, reversal: { reason: REASON } });
    expect(stored.allocations.length).toBeGreaterThan(0);
    expect(s.state().receipts.find((r) => r.id === receiptId)).toMatchObject({ amount: { amount: '6000.00' }, reversed: { on: '2026-10-26' } });
  });

  it('RES-01 (5, 6): receipts that are not reversed are unchanged; another resident gets the same 404 for a real receipt and one never issued', async () => {
    const s = session();
    const kept = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    const paid = await officeCash(s, '6000');
    await reverse(s, paid.payment.id);
    const home = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    for (const r of kept.receipts) expect(home.receipts.find((x) => x.id === r.id)).toEqual(r);
    // Other receipts of the society (seeded, verified) carry no reversal.
    const other = await s.as(SABA).get<PaymentList>('/payments');
    expect(other.items.filter((p) => p.reversed).map((p) => p.id)).toEqual([paid.payment.id]);
    // Sana (A-102) asks for Kamran's reversed receipt and for one never issued: one identical answer.
    const real = await refusedUnchanged(s, () => s.as(SANA).get(`/portal/dues/receipts/${paid.receipt.id}`));
    const never = await refusedUnchanged(s, () => s.as(SANA).get('/portal/dues/receipts/rct_anr_9999'));
    expect(real).toEqual(never);
    expect(real.status).toBe(404);
    // A resident cannot read the office payment list at all.
    expect((await refusedUnchanged(s, () => s.as(KAMRAN).get('/payments'))).status).toBe(403);
  });

  it('COL-02: the list keeps the reversed row as the audit trail but leaves it out of every total, count and credit; the dashboards agree', async () => {
    const s = session();
    const base = await s.as(SABA).get<PaymentList>('/payments');
    const baseSummary = await s.as(SABA).get<CollectionsSummary>('/collections/summary');
    const paid = await officeCash(s, '6000');
    const live = await s.as(SABA).get<PaymentList>('/payments');
    expect(live.totals).toMatchObject({ count: base.totals.count + 1, reversed: 0 });
    expect((await s.get<PaymentList>('/payments', { credit: '1' })).items.map((p) => p.id)).toContain(paid.payment.id);

    await reverse(s, paid.payment.id);
    const list = await s.as(SABA).get<PaymentList>('/payments');
    // (1) Listed, flagged reversed.
    expect(list.items.find((p) => p.id === paid.payment.id)).toMatchObject({ reversed: true, amount: { amount: '6000.00' } });
    // (2) Amount, allocated, credit left and count exclude it; how many reversed is said apart.
    expect(list.totals).toEqual({ ...base.totals, reversed: 1 });
    expect(list.items.length).toBe(base.totals.count + 1);
    // "With credit left" leaves it out.
    expect((await s.get<PaymentList>('/payments', { credit: '1' })).items.map((p) => p.id)).not.toContain(paid.payment.id);
    // (3) The dashboard's collected count equals the list's counted rows; the amount is unchanged by the reversal.
    const summary = await s.get<CollectionsSummary>('/collections/summary');
    expect(summary.collected).toEqual({ ...baseSummary.collected, payments: list.totals.count });
    expect(summary.credit).toEqual(baseSummary.credit);
    // "Latest payments" badges it.
    expect(summary.recent.find((p) => p.id === paid.payment.id)).toMatchObject({ reversed: true });
    // (4) HOME-001 (the role dashboard) shows exactly the same collections figures as COL-001.
    const dashboard = await s.as(AYESHA).get<SocietyDashboard>('/society/dashboard');
    expect(dashboard.collections).toEqual(await s.as(AYESHA).get<CollectionsSummary>('/collections/summary'));
    // (5) Payment 360 keeps its reversal record; no credit can be applied from a reversed payment.
    const detail = await s.as(AYESHA).get<PaymentDetail>(`/payments/${paid.payment.id}`);
    expect(detail.payment.reversal).toMatchObject({ reason: REASON, approvedByName: 'Ayesha Malik' });
    expect(detail.actions.applyCredit).toBe(false);
    expect(detail.creditTargets.length).toBeGreaterThan(0);
  });

  it('COL-02: credit is never applied from a reversed payment (refused unchanged, after the permission check)', async () => {
    const s = session();
    const paid = await officeCash(s, '6000');
    await reverse(s, paid.payment.id);
    const stale = await refusedUnchanged(s, () => s.as(AYESHA).post(`/payments/${paid.payment.id}/apply-credit`, {}));
    expect(stale).toMatchObject({ status: 409, code: 'already_reversed', messageKey: 'collections:problems.reversedNoCredit' });
    // Without the permission: refused before anything about the payment is said (same as one never issued).
    const noRight = await refusedUnchanged(s, () => s.as(IMRAN).post(`/payments/${paid.payment.id}/apply-credit`, {}));
    const noRightNever = await refusedUnchanged(s, () => s.as(IMRAN).post('/payments/pay_anr_9999/apply-credit', {}));
    expect(noRight).toEqual(noRightNever);
    expect(noRight.status).toBe(403);
  });

  it('a reversal is not replayed: a second request and a second approval are refused and change nothing', async () => {
    const s = session();
    const paid = await officeCash(s, '6000');
    const approvalId = await reverse(s, paid.payment.id);
    expect(await refusedUnchanged(s, () => s.as(SABA).post(`/payments/${paid.payment.id}/reversal-request`, { reason: REASON }))).toMatchObject({ status: 409, code: 'already_reversed' });
    expect((await refusedUnchanged(s, () => approve(s, AYESHA, approvalId))).status).toBe(409);
    const home = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    expect(home.position.totalPayable.amount).toBe('5200.00');
  });

  it('RES-02 / N-2: My properties shows the credit itself, from the data, and none once that payment is reversed', async () => {
    const s = session();
    const paid = await officeCash(s, '6000');
    const [inCredit] = await s.as(KAMRAN).get<MyProperty[]>('/portal/properties');
    expect(inCredit).toMatchObject({ flatCode: 'A-101', balanceState: 'credit', balance: '0.00', credit: '800.00', siteName: 'Al-Noor Residency' });
    await reverse(s, paid.payment.id);
    const [after] = await s.as(KAMRAN).get<MyProperty[]>('/portal/properties');
    expect(after).toMatchObject({ balanceState: 'overdue', balance: '5200.00', credit: '0.00' });
    // Owing flats are unchanged in shape: Sana owes her November bill, no credit.
    const [sana] = await s.as(SANA).get<MyProperty[]>('/portal/properties');
    expect(sana).toMatchObject({ flatCode: 'A-102', credit: '0.00' });
    expect(['due', 'overdue']).toContain(sana!.balanceState);
  });

  it('COL-12: a payment and its reversal are two statement rows with distinct keys; the totals are the sum of the rows', async () => {
    const s = session();
    const paid = await officeCash(s, '6000');
    await reverse(s, paid.payment.id);
    for (const range of [{ from: '2026-10-01', to: '2026-10-31' }, { from: '2026-11-01', to: '2026-11-30' }, { from: '2026-09-01', to: '2026-11-30' }]) {
      const st = await s.as(AYESHA).get<Statement>(`/statements/${A101}`, range);
      const keys = st.entries.map((e) => `${e.kind}-${e.refId}`);
      expect(new Set(keys).size, JSON.stringify(range)).toBe(keys.length);
      const delta = st.entries.reduce((n, e) => n + Math.round(Number((e.debit ?? e.credit)!.amount) * 100) * (e.debit ? 1 : -1), 0);
      expect(Math.round(Number(st.previousBalance.amount) * 100) + delta).toBe(Math.round(Number(st.closingBalance.amount) * 100));
    }
    const october = await s.get<Statement>(`/statements/${A101}`, { from: '2026-10-01', to: '2026-10-31' });
    const pair = october.entries.filter((e) => e.refId === paid.payment.id).map((e) => e.kind);
    expect(pair).toEqual(['payment', 'payment_reversal']);
    // The resident's statement too.
    const mine = await s.as(KAMRAN).get<Statement>('/portal/dues/statement');
    const own = mine.entries.map((e) => `${e.kind}-${e.refId}`);
    expect(new Set(own).size).toBe(own.length);
    expect(mine.closingBalance.amount).toBe('5200.00');
  });
});

describe('COL-01: a credit note never credits money already paid (OD-1 recommended default)', () => {
  it('open = billed − paid − credited; above it is refused with nothing changed; equal to it leaves 0, never below; a reversal reopens it', async () => {
    const s = session();
    const home = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    const invoiceId = home.position.current!.invoiceId;
    const paid = await officeCash(s, '3000'); // 1,000 October balance, then 2,000 of November's maintenance
    const inv = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    const maintenance = inv.invoice.lines.find((l) => l.category === 'maintenance')!;
    // (1) Open shows amount − paid − credited, per line, from the server.
    expect(inv.creditable.find((c) => c.lineId === maintenance.id)).toEqual({ lineId: maintenance.id, billed: { amount: '3000.00', currency: 'PKR' }, paid: { amount: '2000.00', currency: 'PKR' }, credited: { amount: '0.00', currency: 'PKR' }, open: { amount: '1000.00', currency: 'PKR' } });
    expect(inv.invoice).toMatchObject({ settlement: 'partially_paid', outstanding: { amount: '2200.00' } });
    // (2) Above it: 422 on that line with the open amount and the flat; no credit note, no number used.
    const over = await refusedUnchanged(s, () => s.as(AYESHA).post(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'Lift out of service', lines: [{ lineId: maintenance.id, amount: '1500' }] }));
    expect(over).toMatchObject({ status: 422, code: 'validation_failed', errors: { [`lines.${maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '1000.00', unit: 'A-101' } }] } });
    // Money already paid can never be credited, even a paisa above the open amount.
    expect((await refusedUnchanged(s, () => s.as(AYESHA).post(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'Lift out of service', lines: [{ lineId: maintenance.id, amount: '1000.01' }] }))).status).toBe(422);
    // (3) Equal to it: issued; outstanding never goes below 0.
    const cn = await s.as(AYESHA).post<CreditNote>(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'Lift out of service', lines: [{ lineId: maintenance.id, amount: '1000' }] });
    expect(cn.amount.amount).toBe('1000.00');
    const rest = inv.invoice.lines.filter((l) => l.id !== maintenance.id).map((l) => ({ lineId: l.id, amount: l.amount.amount }));
    await s.as(AYESHA).post<CreditNote>(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'Waived by the committee', lines: rest });
    const settled = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    // (4) "Paid" only with nothing outstanding, never beside a negative figure.
    expect(settled.invoice).toMatchObject({ outstanding: { amount: '0.00' }, settlement: 'paid' });
    expect(settled.creditable.every((c) => c.open.amount === '0.00')).toBe(true);
    expect(settled.actions.creditNote).toBe(false);
    expect((await refusedUnchanged(s, () => s.as(AYESHA).post(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'One more try', lines: [{ lineId: maintenance.id, amount: '1' }] }))).errors[`lines.${maintenance.id}`]?.[0]?.params).toEqual({ open: '0.00', unit: 'A-101' });
    // (5) After the payment is reversed, its money is open again (and creditable).
    await reverse(s, paid.payment.id);
    const reopened = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    expect(reopened.creditable.find((c) => c.lineId === maintenance.id)?.open.amount).toBe('2000.00');
    expect(reopened.invoice).toMatchObject({ outstanding: { amount: '2000.00' }, settlement: 'unpaid' });
    expect(reopened.actions.creditNote).toBe(true);
  });

  it('a line credited beyond what was open before this rule (history, never rewritten) reads as nothing open, never below zero', async () => {
    const s = session();
    const invoiceId = (await s.as(KAMRAN).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    await officeCash(s, '3000');
    const inv = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    const maintenance = inv.invoice.lines.find((l) => l.category === 'maintenance')!;
    // White-box: a credit note stored before B1 credited all 3,000 of a line already 2,000 paid. It stays.
    s.state().creditNotes.push({ id: 'crn_anr_legacy', ref: 'ANR-CN-LEGACY', invoiceId, invoiceRef: inv.invoice.ref, billingAccountId: A101, on: '2026-10-25', amount: { amount: '3000.00', currency: 'PKR' }, lines: [{ invoiceLineId: maintenance.id, category: 'maintenance', unitCode: 'A-101', amount: { amount: '3000.00', currency: 'PKR' } }], reason: 'Credited before the cap', createdBy: 'usr_anr_0002', createdByName: 'Ayesha Malik' });
    const after = await s.get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    expect(after.creditable.find((c) => c.lineId === maintenance.id)).toMatchObject({ credited: { amount: '3000.00' }, paid: { amount: '2000.00' }, open: { amount: '0.00' } });
    const more = await refusedUnchanged(s, () => s.as(AYESHA).post(`/billing/invoices/${invoiceId}/credit-notes`, { reason: 'One more try', lines: [{ lineId: maintenance.id, amount: '1' }] }));
    expect(more.errors[`lines.${maintenance.id}`]?.[0]?.params).toEqual({ open: '0.00', unit: 'A-101' });
  });

  it('wrong permission or another organisation: refused before any amount is checked, the same for a real invoice and one never issued', async () => {
    const s = session();
    const invoiceId = (await s.as(KAMRAN).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const line = (await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`)).invoice.lines[0]!;
    const body = { reason: 'Lift out of service', lines: [{ lineId: line.id, amount: '99999' }] };
    for (const persona of [SABA, IMRAN, KAMRAN, 'society_admin', 'cedar_treasurer']) {
      const real = await refusedUnchanged(s, () => s.as(persona).post(`/billing/invoices/${invoiceId}/credit-notes`, body));
      const never = await refusedUnchanged(s, () => s.as(persona).post('/billing/invoices/cin_anr_9999/credit-notes', body));
      expect(real, persona).toEqual(never);
      expect(real.status, persona).toBe(403);
    }
  });
});

describe('FIN-03: a voucher draft can be found again; it is never money', () => {
  const voucher = (purpose: string) => ({ accountId: PETTY, direction: 'payment', category: 'office_supplies', amount: '250', onDate: '2026-10-26', purpose, counterparty: 'City Stationers', evidence: { name: 'stationery.jpg', kind: 'receipt', size: 1000 }, submit: false });

  it("the preparer's drafts are in the cashbook's pending list, on their account only; no total or dashboard changes; submitting later works", async () => {
    const s = session();
    const overview = JSON.stringify(await s.as(SABA).get<FinanceOverview>('/finance/overview'));
    const book = await s.get<CashbookView>('/finance/cashbook');
    const draft = await s.post<VoucherDetail>('/finance/vouchers', { ...voucher('Printer paper for notices'), idempotencyKey: 'b1-draft-1' }, { key: 'b1-draft-1' });
    expect(draft.voucher.status).toBe('draft');
    expect(draft.actions).toMatchObject({ edit: true, submit: true });
    const after = await s.get<CashbookView>('/finance/cashbook');
    expect(after.pending.filter((x) => x.kind === 'voucher_draft')).toEqual([expect.objectContaining({ id: draft.voucher.id, ref: draft.voucher.ref, amount: { amount: '250.00', currency: 'PKR' }, accountId: PETTY, href: `/backoffice/bank/cashbook?voucher=${draft.voucher.id}` })]);
    // (7) A draft is not money: the cashbook's figures and the finance dashboard are exactly as before.
    const { pending: _p1, ...bookRest } = book;
    const { pending: _p2, ...afterRest } = after;
    expect(afterRest).toEqual(bookRest);
    expect(after.pending.filter((x) => x.kind !== 'voucher_draft')).toEqual(book.pending);
    expect(JSON.stringify(await s.get<FinanceOverview>('/finance/overview'))).toBe(overview);
    // On its own account only.
    expect((await s.get<CashbookView>('/finance/cashbook', { account: PETTY })).pending.some((x) => x.id === draft.voucher.id)).toBe(true);
    expect((await s.get<CashbookView>('/finance/cashbook', { account: OFFICE })).pending.some((x) => x.id === draft.voucher.id)).toBe(false);
    // (2) It opens again by its own address; (4) sending it later works and it leaves the drafts.
    expect((await s.get<VoucherDetail>(`/finance/vouchers/${draft.voucher.id}`)).voucher.status).toBe('draft');
    const sent = await s.post<VoucherDetail>(`/finance/vouchers/${draft.voucher.id}/submit`);
    expect(sent.voucher.status).toBe('submitted');
    const later = await s.get<CashbookView>('/finance/cashbook');
    expect(later.pending.some((x) => x.kind === 'voucher_draft')).toBe(false);
    expect(later.pending.find((x) => x.id === draft.voucher.id)?.kind).toBe('awaiting_approval');
  });

  it('nobody else sees the draft: readers without cash_voucher.prepare, another preparer, a revoked preparer, another legal entity', async () => {
    let revoked = false;
    const s = session(changed({ [RABIA]: { add: ['cash_voucher.prepare'] }, [SABA]: () => (revoked ? { remove: ['cash_voucher.prepare'] } : {}) }));
    const draft = await s.as(SABA).post<VoucherDetail>('/finance/vouchers', { ...voucher('Bulbs for the stairwell'), idempotencyKey: 'b1-draft-2' }, { key: 'b1-draft-2' });
    const drafts = async (persona: string) => (await s.as(persona).get<CashbookView>('/finance/cashbook')).pending.filter((x) => x.kind === 'voucher_draft').map((x) => x.id);
    expect(await drafts(SABA)).toEqual([draft.voucher.id]);
    for (const persona of [AYESHA, IMRAN, RABIA]) expect(await drafts(persona), persona).toEqual([]);
    // A draft of another legal entity (white-box: the stored voucher moved) is never listed.
    const stored = s.state().finance.vouchers.find((v) => v.id === draft.voucher.id)!;
    stored.legalEntityId = 'le_other';
    expect(await drafts(SABA)).toEqual([]);
    stored.legalEntityId = 'le_alnoor';
    revoked = true;
    expect(await drafts(SABA)).toEqual([]);
  });

  it('only the preparer edits a draft; a draft moved into a closed month is refused and stays as it was (the refusal itself is recorded, I-27)', async () => {
    const s = session(changed({ [RABIA]: { add: ['cash_voucher.prepare'] } }));
    const draft = await s.as(SABA).post<VoucherDetail>('/finance/vouchers', { ...voucher('Cleaning supplies'), idempotencyKey: 'b1-draft-3' }, { key: 'b1-draft-3' });
    const edited = await s.patch<VoucherDetail>(`/finance/vouchers/${draft.voucher.id}`, { ...voucher('Cleaning supplies for October'), amount: '300' });
    expect(edited.voucher).toMatchObject({ purpose: 'Cleaning supplies for October', amount: { amount: '300.00' }, status: 'draft' });
    expect(await refusedUnchanged(s, () => s.as(RABIA).patch(`/finance/vouchers/${draft.voucher.id}`, voucher('Not hers to change')))).toMatchObject({ status: 403, code: 'not_preparer' });
    const vouchers = JSON.stringify(s.state().finance.vouchers);
    const audit = s.state().audit.length;
    const late = await refusal(s.as(SABA).patch(`/finance/vouchers/${draft.voucher.id}`, { ...voucher('Cleaning supplies'), onDate: '2026-09-20' }));
    expect(late).toMatchObject({ status: 409, code: 'period_closed' });
    expect(JSON.stringify(s.state().finance.vouchers)).toBe(vouchers);
    expect(s.state().finance.periods.find((p) => p.period === '2026-09')!.history.at(-1)).toMatchObject({ action: 'posting_refused' });
    expect(s.state().audit.length).toBe(audit + 1);
  });
});

describe('FIN-04: a policy draft keeps its date and note, and is sent exactly as its author saw it', () => {
  type Rule = PolicyOverview['versions'][number]['rules'][number];
  const asInput = (rules: readonly Rule[]) => rules.map((r) => ({ subject: r.subject, minAmount: r.minAmount?.amount, maxAmount: r.maxAmount?.amount, approvers: r.approvers, approvalsRequired: r.approvalsRequired }));

  async function drafted(s: Api) {
    const o = await s.as(RABIA).post<PolicyOverview>('/approval-policies');
    return o.versions.find((v) => v.status === 'draft')!;
  }

  it('the saved date persists (never reset); a send whose rules, date or note differ from the stored draft is refused unchanged; the matching send goes', async () => {
    const s = session();
    const d = await drafted(s);
    expect(d.effectiveFrom).toBe('2026-10-27');
    // Read now: the overview hands back the stored version, which the save below changes.
    const unsavedRule = asInput(d.rules);
    const rules = asInput(d.rules).map((r) => (r.subject === 'cash_voucher' ? { ...r, approvalsRequired: 2 } : r));
    await s.patch(`/approval-policies/${d.id}`, { rules, effectiveFrom: '2026-12-01', note: 'Two signatures on vouchers' });
    const saved = (await s.get<PolicyOverview>('/approval-policies')).versions.find((v) => v.id === d.id)!;
    expect(saved).toMatchObject({ effectiveFrom: '2026-12-01', note: 'Two signatures on vouchers' });
    const expected = { rules, effectiveFrom: '2026-12-01', note: 'Two signatures on vouchers' };
    expect(unsavedRule).not.toEqual(rules);
    for (const stale of [{ ...expected, rules: unsavedRule }, { ...expected, effectiveFrom: '2026-11-01' }, { ...expected, note: 'Something else' }]) {
      expect(await refusedUnchanged(s, () => s.as(RABIA).post(`/approval-policies/${d.id}/submit`, { expected: stale }))).toMatchObject({ status: 409, code: 'policy_changed', messageKey: 'finance:problems.policy_changed' });
    }
    // An invalid "expected" version is refused like an invalid save, unchanged.
    expect((await refusedUnchanged(s, () => s.as(RABIA).post(`/approval-policies/${d.id}/submit`, { expected: { ...expected, rules: [] } }))).status).toBe(422);
    // The same rules written another way (amount as entered) are the same policy: sent.
    const sent = await s.as(RABIA).post<PolicyOverview>(`/approval-policies/${d.id}/submit`, { expected: { ...expected, note: '  Two signatures on vouchers ' } });
    const pending = sent.versions.find((v) => v.id === d.id)!;
    expect(pending).toMatchObject({ status: 'pending', effectiveFrom: '2026-12-01' });
    // (5) What the approvers see is what the author saw.
    expect(asInput(pending.rules)).toEqual(asInput(saved.rules));
    expect(pending.rules.find((r) => r.subject === 'cash_voucher')?.approvalsRequired).toBe(2);
  });

  it('the authority check comes first: a reader without the permission and a holder who is not the author get the same refusal whatever they claim to have seen', async () => {
    const s = session(changed({ [IMRAN]: { add: ['approval_policy.manage'] } }));
    const d = await drafted(s);
    const right = { rules: asInput(d.rules), effectiveFrom: d.effectiveFrom, note: d.note };
    const wrong = { ...right, effectiveFrom: '2027-01-01' };
    for (const persona of [AYESHA, IMRAN]) {
      const a = await refusedUnchanged(s, () => s.as(persona).post(`/approval-policies/${d.id}/submit`, { expected: right }));
      const b = await refusedUnchanged(s, () => s.as(persona).post(`/approval-policies/${d.id}/submit`, { expected: wrong }));
      expect(a, persona).toEqual(b);
      expect(a.status, persona).toBe(403);
    }
  });
});

describe('COL-04 and RES-03: what waits for the office, and the proof the resident can open', () => {
  const slip = (name: string) => ({ name, type: 'image/jpeg', size: 214_000 });

  it('a proof sent back to the resident is not waiting for verification: the dashboards agree and the tile opens exactly the counted list', async () => {
    const s = session();
    const before = await s.as(AYESHA).get<CollectionsSummary>('/collections/summary');
    const sent = await s.as(KAMRAN).post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-26', bankReference: 'A101 NOV', file: slip('kamran-nov.jpg') });
    await s.as(SABA).post<SubmissionDetail>(`/payment-submissions/${sent.submission.id}/request-information`, { message: 'Please send the full slip with the date.' });
    const summary = await s.as(AYESHA).get<CollectionsSummary>('/collections/summary');
    // (1) The pending amount excludes it; (2) "Still owed" still includes it.
    expect(summary.pending).toEqual(before.pending);
    expect(summary.progress).toEqual(before.progress);
    expect(summary.pending.href).toBe('/backoffice/fin/unverified-transfers-queue?state=waiting');
    expect(summary.queue.needsInformation).toBe(before.queue.needsInformation + 1);
    // (3) The list the tile opens has exactly the tile's count and amount.
    const waiting = await s.get<SubmissionQueue>('/payment-submissions', { state: 'waiting' });
    expect(waiting.items.length).toBe(summary.pending.submissions);
    expect(waiting.items.some((x) => x.id === sent.submission.id)).toBe(false);
    expect(waiting.pending).toEqual(summary.pending.amount);
    // (4) HOME-001 and FIN-001 say the same.
    expect((await s.get<SocietyDashboard>('/society/dashboard')).collections?.pending).toEqual(summary.pending);
    const fin = await s.get<FinanceOverview>('/finance/overview');
    expect([fin.pendingVerification.amount, fin.pendingVerification.count, fin.pendingVerification.href]).toEqual([summary.pending.amount, summary.pending.submissions, summary.pending.href]);
    // The month close still blocks on every unsettled proof (returned ones included), as before.
    expect((await s.get<{ checks: Array<{ key: string; count: number }> }>('/finance/periods/2026-10/checklist')).checks.find((c) => c.key === 'proofs_waiting')?.count).toBe(summary.pending.submissions + 1);
  });

  it("Home and the bill name the pending proof in all four pending states; never a returned, rejected or verified one, never another payer's", async () => {
    const s = session();
    const pendingId = async (persona = KAMRAN) => {
      const home = await s.as(persona).get<DuesHome>('/portal/dues/home');
      const bill = home.position.current ? await s.as(persona).get<DuesBillDetail>(`/portal/dues/bills/${home.position.current.invoiceId}`) : null;
      if (bill) expect(bill.position.pendingSubmissionId).toBe(home.position.pendingSubmissionId);
      return { id: home.position.pendingSubmissionId, status: home.position.status };
    };
    expect(await pendingId()).toEqual({ id: undefined, status: 'unpaid' });
    const sent = await s.as(KAMRAN).post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-26', bankReference: 'A101 NOV', file: slip('kamran.jpg') });
    const id = sent.submission.id;
    expect(await pendingId()).toEqual({ id, status: 'pending_verification' });
    await s.as(SABA).post(`/payment-submissions/${id}/review`);
    expect(await pendingId()).toEqual({ id, status: 'pending_verification' });
    await s.as(SABA).post(`/payment-submissions/${id}/await-bank`, { note: 'Not on the statements imported so far.' });
    expect(await pendingId()).toEqual({ id, status: 'pending_verification' });
    // Exception pending (white-box: the stored state, as an approved-exception request leaves it).
    const stored = s.state().submissions.find((x) => x.id === id)!;
    stored.state = 'exception_pending';
    expect(await pendingId()).toEqual({ id, status: 'pending_verification' });
    stored.state = 'under_review';
    await s.as(SABA).post(`/payment-submissions/${id}/request-information`, { message: 'Please send the full slip with the date.' });
    expect((await pendingId()).id).toBeUndefined();
    await s.as(KAMRAN).post(`/portal/dues/submissions/${id}/resubmit`, { amount: '5200', transferDate: '2026-10-26', bankReference: 'A101 NOV', file: slip('kamran-full.jpg') });
    expect((await pendingId()).id).toBe(id);
    await s.as(SABA).post(`/payment-submissions/${id}/reject`, { reason: 'This slip is from another account.' });
    expect((await pendingId()).id).toBeUndefined();
    // Junaid (tenant, A-202) sends a proof on the account he shares with the owner: Rabia never sees it named.
    await s.as('alnoor_tenant_a202').post('/portal/dues/submissions', { amount: '4200', transferDate: '2026-10-25', bankReference: 'A202 NOV', file: slip('junaid.jpg') });
    expect((await pendingId('alnoor_tenant_a202')).id).toBeDefined();
    expect((await pendingId('alnoor_owner_a201')).id).toBeUndefined();
  });

  it('a verified proof is not pending', async () => {
    const s = session();
    const sent = await s.as(KAMRAN).post<ResidentSubmissionDetail>('/portal/dues/submissions', { amount: '5200', transferDate: '2026-10-26', bankReference: 'ANR-A101-2026-11', file: slip('kamran-ok.jpg') });
    const detail = await s.as(SABA).post<SubmissionDetail>(`/payment-submissions/${sent.submission.id}/review`);
    await s.post(`/payment-submissions/${sent.submission.id}/verify`, { bankLineId: detail.candidates[0]!.bankLine.id, amount: '5200' });
    const home = await s.as(KAMRAN).get<DuesHome>('/portal/dues/home');
    expect(home.position.pendingSubmissionId).toBeUndefined();
    expect(home.position.status).toBe('paid');
  });
});

describe('GitHub Issue #19: one credit note can never credit a line twice or credit a line of another bill', () => {
  /** A-101's November bill after 3,000 office cash: maintenance billed 3,000, paid 2,000, so 1,000 open. */
  async function oneThousandOpen() {
    const s = session();
    const invoiceId = (await s.as(KAMRAN).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const paid = await officeCash(s, '3000');
    const inv = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    const line = (category: string) => inv.invoice.lines.find((l) => l.category === category)!;
    const open = (d: InvoiceDetail, id: string) => d.creditable.find((c) => c.lineId === id)!.open.amount;
    const post = (body: unknown) => s.as(AYESHA).post<CreditNote>(`/billing/invoices/${invoiceId}/credit-notes`, body);
    const read = () => s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
    return { s, invoiceId, paid, inv, maintenance: line('maintenance'), security: line('security'), lift: line('lift'), water: line('water'), open, post, read };
  }
  const REASON_CN = 'Demo correction';
  const duplicate = (id: string) => ({ [`lines.${id}`]: [{ code: 'billing:creditNote.problems.duplicateLine', params: { unit: 'A-101' } }] });
  const MISMATCH = { lines: [{ code: 'billing:creditNote.problems.linesMismatch' }] };
  const failed = (errors: Record<string, unknown>) => ({ status: 422, code: 'validation_failed', messageKey: 'errors:validation.summary', errors });

  it('(1) 600 + 600 on the same line with 1,000.00 open: 422 at that line; the whole store is byte-identical (numbering and audit included)', async () => {
    const t = await oneThousandOpen();
    expect(t.open(t.inv, t.maintenance.id)).toBe('1000.00');
    const twice = { reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '600.00' }, { lineId: t.maintenance.id, amount: '600.00' }] };
    const counters = JSON.stringify(t.s.state().counters);
    const audit = t.s.state().audit.length;
    const r = await refusedUnchanged(t.s, () => t.post(twice));
    expect(r).toEqual(failed(duplicate(t.maintenance.id)));
    expect(JSON.stringify(t.s.state().counters)).toBe(counters);
    expect(t.s.state().audit.length).toBe(audit);
    expect(t.s.state().creditNotes).toEqual([]);
    // Deterministic: the same request answers the same way again, still changing nothing.
    expect(await refusedUnchanged(t.s, () => t.post(twice))).toEqual(r);
    // No number was used: the next legitimate credit note is the first one.
    const cn = await t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '600.00' }] });
    expect(cn).toMatchObject({ ref: 'ANR-CN-0001', amount: { amount: '600.00' } });
    expect(cn.lines).toHaveLength(1);
    const after = await t.read();
    expect(after.invoice.outstanding.amount).toBe('1600.00');
    expect(t.open(after, t.maintenance.id)).toBe('400.00');
  });

  it('(2) 1,000 + 0.01 on one line, and any mixture of good and duplicated or unknown entries: refused whole, nothing partly issued', async () => {
    const t = await oneThousandOpen();
    const cases: Array<[string, unknown[], Record<string, unknown>]> = [
      ['1000 + 0.01', [{ lineId: t.maintenance.id, amount: '1000.00' }, { lineId: t.maintenance.id, amount: '0.01' }], duplicate(t.maintenance.id)],
      ['adding up to exactly the open amount is still one line sent twice', [{ lineId: t.maintenance.id, amount: '400' }, { lineId: t.maintenance.id, amount: '600' }], duplicate(t.maintenance.id)],
      ['a blank entry beside an amount for the same line', [{ lineId: t.maintenance.id, amount: '' }, { lineId: t.maintenance.id, amount: '600' }], duplicate(t.maintenance.id)],
      ['good security and lift around a duplicated maintenance', [{ lineId: t.security.id, amount: '500' }, { lineId: t.maintenance.id, amount: '600' }, { lineId: t.lift.id, amount: '100' }, { lineId: t.maintenance.id, amount: '400' }], duplicate(t.maintenance.id)],
      ['two lines each sent twice', [{ lineId: t.security.id, amount: '100' }, { lineId: t.water.id, amount: '100' }, { lineId: t.security.id, amount: '100' }, { lineId: t.water.id, amount: '100' }], { ...duplicate(t.security.id), ...duplicate(t.water.id) }],
      ['a good line beside a line never issued', [{ lineId: t.security.id, amount: '500' }, { lineId: 'iln_0000000000000000', amount: '100' }], MISMATCH],
      ['a good line beside a malformed entry', [{ lineId: t.security.id, amount: '500' }, null], MISMATCH],
      ['an invalid amount on a duplicated line is still the duplicate', [{ lineId: t.maintenance.id, amount: 'abc' }, { lineId: t.maintenance.id, amount: '600' }], duplicate(t.maintenance.id)],
    ];
    for (const [name, lines, errors] of cases) {
      const r = await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines }));
      expect(r, name).toEqual(failed(errors));
    }
    // A missing reason is reported beside the duplicate; still nothing issued.
    const both = await refusedUnchanged(t.s, () => t.post({ reason: 'x', lines: [{ lineId: t.maintenance.id, amount: '1' }, { lineId: t.maintenance.id, amount: '1' }] }));
    expect(both.errors).toEqual({ reason: [{ code: 'billing:creditNote.problems.reason' }], ...duplicate(t.maintenance.id) });
    expect(t.s.state().creditNotes).toEqual([]);
    const still = await t.read();
    expect(still.creditable.map((c) => c.open.amount)).toEqual(t.inv.creditable.map((c) => c.open.amount));
    expect(still.invoice.outstanding.amount).toBe('2200.00');
  });

  it('(3) different lines credited together within their open amounts still work; a repeated request is checked against what is left and never passes the cap', async () => {
    const t = await oneThousandOpen();
    const body = { reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '600' }, { lineId: t.security.id, amount: '500' }, { lineId: t.lift.id, amount: '100' }] };
    const cn = await t.post(body);
    expect(cn).toMatchObject({ ref: 'ANR-CN-0001', amount: { amount: '1200.00' } });
    expect(cn.lines.map((l) => [l.invoiceLineId, l.amount.amount])).toEqual([[t.maintenance.id, '600.00'], [t.security.id, '500.00'], [t.lift.id, '100.00']]);
    const after = await t.read();
    expect([t.maintenance, t.security, t.lift, t.water].map((l) => t.open(after, l.id))).toEqual(['400.00', '0.00', '200.00', '400.00']);
    expect(after.invoice.outstanding.amount).toBe('1000.00');
    // This endpoint has no request-key replay (it is not one of Issue #18's six creates). The rule that keeps
    // a retry safe: every request is checked against what is still open after every earlier credit note, so
    // the same request sent again is refused as soon as it would pass the cap, and changes nothing.
    const again = await refusedUnchanged(t.s, () => t.s.as(AYESHA).post(`/billing/invoices/${t.invoiceId}/credit-notes`, body, { key: 'cn-retry-1' }));
    expect(again.errors).toEqual({
      [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '400.00', unit: 'A-101' } }],
      [`lines.${t.security.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '0.00', unit: 'A-101' } }],
    });
    // A repeat that still fits is a second, separately numbered credit note, on the invoice and in the audit;
    // repeating it until refused can never take a line below zero.
    const small = { reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '300' }] };
    expect((await t.s.as(AYESHA).post<CreditNote>(`/billing/invoices/${t.invoiceId}/credit-notes`, small, { key: 'cn-retry-2' })).ref).toBe('ANR-CN-0002');
    expect((await refusedUnchanged(t.s, () => t.s.as(AYESHA).post(`/billing/invoices/${t.invoiceId}/credit-notes`, small, { key: 'cn-retry-2' }))).errors).toEqual({
      [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '100.00', unit: 'A-101' } }],
    });
    const end = await t.read();
    expect(end.creditNotes.map((c) => c.ref)).toEqual(['ANR-CN-0001', 'ANR-CN-0002']);
    expect(end.creditable.every((c) => Number(c.open.amount) >= 0)).toBe(true);
    expect(end.invoice.outstanding.amount).toBe('700.00');
    expect(t.s.state().audit.filter((a) => a.action === 'creditNoteIssued')).toHaveLength(2);
  });

  it('(4) money already paid stays out of reach; a reversal reopens exactly billed − live paid − credited, and duplicates stay refused at every step', async () => {
    const t = await oneThousandOpen();
    await t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '600' }] });
    // 400 open: one line sent twice is refused even when the two add up to exactly what is open.
    expect((await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '200' }, { lineId: t.maintenance.id, amount: '200' }] }))).errors).toEqual(duplicate(t.maintenance.id));
    expect((await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '400.01' }] }))).errors).toEqual({
      [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '400.00', unit: 'A-101' } }],
    });
    await reverse(t.s, t.paid.payment.id);
    const reopened = await t.read();
    expect(reopened.creditable.find((c) => c.lineId === t.maintenance.id)).toMatchObject({ billed: { amount: '3000.00' }, paid: { amount: '0.00' }, credited: { amount: '600.00' }, open: { amount: '2400.00' } });
    const sum = reopened.creditable.reduce((n, c) => n + Math.round(Number(c.open.amount) * 100), 0);
    expect(reopened.invoice.outstanding.amount).toBe('3600.00');
    expect(sum).toBe(360000);
    expect((await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '1200' }, { lineId: t.maintenance.id, amount: '1200' }] }))).errors).toEqual(duplicate(t.maintenance.id));
    await t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '2400' }] });
    const done = await t.read();
    expect(t.open(done, t.maintenance.id)).toBe('0.00');
    expect(done.invoice.outstanding.amount).toBe('1200.00');
    expect((await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '0.01' }] }))).errors[`lines.${t.maintenance.id}`]?.[0]?.params).toEqual({ open: '0.00', unit: 'A-101' });
  });

  it('(5) lines of another bill, never issued or malformed get one answer that names nothing; without the right, the same refusal whatever the body says', async () => {
    const t = await oneThousandOpen();
    const sana = (await t.s.as(SANA).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const otherBill = (await t.s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${sana}`)).invoice;
    const list = await t.s.as(AYESHA).get<InvoiceList>('/billing/invoices');
    const ownEarlier = list.items.find((i) => i.billingAccountId === A101 && i.id !== t.invoiceId)!;
    const earlierLine = (await t.s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${ownEarlier.id}`)).invoice.lines[0]!;
    const foreign: Array<[string, unknown]> = [
      ["a line of A-102's bill (same category)", [{ lineId: otherBill.lines.find((l) => l.category === 'maintenance')!.id, amount: '100' }]],
      ["a line of A-101's earlier bill", [{ lineId: earlierLine.id, amount: '100' }]],
      ['a line never issued', [{ lineId: 'iln_0000000000000000', amount: '100' }]],
      ['a line id that is not text', [{ lineId: 42, amount: '100' }]],
      ['an entry with no line id', [{ amount: '100' }]],
      ['lines that are not a list (text)', 'iln_0000000000000000'],
      ['lines that are not a list (object)', { [t.maintenance.id]: '100' }],
    ];
    const answers: Array<readonly [string, Awaited<ReturnType<typeof refusal>>]> = [];
    for (const [name, lines] of foreign) answers.push([name, await refusedUnchanged(t.s, () => t.post({ reason: REASON_CN, lines }))] as const);
    for (const [name, r] of answers) expect(r, name).toEqual(failed(MISMATCH));
    // Nothing about another bill leaks: no flat, no amount, no line id in any answer.
    expect(JSON.stringify(answers.map(([, r]) => r))).not.toMatch(/A-10|iln_|\d{3}\.\d\d/);
    // Authority first: without credit_note.create, or from another organisation, a duplicated or foreign body
    // gets exactly the refusal a valid body gets, for this invoice and for one never issued.
    const bodies = [
      { reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '600' }, { lineId: t.maintenance.id, amount: '600' }] },
      { reason: REASON_CN, lines: [{ lineId: otherBill.lines[0]!.id, amount: '100' }] },
      { reason: REASON_CN, lines: [{ lineId: t.maintenance.id, amount: '100' }] },
    ];
    for (const persona of [SABA, IMRAN, KAMRAN, 'society_admin', 'cedar_treasurer']) {
      const seen = [];
      for (const body of bodies) {
        seen.push(await refusedUnchanged(t.s, () => t.s.as(persona).post(`/billing/invoices/${t.invoiceId}/credit-notes`, body)));
        seen.push(await refusedUnchanged(t.s, () => t.s.as(persona).post('/billing/invoices/cin_anr_9999/credit-notes', body)));
      }
      expect(seen[0]!.status, persona).toBe(403);
      for (const r of seen) expect(r, persona).toEqual(seen[0]);
    }
    expect(t.s.state().creditNotes).toEqual([]);
  });
});

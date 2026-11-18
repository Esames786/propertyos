import type { ActivityResponse, BillsList, BillView, ExpenseView, PaymentView, RecordRef, RelatedResponse, SavedListResponse, FavouriteItem, RecentItem, Supplier360, SupplierLedgerView, SuppliersList, TasksResponse, UnifiedSearchResponse, WorkQueueResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { ACCOUNTS_TWO, SECOND_ENTITY } from '../multientity.fixture';
import { BOTH_HATS, HEIGHTS_READER, payWorld, refusal, type PayWorld } from './pay-test-kit';

/**
 * Gate E.8 Wave 2 integration (onto the accepted Wave 1 base): the "In progress" count, the four money states
 * kept apart (and the payment drawer's simulation checked against the actual balance), and E.8's records in
 * E.13's registry: unified search, related records, favourites, recent records, tasks and projected activity.
 * Every E.13 answer must follow E.8's own record rule (E.0's canonical entity and cost-centre scope), answer
 * an unknown and a hidden id identically, change at once when access is revoked, keep tenants and legal
 * entities apart, and never carry a bank detail.
 */
const SAMPLE = { name: 'Demo invoice (fictional).pdf', kind: 'invoice', size: 1000, sample: true };
const billBody = (over: Record<string, unknown> = {}) => ({
  legalEntityId: 'le_larkspur',
  supplierId: 'sup_lsp_ravi',
  kind: 'standard',
  supplierInvoiceNo: `W2-${Math.random().toString(36).slice(2, 8)}`,
  invoiceDate: '2026-10-20',
  dueDate: '2026-11-19',
  lines: [{ description: 'Cement for Tower B stairs', category: 'materials', costCentreId: 'cc_heights', amount: '150000' }],
  evidence: SAMPLE,
  ...over,
});

async function approvedBill(w: PayWorld, over: Record<string, unknown> = {}) {
  const b = await w.as('lsp_accounts').post<BillView>('/supplier-bills', billBody(over));
  await w.post(`/supplier-bills/${b.id}/submit`);
  return w.as('lsp_finance_controller').post<BillView>(`/supplier-bills/${b.id}/approve`);
}

const BANK_TERMS = ['3307', '8812', '5146', '0420', '7890', 'Demo Bank', '••••', 'iban', 'IBAN', 'last4', 'maskedNumber'];
const noBank = (value: unknown) => {
  const text = JSON.stringify(value);
  for (const term of BANK_TERMS) expect(text.includes(term), term).toBe(false);
};

describe('"In progress" (was "Open bills"): drafts and bills awaiting approval only', () => {
  it('the supplier count, the list filter and its count agree, and an approved bill leaves them', async () => {
    const w = payWorld();
    w.as('lsp_accounts');
    const ravi = async () => (await w.get<SuppliersList>('/suppliers')).items.find((s) => s.id === 'sup_lsp_ravi')!;
    const before = await ravi();
    expect(before).not.toHaveProperty('openBills');
    const list = await w.get<BillsList>('/supplier-bills', { supplier: 'sup_lsp_ravi', state: 'in_progress' });
    expect(list.items.map((b) => b.state).every((s) => s === 'draft' || s === 'submitted')).toBe(true);
    expect(list.items).toHaveLength(before.inProgressBills);
    expect(list.counts.in_progress).toBe(list.counts.draft + list.counts.submitted);
    expect(before.awaitingApproval).toBe(list.counts.submitted);
    // Approving one: it is owed now, no longer "in progress".
    await w.as('lsp_finance_controller').post('/supplier-bills/sbl_lsp_0001/approve');
    const after = await w.as('lsp_accounts').get<SuppliersList>('/suppliers').then((r) => r.items.find((s) => s.id === 'sup_lsp_ravi')!);
    expect(after.inProgressBills).toBe(before.inProgressBills - 1);
    expect(after.awaitingApproval).toBe(before.awaitingApproval - 1);
    expect(after.approvedObligation).toEqual({ amount: '1240000.00', currency: 'PKR' });
    const s360 = await w.get<Supplier360>('/suppliers/sup_lsp_ravi');
    expect(s360.supplier.inProgressBills).toBe(after.inProgressBills);
  });
});

describe('approved, posted, instructed and settled stay apart; the drawer’s simulation is checked against the actual balance', () => {
  it('a bill shows its four money states; nothing is approved before approval', async () => {
    const w = payWorld();
    const draft = await w.as('lsp_accounts').post<BillView>('/supplier-bills', billBody());
    expect(draft.money).toEqual({ approved: { amount: '0.00', currency: 'PKR' }, posted: { amount: '0.00', currency: 'PKR' }, instructed: { amount: '0.00', currency: 'PKR' }, settled: { amount: '0.00', currency: 'PKR' } });
    const b = await approvedBill(w);
    expect(b.money).toMatchObject({ approved: { amount: '150000.00' }, posted: { amount: '0.00' }, instructed: { amount: '0.00' }, settled: { amount: '0.00' } });
  });

  it('the actual balance never moves for an instruction; the simulation is apart, and agrees with the supplier ledger', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '100000' });
    expect(pay.balance).toEqual({
      actualOwed: { amount: '150000.00', currency: 'PKR' },
      states: { approved: { amount: '150000.00', currency: 'PKR' }, posted: { amount: '0.00', currency: 'PKR' }, instructed: { amount: '100000.00', currency: 'PKR' }, settled: { amount: '0.00', currency: 'PKR' } },
      simulatedAfterThis: { amount: '50000.00', currency: 'PKR' },
      ledgerCheck: 'matches',
    });
    await w.as('lsp_finance_controller').post(`/supplier-payments/${pay.id}/approve`);
    const sent = await w.as('lsp_accounts').post<PaymentView>(`/supplier-payments/${pay.id}/send`);
    // "Sent (simulated)" is not settled: the actual balance and the settled amount are unchanged.
    expect(sent).toMatchObject({ state: 'sent_simulated', settlement: 'not_settled', balance: { actualOwed: { amount: '150000.00' }, states: { settled: { amount: '0.00' }, posted: { amount: '0.00' } }, ledgerCheck: 'matches' } });
    const ledger = await w.get<SupplierLedgerView>('/suppliers/sup_lsp_ravi/ledger');
    expect(ledger.rows.find((r) => r.billId === b.id)?.obligation).toEqual(sent.balance.actualOwed);
    // A cancelled instruction has no simulation at all.
    const other = await w.post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    const cancelled = await w.post<PaymentView>(`/supplier-payments/${other.id}/cancel`, { reason: 'Prepared twice by mistake' });
    expect(cancelled.balance.simulatedAfterThis).toBeUndefined();
    expect(cancelled.balance.actualOwed).toEqual({ amount: '150000.00', currency: 'PKR' });
  });

  it('Supplier 360 keeps the four apart for a whole-entity reader (posted and settled 0.00) and withholds them from a partial one', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    await w.as('lsp_accounts').post(`/supplier-bills/${b.id}/payments`, { amount: '25000' });
    const s = await w.get<Supplier360>('/suppliers/sup_lsp_ravi');
    expect(s.totals).toMatchObject({ approvedObligation: { amount: '150000.00' }, posted: { amount: '0.00' }, instructed: { amount: '25000.00' }, settled: { amount: '0.00' } });
    expect((await w.as(HEIGHTS_READER.id).get<Supplier360>('/suppliers/sup_lsp_ravi')).totals).toBeUndefined();
  });
});

describe('context: an expense names the budget it counts against (its cost centre, its fiscal year)', () => {
  it('for every reader who may open the expense, and none for a year without a budget', async () => {
    const w = payWorld();
    expect(await w.as('lsp_budget_holder').get<ExpenseView>('/expenses/exp_lsp_0001')).toMatchObject({ fiscalYear: 'FY2026-27', budget: { id: 'bud_lsp_heights_fy27' } });
    expect(await w.as('lsp_accounts').get<ExpenseView>('/expenses/exp_lsp_0002')).toMatchObject({ fiscalYear: 'FY2026-27', budget: { id: 'bud_lsp_hq_fy27' } });
    const old = await w.post<ExpenseView>('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_heights', category: 'office', description: 'Stationery last June', amount: '500', incurredOn: '2026-06-20', payee: 'Mall Road Stationers (Demo)', paidVia: 'payable' });
    expect(old.fiscalYear).toBe('FY2025-26');
    expect(old.budget).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------
// E.13 connections
// ---------------------------------------------------------------------------------------------------

const resolve = (w: PayWorld, id: string) => w.get<RecordRef>('/workspace/resolve', { id });
const related = (w: PayWorld, record: string) => w.get<RelatedResponse>('/workspace/related', { record });
const search = (w: PayWorld, q: string, type = 'all') => w.get<UnifiedSearchResponse>('/workspace/search', { q, type });
const ids = (r: UnifiedSearchResponse) => r.groups.flatMap((g) => g.items.map((i) => i.id));
const relatedIds = (r: RelatedResponse) => Object.fromEntries(r.groups.map((g) => [g.relationKey.split('.').pop(), g.items.map((i) => i.id)]));

describe('E.13: every eligible payables record is in the record registry', () => {
  it('supplier, bill, payment instruction, expense and budget resolve to their own screens, with no bank detail and no amount', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '100000' });
    const refs = {
      supplier: await resolve(w, 'sup_lsp_ravi'),
      bill: await resolve(w, b.id),
      payment: await resolve(w, pay.id),
      expense: await resolve(w, 'exp_lsp_0003'),
      budget: await resolve(w, 'bud_lsp_heights_fy27'),
    };
    expect(refs.supplier).toMatchObject({ type: 'supplier', title: 'Ravi Cement Traders (Demo)', href: '/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi', module: 'payables', favouritable: true });
    expect(refs.bill).toMatchObject({ type: 'supplier_bill', ref: b.ref, href: `/backoffice/sup/supplier-bill-workspace?record=${b.id}`, subtitleKey: 'payables:billState.approved' });
    expect(refs.payment).toMatchObject({ type: 'supplier_payment', ref: pay.ref, href: `/backoffice/sup/supplier-payment-drawer?record=${pay.id}`, subtitleKey: 'payables:paymentState.prepared' });
    expect(refs.expense).toMatchObject({ type: 'expense', href: '/backoffice/exp/expense-workspace?record=exp_lsp_0003' });
    expect(refs.budget).toMatchObject({ type: 'budget', href: '/backoffice/exp/budget-workspace?record=bud_lsp_heights_fy27' });
    noBank(refs);
    expect(JSON.stringify(refs)).not.toMatch(/150000|100000|1240000/);
  });

  it('unknown and out-of-scope ids answer identically in resolve, related records, favourites and recent records (nothing stored)', async () => {
    const w = payWorld();
    // Make a Gardens bill with an instruction, so a hidden instruction exists too.
    const gardens = await approvedBill(w, { supplierId: 'sup_lsp_indus', lines: [{ description: 'Cabling', category: 'contractors', costCentreId: 'cc_gardens', amount: '5000' }] });
    const hiddenPay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${gardens.id}/payments`, { amount: '1000' });
    w.as(HEIGHTS_READER.id);
    const pairs: Array<[string, string]> = [
      ['sbl_lsp_0004', 'sbl_never_issued_w2'], // Heights + Gardens: never part of a bill
      ['sbl_lsp_0003', 'sbl_never_issued_w2'],
      [hiddenPay.id, 'spi_never_issued_w2'],
      ['exp_lsp_0002', 'exp_never_issued_w2'],
      ['bud_lsp_hq_fy27', 'bud_never_issued_w2'],
      ['sup_lsp_saffron', 'sup_never_issued_w2'], // a supplier of the entity: visible to an entity reader
    ];
    // A Heights-only reader does see the entity's suppliers (legal-entity records), so the last pair is a control.
    expect((await resolve(w, 'sup_lsp_saffron')).id).toBe('sup_lsp_saffron');
    for (const [hidden, never] of pairs.slice(0, -1)) {
      const before = w.snapshot();
      for (const call of [(id: string) => resolve(w, id), (id: string) => related(w, id), (id: string) => w.post('/workspace/favourites', { recordId: id }), (id: string) => w.post('/workspace/recents', { recordId: id })]) {
        const a = await refusal(call(hidden));
        const b = await refusal(call(never));
        expect(a.text, hidden).toBe(b.text);
        expect(a.status, hidden).toBe(404);
      }
      expect(w.snapshot(), hidden).toBe(before);
    }
  });

  it('search finds only what the reader may open, by the record’s own words, never by a bank detail', async () => {
    const w = payWorld();
    w.as('lsp_accounts');
    expect(ids(await search(w, 'Ravi Cement'))).toEqual(expect.arrayContaining(['sup_lsp_ravi', 'sbl_lsp_0001', 'sbl_lsp_0004']));
    expect(ids(await search(w, 'RCT-INV-4502'))).toEqual(['sbl_lsp_0004']);
    expect(ids(await search(w, 'Printer toner'))).toEqual(['exp_lsp_0002']);
    for (const q of ['3307', '8812', 'Demo Bank', '7890']) expect((await search(w, q)).groups, q).toEqual([]);
    const types = (await search(w, 'ab')).types;
    expect(types).toEqual(expect.arrayContaining(['supplier', 'supplier_bill', 'supplier_payment', 'expense', 'budget']));
    // The Heights reader: the mixed bill and the head-office expense are not found, nor counted.
    w.as(HEIGHTS_READER.id);
    expect(ids(await search(w, 'RCT-INV-4502'))).toEqual([]);
    expect(ids(await search(w, 'Printer toner'))).toEqual([]);
    expect(ids(await search(w, 'Ravi Cement'))).toEqual(expect.arrayContaining(['sup_lsp_ravi', 'sbl_lsp_0001']));
    expect(ids(await search(w, 'Ravi Cement'))).not.toContain('sbl_lsp_0004');
    // Rehan (expenses and budgets of Heights; no supplier permission) is never offered a supplier kind.
    w.as('lsp_budget_holder');
    const rehan = await search(w, 'Heights');
    expect(rehan.types).not.toContain('supplier');
    expect(rehan.types).not.toContain('supplier_bill');
    expect(ids(rehan)).toContain('bud_lsp_heights_fy27');
    expect(ids(rehan)).not.toContain('bud_lsp_hq_fy27');
    // Saad (ledger clerk, no payables permission) gets no payables kind at all.
    expect((await w.as('lsp_ledger_clerk').get<UnifiedSearchResponse>('/workspace/search', { q: 'Ravi' })).types.filter((t) => ['supplier', 'supplier_bill', 'supplier_payment', 'expense', 'budget'].includes(t))).toEqual([]);
  });

  it('related records connect a supplier, its bills, their instructions and budgets, and expenses and budgets, both ways', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '100000' });
    w.as('lsp_finance_controller');
    const supplier = relatedIds(await related(w, 'sup_lsp_ravi'));
    expect(supplier.bills).toEqual(expect.arrayContaining([b.id, 'sbl_lsp_0001', 'sbl_lsp_0004']));
    expect(supplier.paymentInstructions).toEqual([pay.id]);
    const bill = relatedIds(await related(w, b.id));
    expect(bill).toMatchObject({ supplier: ['sup_lsp_ravi'], paymentInstructions: [pay.id], budgets: ['bud_lsp_heights_fy27'] });
    expect(relatedIds(await related(w, pay.id))).toEqual({ bill: [b.id], supplier: ['sup_lsp_ravi'] });
    expect(relatedIds(await related(w, 'exp_lsp_0001'))).toEqual({ budget: ['bud_lsp_heights_fy27'] });
    const budget = relatedIds(await related(w, 'bud_lsp_heights_fy27'));
    expect(budget.expenses).toContain('exp_lsp_0001');
    expect(budget.bills).toEqual(expect.arrayContaining([b.id, 'sbl_lsp_0001']));
    noBank(await related(w, 'sup_lsp_ravi'));
    // A reader sees only the related records they may open themselves.
    w.as(HEIGHTS_READER.id);
    expect(relatedIds(await related(w, 'sup_lsp_ravi')).bills).not.toContain('sbl_lsp_0004');
    w.as('lsp_budget_holder');
    expect(relatedIds(await related(w, 'bud_lsp_heights_fy27')).bills).toBeUndefined();
  });

  it('favourites and recent records follow access: a revoked permission hides them at once, restoring it brings them back', async () => {
    const w = payWorld();
    w.as('lsp_accounts');
    await w.post('/workspace/favourites', { recordId: 'sup_lsp_ravi' });
    await w.post('/workspace/favourites', { recordId: 'exp_lsp_0003' });
    await w.post('/workspace/recents', { recordId: 'sbl_lsp_0001' });
    const favs = async () => (await w.get<SavedListResponse<FavouriteItem>>('/workspace/favourites')).items.map((i) => i.id);
    const recents = async () => (await w.get<SavedListResponse<RecentItem>>('/workspace/recents')).items.map((i) => i.id);
    expect(await favs()).toEqual(expect.arrayContaining(['sup_lsp_ravi', 'exp_lsp_0003']));
    expect(await recents()).toContain('sbl_lsp_0001');
    w.access((p, a) => (p.id === 'lsp_accounts' ? { ...a, permissions: a.permissions.filter((x) => x !== 'supplier.view') } : a));
    expect(await favs()).toEqual(['exp_lsp_0003']);
    expect(await recents()).not.toContain('sbl_lsp_0001');
    expect((await refusal(resolve(w, 'sup_lsp_ravi'))).status).toBe(404);
    expect((await search(w, 'Ravi Cement')).groups).toEqual([]);
    w.access(null);
    expect(await favs()).toEqual(expect.arrayContaining(['sup_lsp_ravi', 'exp_lsp_0003']));
  });

  it('tenants and legal entities stay apart', async () => {
    const w = payWorld();
    // The second entity's officer: Larkspur's records answer like ids never issued; his own resolve.
    w.as(ACCOUNTS_TWO.id);
    const s = await w.post<Supplier360>('/suppliers', { legalEntityId: SECOND_ENTITY, name: 'Riverside Aggregates (Demo)', category: 'materials', contactName: 'Desk', phone: '+92 300 7654321', projectIds: [] });
    expect((await resolve(w, s.supplier.id)).type).toBe('supplier');
    const other = await refusal(resolve(w, 'sup_lsp_ravi'));
    expect(other.status).toBe(404);
    expect(other.text).toBe((await refusal(resolve(w, 'sup_never_issued_w2'))).text);
    expect(ids(await search(w, 'Ravi Cement'))).toEqual([]);
    // Larkspur's officer sees both entities' suppliers she may open (both are in her scope).
    expect((await w.as('lsp_accounts').get<RecordRef>('/workspace/resolve', { id: s.supplier.id })).title).toBe('Riverside Aggregates (Demo)');
    // Another organisation (Crescent Bay's manager): no Larkspur record exists for him.
    w.as('cb_manager');
    expect((await search(w, 'ab')).tooShort).toBe(false); // he is signed in and may search
    expect((await refusal(resolve(w, 'sup_lsp_ravi'))).status).toBe(404);
    for (const id of ['sup_lsp_ravi', 'sbl_lsp_0001', 'exp_lsp_0001', 'bud_lsp_heights_fy27']) expect((await refusal(resolve(w, id))).text, id).toBe((await refusal(resolve(w, `${id.slice(0, 4)}never_issued_w2`))).text);
  });
});

describe('E.13 tasks: approvals for someone other than their maker', () => {
  const kindsOf = (r: TasksResponse) => r.items.map((i) => i.id);

  it('the checker gets bills, instructions, expenses and budget versions waiting for him; never his own claim', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    const mine = kindsOf(await w.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks'));
    expect(mine).toEqual(expect.arrayContaining(['bill_approval:sbl_lsp_0001', 'bill_approval:sbl_lsp_0004', `payment_approval:${pay.id}`, 'expense_approval:exp_lsp_0003', 'expense_approval:exp_lsp_0004', 'budget_approval:bud_lsp_heights_fy27:v1']));
    // Zubair's own claim is not his to decide (E.8's own_claim rule).
    expect(mine).not.toContain('expense_approval:exp_lsp_0006');
    const task = (await w.get<TasksResponse>('/workspace/tasks')).items.find((i) => i.id === `payment_approval:${pay.id}`)!;
    expect(task).toMatchObject({ kind: 'payment_approval', module: 'payables', record: { type: 'supplier_payment', id: pay.id }, actionHref: `/backoffice/sup/supplier-payment-drawer?record=${pay.id}`, owner: { name: 'Faiza Noor', mine: true } });
    noBank(await w.get<TasksResponse>('/workspace/tasks'));
    // The maker holds no approval permission: no approval kind is hers.
    const faiza = await w.as('lsp_accounts').get<TasksResponse>('/workspace/tasks');
    expect(faiza.kinds.filter((k) => k.endsWith('_approval') && ['bill_approval', 'payment_approval', 'expense_approval', 'budget_approval'].includes(k))).toEqual([]);
  });

  it('a person holding both sides never gets their own bill as a task; the team queue shows it as not theirs', async () => {
    const w = payWorld();
    const b = await w.as(BOTH_HATS.id).post<BillView>('/supplier-bills', billBody());
    await w.post(`/supplier-bills/${b.id}/submit`);
    expect(kindsOf(await w.get<TasksResponse>('/workspace/tasks'))).not.toContain(`bill_approval:${b.id}`);
    const queued = (await w.get<WorkQueueResponse>('/workspace/queue')).items.find((i) => i.id === `bill_approval:${b.id}`);
    expect(queued?.owner).toEqual({ name: BOTH_HATS.displayName, mine: false });
    // Zubair may decide it.
    expect(kindsOf(await w.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks'))).toContain(`bill_approval:${b.id}`);
  });

  it('a payment-instruction approval needs E.7’s bank boundary over the entity, like the endpoint', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    w.access((p, a) => (p.id === 'lsp_finance_controller' ? { ...a, permissions: a.permissions.filter((x) => x !== 'bank.view') } : a));
    expect(kindsOf(await w.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks'))).not.toContain(`payment_approval:${pay.id}`);
  });

  it('a narrower decider gets only what is wholly in their scope; revoking the checker permission removes the tasks', async () => {
    const w = payWorld();
    // A Heights-only checker (test principal) never sees the mixed Heights + Gardens bill as work.
    w.access((p, a) => (p.id === HEIGHTS_READER.id ? { ...a, permissions: [...a.permissions, 'supplier_bill.approve'] } : a));
    const narrow = kindsOf(await w.as(HEIGHTS_READER.id).get<TasksResponse>('/workspace/tasks'));
    expect(narrow).toContain('bill_approval:sbl_lsp_0001');
    expect(narrow).not.toContain('bill_approval:sbl_lsp_0004');
    expect(narrow).not.toContain('bill_approval:sbl_lsp_0007'); // sales cost centre
    w.access((p, a) => (p.id === 'lsp_finance_controller' ? { ...a, permissions: a.permissions.filter((x) => x !== 'supplier_bill.approve') } : a));
    expect(kindsOf(await w.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks')).filter((i) => i.startsWith('bill_approval:'))).toEqual([]);
  });
});

describe('E.13 activity: each payables record’s own history, projected by the reader’s scope', () => {
  it('lists every event once, on its own record, with that record’s values only; a narrow reader sees nothing of a hidden record', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    await w.as('lsp_finance_controller').post('/supplier-bills/sbl_lsp_0004/approve');
    const full = await w.as('lsp_finance_controller').get<ActivityResponse>('/workspace/activity', { range: '30d', group: 'payables', limit: '400' });
    expect(full.groups).toContain('payables');
    const of = (id: string) => full.items.filter((i) => i.record.id === id).map((i) => i.messageKey);
    expect(of(b.id)).toEqual(expect.arrayContaining(['payables:history.bill_created', 'payables:history.bill_submitted', 'payables:history.bill_approved']));
    // The instruction's events are the instruction's, not repeated on the bill or the supplier.
    expect(of(b.id)).not.toContain('payables:history.payment_prepared');
    expect(of(pay.id)).toEqual(['payables:history.payment_prepared']);
    expect(of('sup_lsp_ravi').every((k) => !k.includes('bill_') && !k.includes('payment_'))).toBe(true);
    expect(full.items.find((i) => i.record.id === pay.id)).toMatchObject({ group: 'payables', actorName: 'Faiza Noor', mine: false, params: { ref: pay.ref, amount: '1000.00' } });
    noBank(full);
    // The Heights reader: nothing about the mixed bill, Gardens or head office.
    const narrow = await w.as(HEIGHTS_READER.id).get<ActivityResponse>('/workspace/activity', { range: '30d', group: 'payables', limit: '400' });
    const text = JSON.stringify(narrow);
    for (const hidden of ['sbl_lsp_0004', 'LSP-SB-2026-00004', 'RCT-INV-4502', '675000.00', 'sbl_lsp_0003', 'exp_lsp_0002', 'Printer toner', 'bud_lsp_hq_fy27']) expect(text.includes(hidden), hidden).toBe(false);
    expect(narrow.items.some((i) => i.record.id === 'sbl_lsp_0001')).toBe(true);
    // "Only me": Faiza's own entries.
    const hers = await w.as('lsp_accounts').get<ActivityResponse>('/workspace/activity', { range: '30d', group: 'payables', who: 'mine', limit: '400' });
    expect(hers.items.length).toBeGreaterThan(0);
    expect(hers.items.every((i) => i.mine && i.actorName === 'Faiza Noor')).toBe(true);
  });
});

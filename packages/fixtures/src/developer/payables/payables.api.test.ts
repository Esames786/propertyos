import { PERMISSION_MODULE, PERMISSIONS, type BillView, type BudgetsList, type BudgetVsActual, type BudgetView, type ExpenseApprovals, type ExpensesList, type ExpenseView, type PaymentView, type PettyCashFloatView, type PettyCashList, type Supplier360, type SupplierLedgerView, type SuppliersList, type BillsList, type Permission } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { ALL_PERSONAS, findPersona } from '../../people';
import { compareProjection } from '../../projection.testkit';
import { LARKSPUR_ERP_ROLES } from '../../role-templates';
import { ACCOUNTS_TWO, SECOND_ENTITY } from '../multientity.fixture';
import { BOTH_HATS, HEIGHTS_BANK_MAKER, HEIGHTS_READER, payWorld, refusal, SECOND_CHECKER, type PayWorld } from './pay-test-kit';
import { seedPayables } from './state';

/**
 * Gate E.8 API tests (plan §4.2–4.8 negatives, the R3 journey up to the payment instruction, and the
 * owner's Wave 2 money rules). Every refusal is checked to leave the whole store byte-identical.
 */
const E8: Permission[] = ['supplier.manage', 'supplier_bill.approve', 'supplier_payment.approve', 'expense.view', 'expense.approve', 'budget.manage', 'budget.approve'];
const E8_HOLDERS = ['lsp_accounts', 'lsp_finance_controller', 'lsp_budget_holder'];
const NEVER = { bill: 'sbl_never_issued_e8', supplier: 'sup_never_issued_e8', expense: 'exp_never_issued_e8', payment: 'spi_never_issued_e8', float: 'pcf_never_issued_e8', budget: 'bud_never_issued_e8' };
const SAMPLE = { name: 'Demo invoice (fictional).pdf', kind: 'invoice', size: 1000, sample: true };

const billBody = (over: Record<string, unknown> = {}) => ({
  legalEntityId: 'le_larkspur',
  supplierId: 'sup_lsp_margalla',
  kind: 'standard',
  supplierInvoiceNo: `T-${Math.random().toString(36).slice(2, 8)}`,
  invoiceDate: '2026-10-20',
  dueDate: '2026-11-19',
  lines: [{ description: 'Steel for Tower A stairs', category: 'materials', costCentreId: 'cc_heights', amount: '150000' }],
  evidence: SAMPLE,
  ...over,
});

/** Expect a refusal and an unchanged store. */
async function refusedUnchanged(w: PayWorld, p: () => Promise<unknown>) {
  const before = w.snapshot();
  const r = await refusal(p());
  expect(w.snapshot()).toBe(before);
  return r;
}

async function approvedBill(w: PayWorld, over: Record<string, unknown> = {}) {
  const b = await w.as('lsp_accounts').post<BillView>('/supplier-bills', billBody(over));
  await w.post(`/supplier-bills/${b.id}/submit`);
  return w.as('lsp_finance_controller').post<BillView>(`/supplier-bills/${b.id}/approve`);
}

describe('permissions and personas (E-06, E-07 conservative defaults)', () => {
  it('every E.8 permission is in the catalogue and maps to payables (none falls back to core)', () => {
    for (const p of E8) {
      expect(PERMISSIONS).toContain(p);
      expect(PERMISSION_MODULE[p], p).toBe('payables');
    }
  });

  it('no original demo person gains an E.8 permission; only Faiza, Zubair and the new budget holder hold them', () => {
    for (const p of ALL_PERSONAS) {
      const held = p.permissions.filter((x) => E8.includes(x));
      if (!E8_HOLDERS.includes(p.id)) expect(held, p.id).toEqual([]);
    }
    expect(findPersona('lsp_accounts')!.permissions).toEqual(expect.arrayContaining(['supplier.view', 'supplier.manage', 'expense.view', 'expense.create', 'budget.manage']));
    expect(findPersona('lsp_finance_controller')!.permissions).toEqual(expect.arrayContaining(['supplier.view', 'supplier_bill.approve', 'supplier_payment.approve', 'expense.view', 'expense.approve', 'budget.approve']));
    // Nadia and Farah keep exactly what they had: supplier.view and expense.create from their starters, no expense.view.
    for (const id of ['manager', 'finance']) expect(findPersona(id)!.permissions.some((x) => x === 'expense.view')).toBe(false);
  });

  it('the budget holder is a new fictional person, Larkspur Heights only, holding his own role and no checker permission', () => {
    const r = findPersona('lsp_budget_holder')!;
    expect(r).toMatchObject({ tenantId: 'tnt_larkspur', displayName: 'Rehan Saleem', principalId: 'usr_lsp_0021', projectScope: ['prj_heights'], roleId: 'budget_holder' });
    expect(r.permissions).toEqual(LARKSPUR_ERP_ROLES.find((x) => x.id === 'budget_holder')!.permissions);
    expect(r.permissions.some((x) => x.endsWith('.approve'))).toBe(false);
    expect(ALL_PERSONAS.filter((p) => p.principalId === r.principalId)).toHaveLength(1);
  });

  it('every payables maker-checker pair is split between two people, and both sides have a Larkspur holder', () => {
    const pairs: Array<[Permission, Permission]> = [['supplier.manage', 'supplier_bill.approve'], ['supplier.manage', 'supplier_payment.approve'], ['expense.create', 'expense.approve'], ['budget.manage', 'budget.approve']];
    for (const [maker, checker] of pairs) {
      for (const p of ALL_PERSONAS) expect(p.permissions.includes(maker) && p.permissions.includes(checker), `${maker}/${checker} ${p.id}`).toBe(false);
      const lsp = ALL_PERSONAS.filter((p) => p.tenantId === 'tnt_larkspur');
      expect(lsp.some((p) => p.permissions.includes(maker))).toBe(true);
      expect(lsp.some((p) => p.permissions.includes(checker))).toBe(true);
    }
  });
});

describe('seed truth (owner money rules)', () => {
  const st = seedPayables('tnt_larkspur', null);
  it('without developer state nothing is seeded', () => expect(st.bills).toEqual([]));

  it('nothing is seeded approved, paid, settled, posted or witnessed; every submitted record carries a labelled demo document', async () => {
    const w = payWorld();
    const bills = await w.as('lsp_accounts').get<BillsList>('/supplier-bills');
    expect(bills.items.length).toBeGreaterThan(0);
    for (const b of bills.items) {
      expect(['draft', 'submitted']).toContain(b.state);
      expect(b).toMatchObject({ posting: 'planned', settlement: 'not_settled', instructed: { amount: '0.00' }, demo: true });
    }
    for (const b of bills.items.filter((x) => x.state === 'submitted')) expect((await w.get<BillView>(`/supplier-bills/${b.id}`)).evidence).toMatchObject({ sample: true });
    expect((await w.get<{ items: unknown[] }>('/supplier-payments')).items).toEqual([]);
    const exp = await w.get<ExpensesList>('/expenses');
    for (const e of exp.items) expect(['draft', 'submitted']).toContain(e.state);
    const pc = await w.get<PettyCashList>('/petty-cash');
    for (const f of pc.floats) {
      expect(f.lastWitnessed).toBeUndefined();
      for (const c of f.counts) expect(c.state).toBe('awaiting_witness');
    }
    const budgets = await w.get<BudgetsList>('/budgets');
    for (const b of budgets.items) expect(b.approved).toBeUndefined();
    expect((await w.get<BudgetVsActual>('/budget-vs-actual')).budgets).toEqual([]);
  });

  it('reads never store anything', async () => {
    const w = payWorld();
    const before = w.snapshot();
    for (const path of ['/suppliers', '/supplier-bills', '/supplier-payments', '/utility-bills', '/expenses', '/expense-approvals', '/petty-cash', '/budgets', '/budget-vs-actual', '/suppliers/sup_lsp_ravi', '/suppliers/sup_lsp_ravi/ledger', '/supplier-bills/sbl_lsp_0001']) await w.as('lsp_accounts').get(path);
    expect(w.snapshot()).toBe(before);
    expect(w.stored()).toBeUndefined();
  });
});

describe('R3: bill → approval by someone else → payment instruction → "Not settled — no evidence"', () => {
  it('runs end to end, and an instruction never reduces what is owed', async () => {
    const w = payWorld();
    const draft = await w.as('lsp_accounts').post<BillView>('/supplier-bills', billBody({ supplierId: 'sup_lsp_ravi', supplierInvoiceNo: 'RCT-INV-9001' }));
    expect(draft).toMatchObject({ state: 'draft', posting: 'planned', settlement: 'not_settled', total: { amount: '150000.00' }, actions: { submit: true, approve: false } });
    expect(draft.ref).toMatch(/^LSP-SB-2026-\d{5}$/);
    const submitted = await w.post<BillView>(`/supplier-bills/${draft.id}/submit`);
    expect(submitted.state).toBe('submitted');
    // The maker holds no approve permission; the checker approves.
    expect((await refusedUnchanged(w, () => w.post(`/supplier-bills/${draft.id}/approve`))).code).toBe('permission_missing');
    const approved = await w.as('lsp_finance_controller').post<BillView>(`/supplier-bills/${draft.id}/approve`);
    expect(approved).toMatchObject({ state: 'approved', decidedByName: 'Zubair Ansari', posting: 'planned', settlement: 'not_settled', instructable: { amount: '150000.00' } });
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${draft.id}/payments`, { amount: '100000' }, 'k-pay-1');
    expect(pay).toMatchObject({ state: 'prepared', settlement: 'not_settled', amount: { amount: '100000.00' }, actions: { approve: false, send: false } });
    expect(pay.ref).toMatch(/^LSP-PV-2026-\d{4}$/);
    expect((await refusedUnchanged(w, () => w.as('lsp_finance_controller').post(`/supplier-payments/${pay.id}/send`))).code).toBe('permission_missing');
    const ok = await w.as('lsp_finance_controller').post<PaymentView>(`/supplier-payments/${pay.id}/approve`);
    expect(ok).toMatchObject({ state: 'approved', approvedByName: 'Zubair Ansari', settlement: 'not_settled' });
    const sent = await w.as('lsp_accounts').post<PaymentView>(`/supplier-payments/${pay.id}/send`);
    expect(sent).toMatchObject({ state: 'sent_simulated', settlement: 'not_settled' });
    // Instructed but owed in full: the ledger balance is the approved bill; nothing is settled or posted.
    const ledger = await w.get<SupplierLedgerView>('/suppliers/sup_lsp_ravi/ledger');
    expect(ledger.balance).toEqual({ amount: '150000.00', currency: 'PKR' });
    expect(ledger.rows.map((r) => r.kind)).toEqual(['bill']);
    expect(ledger.instructions.map((x) => x.state)).toEqual(['sent_simulated']);
    expect(ledger.posting).toBe('planned');
    const s360 = await w.get<Supplier360>('/suppliers/sup_lsp_ravi');
    expect(s360.totals).toMatchObject({ approvedObligation: { amount: '150000.00' }, instructed: { amount: '100000.00' }, settled: { amount: '0.00' } });
    // Posting waits on E.7 (E-17): refused, nothing changes.
    expect(await refusedUnchanged(w, () => w.post(`/supplier-bills/${draft.id}/post`))).toMatchObject({ status: 409, code: 'posting_planned' });
    // No settlement route exists at all (E-18).
    expect((await refusal(w.post(`/supplier-payments/${pay.id}/settle`))).status).toBe(404);
    // Only the rest may still be instructed; more is refused with the amount left, nothing changes.
    const over = await refusedUnchanged(w, () => w.post(`/supplier-bills/${draft.id}/payments`, { amount: '60000' }));
    expect(over.errors.amount?.[0]?.code).toBe('payables:errors.aboveInstructable');
  });

  it('a cancelled instruction frees its amount again; a sent one cannot be cancelled', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    const p1 = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '150000' });
    expect((await refusal(w.post(`/supplier-payments/${p1.id}/cancel`, {}))).errors.reason).toBeDefined();
    await w.post(`/supplier-payments/${p1.id}/cancel`, { reason: 'Wrong amount' });
    const again = await w.post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '150000' });
    await w.as('lsp_finance_controller').post(`/supplier-payments/${again.id}/approve`);
    await w.as('lsp_accounts').post(`/supplier-payments/${again.id}/send`);
    expect((await refusedUnchanged(w, () => w.post(`/supplier-payments/${again.id}/cancel`, { reason: 'too late' }))).code).toBe('state_conflict');
  });

  it('a supplier without a payee account on file cannot be instructed; drafts and submitted bills cannot be either', async () => {
    const w = payWorld();
    const b = await approvedBill(w, { supplierId: 'sup_lsp_saffron', lines: [{ description: 'Print run', category: 'marketing', costCentreId: 'cc_lsp_sales', amount: '5000' }] });
    expect(await refusedUnchanged(w, () => w.as('lsp_accounts').post(`/supplier-bills/${b.id}/payments`, { amount: '5000' }))).toMatchObject({ status: 409, code: 'payee_account_missing' });
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills/sbl_lsp_0001/payments', { amount: '1000' }))).code).toBe('state_conflict');
  });
});

describe('maker ≠ checker (by principal)', () => {
  it('a person holding both sides still cannot approve their own bill, instruction, expense, budget version or count', async () => {
    const w = payWorld();
    const b = await w.as(BOTH_HATS.id).post<BillView>('/supplier-bills', billBody());
    await w.post(`/supplier-bills/${b.id}/submit`);
    expect((await w.get<BillView>(`/supplier-bills/${b.id}`)).blocked).toBe('own_bill');
    expect(await refusedUnchanged(w, () => w.post(`/supplier-bills/${b.id}/approve`))).toMatchObject({ status: 403, code: 'separation_of_duties' });
    expect((await refusedUnchanged(w, () => w.post(`/supplier-bills/${b.id}/reject`, { reason: 'no' }))).code).toBe('separation_of_duties');
    await w.as('lsp_finance_controller').post(`/supplier-bills/${b.id}/approve`);
    const pay = await w.as(BOTH_HATS.id).post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    expect((await refusedUnchanged(w, () => w.post(`/supplier-payments/${pay.id}/approve`))).code).toBe('separation_of_duties');
    const e = await w.post<ExpenseView>('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_hq', category: 'office', description: 'Paper', amount: '500', incurredOn: '2026-10-25', payee: 'Shop (Demo)', paidVia: 'payable', evidence: SAMPLE });
    await w.post(`/expenses/${e.id}/submit`);
    expect((await refusedUnchanged(w, () => w.post(`/expenses/${e.id}/approve`))).code).toBe('separation_of_duties');
    const bud = await w.post<BudgetView>('/budgets', { legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_sales', year: 'FY2026-27', reason: 'Sales budget', lines: [{ category: 'marketing', amount: '100000' }] });
    await w.post(`/budgets/${bud.id}/versions/1/submit`);
    expect((await refusedUnchanged(w, () => w.post(`/budgets/${bud.id}/versions/1/approve`))).code).toBe('separation_of_duties');
  });

  it('a claimant never approves their own claim, even entered by someone else; another checker may', async () => {
    const w = payWorld();
    const mine = await w.as('lsp_finance_controller').get<ExpenseView>('/expenses/exp_lsp_0006');
    expect(mine).toMatchObject({ claimant: { name: 'Zubair Ansari' }, blocked: 'own_claim', actions: { approve: false } });
    expect(await refusedUnchanged(w, () => w.post('/expenses/exp_lsp_0006/approve'))).toMatchObject({ status: 403, code: 'separation_of_duties', messageKey: 'payables:problems.ownClaim' });
    const inbox = await w.get<ExpenseApprovals>('/expense-approvals');
    expect(inbox.waiting.find((x) => x.id === 'exp_lsp_0006')?.blocked).toBe('own_claim');
    expect(inbox.toDecide.some((x) => x.id === 'exp_lsp_0006')).toBe(false);
    expect((await w.as(SECOND_CHECKER.id).post<ExpenseView>('/expenses/exp_lsp_0006/approve')).state).toBe('approved');
  });

  it('the petty-cash counter is never the witness; the requester never approves a top-up', async () => {
    const w = payWorld();
    const counted = await w.as(BOTH_HATS.id).post<PettyCashFloatView>('/petty-cash/pcf_lsp_hq/counts', { notes: { '1000': 5 }, evidence: { ...SAMPLE, kind: 'count_sheet' } });
    expect(counted.counts[0]).toMatchObject({ amount: { amount: '5000.00' }, state: 'awaiting_witness', blocked: 'own_count', canWitness: false });
    expect((await refusedUnchanged(w, () => w.post(`/petty-cash/pcf_lsp_hq/counts/${counted.counts[0]!.id}/witness`, { decision: 'confirm' }))).code).toBe('separation_of_duties');
    const f = await w.as(BOTH_HATS.id).post<PettyCashFloatView>('/petty-cash/pcf_lsp_hq/top-ups', { amount: '5000', reason: 'Monthly top-up' });
    expect((await refusedUnchanged(w, () => w.post(`/petty-cash/pcf_lsp_hq/top-ups/${f.topUps[0]!.id}/approve`))).code).toBe('separation_of_duties');
  });
});

describe('no id oracle: out of scope answers exactly like never issued', () => {
  it('a Heights-only reader gets the same 404 for a Gardens or head-office record as for an invented id, on every route', async () => {
    const w = payWorld();
    w.as(HEIGHTS_READER.id);
    const pairs: Array<[string, string]> = [
      ['/supplier-bills/sbl_lsp_0003', `/supplier-bills/${NEVER.bill}`],
      ['/supplier-bills/sbl_lsp_0004', `/supplier-bills/${NEVER.bill}`], // touches Heights and Gardens: never half a bill
      ['/supplier-bills/sbl_lsp_0007', `/supplier-bills/${NEVER.bill}`],
      ['/expenses/exp_lsp_0002', `/expenses/${NEVER.expense}`],
      ['/expenses/exp_lsp_0004', `/expenses/${NEVER.expense}`],
      ['/budgets/bud_lsp_gardens_fy27', `/budgets/${NEVER.budget}`],
    ];
    for (const [hidden, invented] of pairs) {
      const a = await refusal(w.get(hidden));
      expect(a.status, hidden).toBe(404);
      expect(a.text, hidden).toBe((await refusal(w.get(invented))).text);
    }
    // And the Heights records are readable.
    expect((await w.get<BillView>('/supplier-bills/sbl_lsp_0001')).ref).toBeTruthy();
    expect((await w.get<ExpenseView>('/expenses/exp_lsp_0001')).ref).toBeTruthy();
  });

  it('writes on hidden and invented ids refuse alike (404) and change nothing', async () => {
    const w = payWorld();
    const writes = (bill: string, exp: string, budget: string, float: string) => [
      () => w.as('lsp_budget_holder').post(`/expenses/${exp}/submit`),
      () => w.as('lsp_budget_holder').post(`/budgets/${budget}/versions`, { reason: 'x', lines: [{ category: 'other', amount: '1' }] }),
      () => w.as('lsp_budget_holder').post(`/petty-cash/${float}/counts`, { notes: { '100': 1 }, evidence: SAMPLE }),
      () => w.as(ACCOUNTS_TWO.id).post(`/supplier-bills/${bill}/submit`),
      () => w.as(ACCOUNTS_TWO.id).post(`/supplier-bills/${bill}/payments`, { amount: '1' }),
    ];
    const hidden = writes('sbl_lsp_0003', 'exp_lsp_0002', 'bud_lsp_hq_fy27', 'pcf_lsp_hq');
    const invented = writes(NEVER.bill, NEVER.expense, NEVER.budget, NEVER.float);
    for (let i = 0; i < hidden.length; i++) {
      const a = await refusedUnchanged(w, hidden[i]!);
      expect(a.status, String(i)).toBe(404);
      expect(a.text, String(i)).toBe((await refusedUnchanged(w, invented[i]!)).text);
    }
  });

  it('a hidden cost centre, supplier or float named in a body is the same field problem as an invented one', async () => {
    const w = payWorld();
    const hidden = await refusedUnchanged(w, () => w.as('lsp_budget_holder').post('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_hq', category: 'office', description: 'Pens', amount: '100', incurredOn: '2026-10-25', payee: 'Shop', paidVia: 'petty_cash', floatId: 'pcf_lsp_hq' }));
    const invented = await refusedUnchanged(w, () => w.as('lsp_budget_holder').post('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_never', category: 'office', description: 'Pens', amount: '100', incurredOn: '2026-10-25', payee: 'Shop', paidVia: 'petty_cash', floatId: NEVER.float }));
    expect(hidden.text).toBe(invented.text);
    expect(hidden.errors).toMatchObject({ costCentreId: [{ code: 'payables:errors.unknownCostCentre' }], floatId: [{ code: 'payables:errors.unknownFloat' }] });
    const s1 = await refusedUnchanged(w, () => w.as(ACCOUNTS_TWO.id).post('/supplier-bills', billBody({ legalEntityId: SECOND_ENTITY, supplierId: 'sup_lsp_ravi', lines: [{ description: 'x', category: 'materials', costCentreId: 'cc_lsp_riverside_demo', amount: '1' }] })));
    const s2 = await refusedUnchanged(w, () => w.as(ACCOUNTS_TWO.id).post('/supplier-bills', billBody({ legalEntityId: SECOND_ENTITY, supplierId: NEVER.supplier, lines: [{ description: 'x', category: 'materials', costCentreId: 'cc_lsp_riverside_demo', amount: '1' }] })));
    expect(s1.text).toBe(s2.text);
  });

  it('a hidden entity in a query or body answers like an invented one', async () => {
    const w = payWorld();
    for (const path of ['/suppliers', '/supplier-bills', '/expenses', '/budgets', '/budget-vs-actual', '/petty-cash']) {
      const a = await refusal(w.as(ACCOUNTS_TWO.id).get(path, { entity: 'le_larkspur' }));
      expect(a.status, path).toBe(404);
      expect(a.text, path).toBe((await refusal(w.get(path, { entity: 'le_never_e8' }))).text);
    }
    const a = await refusedUnchanged(w, () => w.as(ACCOUNTS_TWO.id).post('/suppliers', { legalEntityId: 'le_larkspur', name: 'Probe (Demo)', category: 'materials', contactName: 'Desk', phone: '+92 300 1234567', projectIds: [] }));
    const b = await refusedUnchanged(w, () => w.post('/suppliers', { legalEntityId: 'le_never_e8', name: 'Probe (Demo)', category: 'materials', contactName: 'Desk', phone: '+92 300 1234567', projectIds: [] }));
    expect(a.text).toBe(b.text);
  });
});

describe('legal-entity isolation (A2 §5.1, I-19; E-08 test-only second entity)', () => {
  it('the second entity keeps its own suppliers, bills and expenses; neither side sees the other', async () => {
    const w = payWorld();
    const s = await w.as(ACCOUNTS_TWO.id).post<Supplier360>('/suppliers', { legalEntityId: SECOND_ENTITY, name: 'Riverside Aggregates (Demo)', category: 'materials', contactName: 'Desk', phone: '+92 300 7654321', projectIds: ['prj_lsp_riverside_demo'] });
    expect(s.supplier.ref).toBe('LRD-SUP-0001');
    const b = await w.post<BillView>('/supplier-bills', billBody({ legalEntityId: SECOND_ENTITY, supplierId: s.supplier.id, lines: [{ description: 'Gravel', category: 'materials', costCentreId: 'cc_lsp_riverside_demo', amount: '90000' }] }));
    expect(b.ref).toMatch(/^LRD-SB-2026-0000\d$/);
    const two = await w.get<BillsList>('/supplier-bills');
    expect(two.scope.entities.map((e) => e.id)).toEqual([SECOND_ENTITY]);
    expect(two.items.map((x) => x.id)).toEqual([b.id]);
    expect((await w.get<SuppliersList>('/suppliers')).items.map((x) => x.name)).toEqual(['Riverside Aggregates (Demo)']);
    // Larkspur's reader lists Larkspur only by default; the second entity only when chosen.
    const lsp = await w.as('lsp_accounts').get<BillsList>('/supplier-bills');
    expect(lsp.items.some((x) => x.id === b.id)).toBe(false);
    expect(lsp.scope.entities.map((e) => e.id).sort()).toEqual(['le_larkspur', SECOND_ENTITY].sort());
    expect((await w.get<BillsList>('/supplier-bills', { entity: SECOND_ENTITY })).items.map((x) => x.id)).toEqual([b.id]);
  });

  it('a bill that mixes entities (supplier, cost centre or float of another entity) is refused cross_entity_forbidden and changes nothing', async () => {
    const w = payWorld();
    const s = await w.as(ACCOUNTS_TWO.id).post<Supplier360>('/suppliers', { legalEntityId: SECOND_ENTITY, name: 'Riverside Aggregates (Demo)', category: 'materials', contactName: 'Desk', phone: '+92 300 7654321', projectIds: [] });
    w.as('lsp_accounts');
    expect(await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ supplierId: s.supplier.id })))).toMatchObject({ status: 422, code: 'cross_entity_forbidden' });
    expect(await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ lines: [{ description: 'Mixed', category: 'materials', costCentreId: 'cc_lsp_riverside_demo', amount: '1' }] })))).toMatchObject({ code: 'cross_entity_forbidden' });
    expect(await refusedUnchanged(w, () => w.post('/expenses', { kind: 'business', legalEntityId: SECOND_ENTITY, costCentreId: 'cc_heights', category: 'office', description: 'Mixed', amount: '1', incurredOn: '2026-10-25', payee: 'x', paidVia: 'payable' }))).toMatchObject({ code: 'cross_entity_forbidden' });
    expect(await refusedUnchanged(w, () => w.post('/budgets', { legalEntityId: SECOND_ENTITY, costCentreId: 'cc_heights', year: 'FY2026-27', reason: 'Mixed', lines: [{ category: 'other', amount: '1' }] }))).toMatchObject({ code: 'cross_entity_forbidden' });
  });
});

describe('cost-centre isolation and nested projection (§4.4)', () => {
  it('the Heights budget holder sees Heights only: lists, counts, floats, budgets; no entity totals', async () => {
    const w = payWorld();
    w.as('lsp_budget_holder');
    const exp = await w.get<ExpensesList>('/expenses');
    expect(new Set(exp.items.map((e) => e.costCentre.id))).toEqual(new Set(['cc_heights']));
    expect(exp.counts.all).toBe(exp.items.length);
    expect(exp.costCentres.map((c) => c.id)).toEqual(['cc_heights']);
    expect(exp.scope.scopeLimited).toBe(true);
    expect((await w.get<PettyCashList>('/petty-cash')).floats.map((f) => f.id)).toEqual(['pcf_lsp_heights']);
    expect((await w.get<BudgetsList>('/budgets')).items.map((b) => b.id)).toEqual(['bud_lsp_heights_fy27']);
    expect((await w.get<BudgetVsActual>('/budget-vs-actual')).entityTotals).toBeUndefined();
    expect((await refusal(w.get('/expenses', { costCentre: 'cc_lsp_hq' }))).text).toBe((await refusal(w.get('/expenses', { costCentre: 'cc_never' }))).text);
    // No supplier permission: the supplier routes are refused.
    expect((await refusal(w.get('/suppliers'))).code).toBe('permission_missing');
  });

  it('a narrow reader’s answers name no hidden bill, amount, cost centre or supplier activity; the full reader sees them (projection test kit)', async () => {
    const w = payWorld();
    // Make the Gardens and mixed bills part of Ravi's activity and totals.
    await w.as('lsp_finance_controller').post('/supplier-bills/sbl_lsp_0004/approve');
    const read = async (persona: string) => {
      w.as(persona);
      return {
        s360: await w.get('/suppliers/sup_lsp_ravi'),
        // The narrow reader gets the not-found answer here; the full reader the bill with both lines.
        mixed: await w.get('/supplier-bills/sbl_lsp_0004').catch((e: { problem?: unknown }) => e.problem),
        ledger: await w.get('/suppliers/sup_lsp_ravi/ledger'),
        suppliers: await w.get('/suppliers'),
        bills: await w.get('/supplier-bills'),
        utility: await w.get('/utility-bills'),
        expenses: await w.get('/expenses'),
        approvals: await w.get('/expense-approvals'),
        petty: await w.get('/petty-cash'),
        budgets: await w.get('/budgets'),
        bva: await w.get('/budget-vs-actual'),
      };
    };
    const narrow = await read(HEIGHTS_READER.id);
    const full = await read('lsp_finance_controller');
    const hidden = ['LSP-SB-2026-00004', 'LSP-SB-2026-00003', 'RCT-INV-4502', '675000.00', '295000.00', 'Block C boundary wall', 'cc_gardens', 'cc_lsp_hq', 'Head office float', 'Safety signage', 'Printer toner', 'SMP-1093'];
    const report = compareProjection({ narrow, full, hidden });
    expect(report.leaks).toEqual([]);
    expect(report.unexercised).toEqual([]);
    expect((narrow.s360 as Supplier360).totals).toBeUndefined();
    expect((narrow.ledger as SupplierLedgerView).balance).toBeUndefined();
    expect((narrow.ledger as SupplierLedgerView).rows).toEqual([]);
  });
});

describe('bound idempotency (E.0 helper)', () => {
  it('a duplicate submit of the same create makes one record; the replay answers with it', async () => {
    const w = payWorld();
    const body = billBody({ supplierInvoiceNo: 'DUP-1' });
    const a = await w.as('lsp_accounts').post<BillView>('/supplier-bills', body, 'k-bill-1');
    const b = await w.post<BillView>('/supplier-bills', body, 'k-bill-1');
    expect(b.id).toBe(a.id);
    expect(w.stored()!.bills.filter((x) => x.supplierInvoiceNo === 'DUP-1')).toHaveLength(1);
    // Every create replays alike.
    const e = { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_hq', category: 'office', description: 'Toner', amount: '900', incurredOn: '2026-10-25', payee: 'Shop (Demo)', paidVia: 'payable' };
    expect((await w.post<ExpenseView>('/expenses', e, 'k-exp')).id).toBe((await w.post<ExpenseView>('/expenses', e, 'k-exp')).id);
    const s = { legalEntityId: 'le_larkspur', name: 'Once Only Traders (Demo)', category: 'services', contactName: 'Desk', phone: '+92 300 1112223', projectIds: [] };
    expect((await w.post<Supplier360>('/suppliers', s, 'k-sup')).supplier.id).toBe((await w.post<Supplier360>('/suppliers', s, 'k-sup')).supplier.id);
    expect(w.stored()!.suppliers.filter((x) => x.name === s.name)).toHaveLength(1);
  });

  it('reusing a key for another input, person or operation is 409 idempotency_key_reused and changes nothing', async () => {
    const w = payWorld();
    await w.as('lsp_accounts').post('/supplier-bills', billBody({ supplierInvoiceNo: 'K-1' }), 'k-shared');
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ supplierInvoiceNo: 'K-2' }), 'k-shared'))).code).toBe('idempotency_key_reused');
    expect((await refusedUnchanged(w, () => w.as(BOTH_HATS.id).post('/supplier-bills', billBody({ supplierInvoiceNo: 'K-1' }), 'k-shared'))).code).toBe('idempotency_key_reused');
    expect((await refusedUnchanged(w, () => w.as('lsp_accounts').post('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_hq', category: 'office', description: 'x y z', amount: '1', incurredOn: '2026-10-25', payee: 'xx', paidVia: 'payable' }, 'k-shared'))).code).toBe('idempotency_key_reused');
  });

  it('a replay after the person lost the scope discloses nothing: it is answered exactly like a request never made', async () => {
    const w = payWorld();
    const exp = { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_heights', category: 'site_running', description: 'Water cans', amount: '1200', incurredOn: '2026-10-25', payee: 'Shop (Demo)', paidVia: 'payable' };
    const bill = billBody({ supplierInvoiceNo: 'SCOPE-1' });
    await w.as(BOTH_HATS.id).post('/expenses', exp, 'k-scope-exp');
    await w.post('/supplier-bills', bill, 'k-scope-bill');
    // Moved to the other legal entity: Larkspur's cost centres and entity are now out of scope.
    w.access((p, a) => (p.id === BOTH_HATS.id ? { ...a, scopes: [{ type: 'legal_entity', ids: [SECOND_ENTITY] }] } : a));
    const e1 = await refusedUnchanged(w, () => w.post('/expenses', exp, 'k-scope-exp'));
    expect(e1.text).toBe((await refusedUnchanged(w, () => w.post('/expenses', exp, 'k-never-used-1'))).text);
    expect(e1.status).toBe(404);
    const b1 = await refusedUnchanged(w, () => w.post('/supplier-bills', bill, 'k-scope-bill'));
    expect(b1.status).toBe(404);
    expect(b1.text).toBe((await refusedUnchanged(w, () => w.post('/supplier-bills', bill, 'k-never-used-2'))).text);
  });
});

describe('revocation, licensing, suspension and practice mode', () => {
  it('a revoked permission hides the data at once', async () => {
    const w = payWorld();
    expect((await w.as('lsp_accounts').get<SuppliersList>('/suppliers')).items.length).toBeGreaterThan(0);
    w.access((p, a) => (p.id === 'lsp_accounts' ? { ...a, permissions: a.permissions.filter((x) => x !== 'supplier.view' && x !== 'expense.view') } : a));
    for (const path of ['/suppliers', '/supplier-bills', '/supplier-bills/sbl_lsp_0001', '/expenses', '/budgets']) expect((await refusal(w.get(path))).code, path).toBe('permission_missing');
    // A maker who lost the read permission cannot write either (and nothing changes).
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody()))).code).toBe('permission_missing');
    expect((await refusedUnchanged(w, () => w.post('/expenses', { kind: 'business' }))).code).toBe('permission_missing');
  });

  it('existing holders of expense.create without expense.view (Nadia, Farah) cannot create expenses; Crescent Bay has no payables licence; Bilal has no permission', async () => {
    const w = payWorld();
    for (const id of ['manager', 'finance']) expect((await refusedUnchanged(w, () => w.as(id).post('/expenses', { kind: 'business' }))).code, id).toBe('permission_missing');
    expect((await refusal(w.as('cb_manager').get('/suppliers'))).code).toBe('module_not_licensed');
    expect((await refusal(w.as('sales').get('/suppliers'))).code).toBe('permission_missing');
    // Nadia already held supplier.view (starter set): she reads suppliers, and changes nothing.
    expect((await w.as('manager').get<SuppliersList>('/suppliers')).canCreate).toBe(false);
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody()))).code).toBe('permission_missing');
  });

  it('a suspended organisation reads its history but changes nothing; practice mode changes nothing', async () => {
    const w = payWorld();
    w.access((_p, a) => ({ ...a, tenant: { ...a.tenant, status: 'suspended' } }));
    expect((await w.as('lsp_accounts').get<BillsList>('/supplier-bills')).items.length).toBeGreaterThan(0);
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody()))).code).toBe('tenant_suspended');
    w.access(null).practice(true);
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody()))).code).toBe('training_not_supported');
    expect((await refusedUnchanged(w, () => w.as('lsp_finance_controller').post('/supplier-bills/sbl_lsp_0001/approve'))).code).toBe('training_not_supported');
  });
});

describe('the bank boundary', () => {
  it('a supplier reader without bank.view gets no account, bank name or last digits anywhere', async () => {
    const w = payWorld();
    const b = await approvedBill(w, { supplierId: 'sup_lsp_ravi' });
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    expect(pay.payee).toMatchObject({ last4: '3307' });
    // Wave 1 base: Larkspur's registered collection account ends 7890 (E.0 and E.7 agree).
    expect(pay.payFrom?.maskedNumber).toBe('•••• 7890');
    w.as('lsp_project_manager');
    const answers = { s360: await w.get<Supplier360>('/suppliers/sup_lsp_ravi'), bill: await w.get(`/supplier-bills/${b.id}`), pay: await w.get<PaymentView>(`/supplier-payments/${pay.id}`), list: await w.get('/supplier-payments'), suppliers: await w.get('/suppliers'), ledger: await w.get('/suppliers/sup_lsp_ravi/ledger') };
    expect(answers.s360).toMatchObject({ bankHidden: true, bankOnFile: null });
    expect(answers.s360.bank).toBeUndefined();
    expect(answers.pay).toMatchObject({ bankHidden: true });
    const text = JSON.stringify(answers);
    for (const term of ['3307', '7890', 'Demo Bank', '••••', 'iban', 'IBAN']) expect(text.includes(term), term).toBe(false);
    // Searching by a bank detail finds nothing (no oracle through search either).
    expect((await w.get<SuppliersList>('/suppliers', { q: '3307' })).items).toEqual([]);
  });

  it('preparing or approving a payment instruction also needs bank.view', async () => {
    const w = payWorld();
    const b = await approvedBill(w);
    w.access((p, a) => (p.id === 'lsp_accounts' || p.id === 'lsp_finance_controller' ? { ...a, permissions: a.permissions.filter((x) => x !== 'bank.view') } : a));
    expect((await refusedUnchanged(w, () => w.as('lsp_accounts').post(`/supplier-bills/${b.id}/payments`, { amount: '1' }))).code).toBe('permission_missing');
  });

  // Wave 2 integration: E.7's canonical boundary (ledger/scope.ts seesBank) is per WHOLE legal entity.
  it('bank.view over part of the entity is not enough: no bank detail, and no payment instruction (E.7 seesBank)', async () => {
    const w = payWorld();
    const b = await approvedBill(w, { supplierId: 'sup_lsp_ravi' });
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    w.as(HEIGHTS_BANK_MAKER.id);
    // The Heights bill and its instruction are his to read (every line is Heights) ...
    const answers = { s360: await w.get<Supplier360>('/suppliers/sup_lsp_ravi'), pay: await w.get<PaymentView>(`/supplier-payments/${pay.id}`) };
    expect(answers.pay).toMatchObject({ id: pay.id, bankHidden: true });
    expect(answers.s360).toMatchObject({ bankHidden: true, bankOnFile: null });
    // ... but no account, bank name or last digits, exactly as E.7 decides for him.
    const text = JSON.stringify(answers);
    for (const term of ['3307', '7890', 'Demo Bank', '••••']) expect(text.includes(term), term).toBe(false);
    const r = await refusedUnchanged(w, () => w.post(`/supplier-bills/${b.id}/payments`, { amount: '1' }));
    expect(r).toMatchObject({ status: 404, code: 'out_of_scope' });
    expect(await refusedUnchanged(w, () => w.post(`/supplier-payments/${pay.id}/cancel`, { reason: 'Probe only' }))).toMatchObject({ status: 404, code: 'out_of_scope' });
  });

  it('revoking bank.view hides the payee and paying account at once', async () => {
    const w = payWorld();
    const b = await approvedBill(w, { supplierId: 'sup_lsp_ravi' });
    const pay = await w.as('lsp_accounts').post<PaymentView>(`/supplier-bills/${b.id}/payments`, { amount: '1000' });
    expect(pay).toMatchObject({ bankHidden: false, payee: { last4: '3307' } });
    w.access((p, a) => (p.id === 'lsp_accounts' ? { ...a, permissions: a.permissions.filter((x) => x !== 'bank.view') } : a));
    const now = await w.get<PaymentView>(`/supplier-payments/${pay.id}`);
    expect(now).toMatchObject({ bankHidden: true });
    expect(now.payee).toBeUndefined();
    expect(now.payFrom).toBeUndefined();
  });
});

describe('validation (every problem at its field, nothing stored)', () => {
  it('a bill reports each missing or wrong field at once', async () => {
    const w = payWorld();
    const r = await refusedUnchanged(w, () => w.as('lsp_accounts').post('/supplier-bills', { legalEntityId: 'le_larkspur', supplierId: '', kind: 'standard', supplierInvoiceNo: '', invoiceDate: '2027-01-01', dueDate: '2026-01-01', lines: [{ description: 'x', category: 'gold', costCentreId: '', amount: '-5' }] }));
    expect(r.code).toBe('validation_failed');
    expect(Object.keys(r.errors).sort()).toEqual(['invoiceDate', 'lines.0.amount', 'lines.0.category', 'lines.0.costCentreId', 'lines.0.description', 'supplierId', 'supplierInvoiceNo'].sort());
    expect(r.errors.invoiceDate?.[0]?.code).toBe('payables:errors.futureDate');
    const due = await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ invoiceDate: '2026-10-20', dueDate: '2026-10-01' })));
    expect(due.errors.dueDate?.[0]?.code).toBe('payables:errors.dueBeforeInvoice');
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ lines: [] })))).errors.lines?.[0]?.code).toBe('payables:errors.noLines');
  });

  it('a draft without evidence cannot be submitted; the same supplier invoice number twice is a duplicate', async () => {
    const w = payWorld();
    const r = await refusedUnchanged(w, () => w.as('lsp_accounts').post('/supplier-bills/sbl_lsp_0003/submit'));
    expect(r.errors.evidence?.[0]?.code).toBe('payables:errors.evidenceRequired');
    expect(await refusedUnchanged(w, () => w.post('/supplier-bills', billBody({ supplierId: 'sup_lsp_ravi', supplierInvoiceNo: 'rct-inv-4471' })))).toMatchObject({ status: 409, code: 'duplicate_invoice' });
  });

  it('a utility bill needs its service, consumer number and an ordered period', async () => {
    const w = payWorld();
    const r = await refusedUnchanged(w, () => w.as('lsp_accounts').post('/supplier-bills', billBody({ kind: 'utility', utility: { service: 'steam', consumerNo: 'x', periodFrom: '2026-10-01', periodTo: '2026-09-01' } })));
    expect(Object.keys(r.errors).sort()).toEqual(['utility.consumerNo', 'utility.periodTo', 'utility.service']);
  });

  it('a petty-cash expense never exceeds the float; a top-up never exceeds the authorised float', async () => {
    const w = payWorld();
    const r = await refusedUnchanged(w, () => w.as('lsp_budget_holder').post('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_heights', category: 'site_running', description: 'Big spend', amount: '60000', incurredOn: '2026-10-25', payee: 'Shop', paidVia: 'petty_cash', floatId: 'pcf_lsp_heights' }));
    expect(r.errors.amount?.[0]?.code).toBe('payables:errors.aboveFloat');
    const t = await refusedUnchanged(w, () => w.post('/petty-cash/pcf_lsp_heights/top-ups', { amount: '60000', reason: 'Top-up' }));
    expect(t.errors.amount?.[0]?.code).toBe('payables:errors.aboveImprest');
  });

  it('a budget names each category once; one open version at a time; one budget per cost centre and year', async () => {
    const w = payWorld();
    const r = await refusedUnchanged(w, () => w.as('lsp_accounts').post('/budgets', { legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_sales', year: 'FY2026-27', reason: 'Sales', lines: [{ category: 'marketing', amount: '1' }, { category: 'marketing', amount: '2' }] }));
    expect(r.errors['lines.1.category']?.[0]?.code).toBe('payables:errors.duplicateCategory');
    expect((await refusedUnchanged(w, () => w.post('/budgets', { legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_hq', year: 'FY2026-27', reason: 'Again', lines: [{ category: 'office', amount: '1' }] }))).code).toBe('budget_exists');
    expect((await refusedUnchanged(w, () => w.post('/budgets/bud_lsp_gardens_fy27/versions', { reason: 'Second', lines: [{ category: 'other', amount: '1' }] }))).code).toBe('version_open');
  });
});

describe('expenses, claims, petty cash and budgets (positive journeys)', () => {
  it('an expense goes draft → submitted → approved by someone else, and stays "not settled"', async () => {
    const w = payWorld();
    const e = await w.as('lsp_budget_holder').post<ExpenseView>('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_heights', category: 'site_running', description: 'Drinking water for site staff', amount: '3400', incurredOn: '2026-10-25', payee: 'Aqua Supplies (Demo)', paidVia: 'petty_cash', floatId: 'pcf_lsp_heights' });
    expect(e).toMatchObject({ state: 'draft', ref: expect.stringMatching(/^LSP-EXP-2026-\d{4}$/), floatName: 'Larkspur Heights site office float (Demo)' });
    expect((await refusedUnchanged(w, () => w.post(`/expenses/${e.id}/submit`))).errors.evidence?.[0]?.code).toBe('payables:errors.evidenceRequired');
    const e2 = await w.post<ExpenseView>('/expenses', { kind: 'business', legalEntityId: 'le_larkspur', costCentreId: 'cc_heights', category: 'site_running', description: 'Drinking water for site staff', amount: '3400', incurredOn: '2026-10-25', payee: 'Aqua Supplies (Demo)', paidVia: 'petty_cash', floatId: 'pcf_lsp_heights', evidence: { ...SAMPLE, kind: 'receipt' } });
    await w.post(`/expenses/${e2.id}/submit`);
    expect((await refusedUnchanged(w, () => w.as('lsp_accounts').post(`/expenses/${e2.id}/withdraw`))).code).toBe('not_maker');
    const ok = await w.as('lsp_finance_controller').post<ExpenseView>(`/expenses/${e2.id}/approve`);
    expect(ok).toMatchObject({ state: 'approved', settlement: 'not_settled', posting: 'planned' });
    expect((await refusedUnchanged(w, () => w.post(`/expenses/${e2.id}/approve`))).code).toBe('state_conflict');
  });

  it('a claim is recorded for a staff member and decided by someone who is neither maker nor claimant', async () => {
    const w = payWorld();
    const c = await w.as('lsp_accounts').post<ExpenseView>('/expenses', { kind: 'claim', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_sales', category: 'travel', description: 'Taxi to site visit', amount: '1800', incurredOn: '2026-10-24', claimantId: 'usr_lsp_0004', evidence: { ...SAMPLE, kind: 'receipt' } });
    expect(c).toMatchObject({ kind: 'claim', claimant: { name: 'Hamza Rashid' }, payee: 'Hamza Rashid', ref: expect.stringMatching(/^LSP-CLM-2026-\d{4}$/) });
    expect((await refusedUnchanged(w, () => w.post('/expenses', { kind: 'claim', legalEntityId: 'le_larkspur', costCentreId: 'cc_lsp_sales', category: 'travel', description: 'Taxi', amount: '1', incurredOn: '2026-10-24', claimantId: 'usr_cb_0001' }))).errors.claimantId?.[0]?.code).toBe('payables:errors.unknownClaimant');
    await w.post(`/expenses/${c.id}/submit`);
    const rej = await w.as('lsp_finance_controller').post<ExpenseView>(`/expenses/${c.id}/reject`, { reason: 'Receipt unreadable' });
    expect(rej).toMatchObject({ state: 'rejected', decisionNote: 'Receipt unreadable' });
  });

  it('a count is witnessed by a second person; a top-up is an approved instruction and changes no cash', async () => {
    const w = payWorld();
    const f = await w.as('lsp_finance_controller').post<PettyCashFloatView>('/petty-cash/pcf_lsp_heights/counts/pcc_lsp_0001/witness', { decision: 'confirm' });
    expect(f.lastWitnessed).toMatchObject({ amount: { amount: '31250.00' }, countedByName: 'Rehan Saleem', witnessedByName: 'Zubair Ansari', state: 'witnessed' });
    expect((await refusedUnchanged(w, () => w.post('/petty-cash/pcf_lsp_heights/counts/pcc_lsp_0001/witness', { decision: 'confirm' }))).code).toBe('state_conflict');
    const t = await w.as('lsp_budget_holder').post<PettyCashFloatView>('/petty-cash/pcf_lsp_heights/top-ups', { amount: '18750', reason: 'Back to the authorised float' });
    expect((await refusedUnchanged(w, () => w.post('/petty-cash/pcf_lsp_heights/top-ups', { amount: '1', reason: 'Another' }))).code).toBe('top_up_pending');
    const a = await w.as('lsp_finance_controller').post<PettyCashFloatView>(`/petty-cash/pcf_lsp_heights/top-ups/${t.topUps[0]!.id}/approve`);
    expect(a.topUps[0]).toMatchObject({ state: 'approved', settlement: 'not_settled' });
    expect(a.lastWitnessed?.amount).toEqual({ amount: '31250.00', currency: 'PKR' });
    expect(a.imprest).toEqual({ amount: '50000.00', currency: 'PKR' });
    // A dispute needs a note.
    const c = await w.as('lsp_budget_holder').post<PettyCashFloatView>('/petty-cash/pcf_lsp_heights/counts', { notes: { '1000': 30 }, evidence: { ...SAMPLE, kind: 'count_sheet' } });
    expect((await refusedUnchanged(w, () => w.as('lsp_finance_controller').post(`/petty-cash/pcf_lsp_heights/counts/${c.counts[0]!.id}/witness`, { decision: 'dispute' }))).errors.note).toBeDefined();
  });

  it('a budget version is approved by someone else; a new version supersedes it; budget vs actual compares approved versions with posted actuals only', async () => {
    const w = payWorld();
    expect((await w.as('lsp_budget_holder').get<BudgetVsActual>('/budget-vs-actual')).budgets).toEqual([]);
    const v1 = await w.as('lsp_finance_controller').post<BudgetView>('/budgets/bud_lsp_heights_fy27/versions/1/approve');
    expect(v1.approved).toEqual({ n: 1, total: { amount: '65400000.00', currency: 'PKR' } });
    // An approved Heights bill and an approved Heights expense appear apart from actual (nothing is posted).
    await w.post('/supplier-bills/sbl_lsp_0001/approve');
    await w.post('/expenses/exp_lsp_0001/approve');
    const r = await w.as('lsp_budget_holder').get<BudgetVsActual>('/budget-vs-actual');
    expect(r).toMatchObject({ postingPlanned: true, commitments: 'planned' });
    const heights = r.budgets.find((b) => b.costCentre.id === 'cc_heights')!;
    // The budget holder has no supplier.view: approved bills are not included for him.
    expect(heights.billsIncluded).toBe(false);
    expect(heights.rows.find((x) => x.category === 'site_running')).toMatchObject({ budget: { amount: '1200000.00' }, actualPosted: { amount: '0.00' }, approvedNotPosted: { amount: '18500.00' }, remaining: { amount: '1200000.00' } });
    const full = (await w.as('lsp_finance_controller').get<BudgetVsActual>('/budget-vs-actual')).budgets.find((b) => b.costCentre.id === 'cc_heights')!;
    expect(full.billsIncluded).toBe(true);
    expect(full.rows.find((x) => x.category === 'materials')).toMatchObject({ approvedNotPosted: { amount: '1240000.00' }, actualPosted: { amount: '0.00' } });
    const v2 = await w.as('lsp_budget_holder').post<BudgetView>('/budgets/bud_lsp_heights_fy27/versions', { reason: 'Revised after Tower C redesign', lines: [{ category: 'materials', amount: '47000000' }] });
    await w.post(`/budgets/${v2.id}/versions/2/submit`);
    const after = await w.as('lsp_finance_controller').post<BudgetView>(`/budgets/${v2.id}/versions/2/approve`);
    expect(after.versions.map((v) => [v.n, v.state])).toEqual([[2, 'approved'], [1, 'superseded']]);
  });
});

describe('a draft’s document (attached by its maker, while it is a draft)', () => {
  it('the maker attaches the bill to a draft, then submits it; nobody else, and never after submission', async () => {
    const w = payWorld();
    expect((await refusedUnchanged(w, () => w.as(BOTH_HATS.id).post('/supplier-bills/sbl_lsp_0003/evidence', { evidence: SAMPLE }))).code).toBe('not_maker');
    expect((await refusedUnchanged(w, () => w.as('lsp_accounts').post('/supplier-bills/sbl_lsp_0003/evidence', {}))).errors.evidence?.[0]?.code).toBe('payables:errors.evidenceRequired');
    const b = await w.post<BillView>('/supplier-bills/sbl_lsp_0003/evidence', { evidence: SAMPLE });
    expect(b).toMatchObject({ evidence: { name: SAMPLE.name, sample: true }, actions: { attach: true, submit: true } });
    expect((await w.post<BillView>('/supplier-bills/sbl_lsp_0003/submit')).state).toBe('submitted');
    expect((await refusedUnchanged(w, () => w.post('/supplier-bills/sbl_lsp_0003/evidence', { evidence: SAMPLE }))).code).toBe('state_conflict');
  });

  it('the same for an expense draft; a hidden draft is not found', async () => {
    const w = payWorld();
    expect((await refusedUnchanged(w, () => w.as('lsp_budget_holder').post('/expenses/exp_lsp_0002/evidence', { evidence: SAMPLE }))).status).toBe(404);
    const e = await w.as('lsp_accounts').post<ExpenseView>('/expenses/exp_lsp_0002/evidence', { evidence: { ...SAMPLE, kind: 'receipt' } });
    expect(e.evidence?.kind).toBe('receipt');
    expect((await w.post<ExpenseView>('/expenses/exp_lsp_0002/submit')).state).toBe('submitted');
  });
});

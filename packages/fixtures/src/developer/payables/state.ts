import type { BillKind, BudgetVersionState, CountState, DeveloperState, ExpenseKind, ExpenseState, FiscalYear, PaidVia, PayablesEvidence, PaymentState, SpendCategory, SupplierCategory, TopUpState, UtilityDetails } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import type { IdempotencyStore } from '../../idempotency';
import { findPersona } from '../../people';
import type { AuditEvent } from '../../projection';
import { formatRef } from '../../society/numbering';
import { developerState, formatDeveloperRef } from '../state';

/**
 * Gate E.8: the payables area's own demo-store section, `developer.payables` (E.0's pattern: each area
 * keeps its mutable records in `developer.<area>`; the shared developer state stays read-only).
 *
 * Reads never store anything (`payablesState` returns the seed when nothing is stored, so a read or a
 * refusal leaves the store byte-identical); the first accepted change stores the section
 * (`payablesStateForWrite`). A stored section of another version, or of another organisation, is
 * re-seeded. "Reset demo" discards it with every other partition.
 *
 * **The seed is bounded and evidence-based (owner directive, money rules):** suppliers, then drafts and
 * submitted bills, expenses, claims, a petty-cash count awaiting its witness and budget versions awaiting
 * approval, each backed by a fictional demo document and labelled demo. Nothing is seeded as approved,
 * paid, settled, posted or witnessed: an approval happens only through a real in-session maker-checker
 * action by a second person. There are no seeded payment instructions.
 */

export const PAYABLES_SECTION = 'developer.payables';
export const PAYABLES_STATE_VERSION = 1 as const;

export interface StoredEvent extends AuditEvent {
  values?: Record<string, string>;
  /** What a supplier-level event is about (a bill), never returned: the projection decides who sees it. */
  billId?: string;
}

export interface StoredSupplier {
  id: string;
  ref: string;
  legalEntityId: string;
  name: string;
  category: SupplierCategory;
  taxRef?: string;
  contactName: string;
  phone: string;
  email?: string;
  projectIds: string[];
  /** Masked payee account (last four only; the full number is never stored in the prototype). */
  bank?: { bankName: string; title: string; last4: string };
  createdBy: string;
  createdByName: string;
  createdAt: string;
  demo: boolean;
  history: StoredEvent[];
}

export interface StoredBillLine {
  id: string;
  description: string;
  category: SpendCategory;
  costCentreId: string;
  amount: string;
}

export interface StoredBill {
  id: string;
  ref: string;
  legalEntityId: string;
  supplierId: string;
  kind: BillKind;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  utility?: UtilityDetails;
  lines: StoredBillLine[];
  evidence?: PayablesEvidence;
  state: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  demo: boolean;
  history: StoredEvent[];
}

export interface StoredPayment {
  id: string;
  ref: string;
  legalEntityId: string;
  supplierId: string;
  billId: string;
  amount: string;
  note?: string;
  state: PaymentState;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  sentBy?: string;
  sentByName?: string;
  sentAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: StoredEvent[];
}

export interface StoredExpense {
  id: string;
  ref: string;
  kind: ExpenseKind;
  legalEntityId: string;
  costCentreId: string;
  category: SpendCategory;
  description: string;
  amount: string;
  incurredOn: string;
  payee: string;
  paidVia?: PaidVia;
  floatId?: string;
  claimantId?: string;
  claimantName?: string;
  evidence?: PayablesEvidence;
  state: ExpenseState;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  demo: boolean;
  history: StoredEvent[];
}

export interface StoredCount {
  id: string;
  countedOn: string;
  notes: Record<string, number>;
  amount: string;
  countedBy: string;
  countedByName: string;
  countedAt: string;
  state: CountState;
  witnessedBy?: string;
  witnessedByName?: string;
  witnessedAt?: string;
  note?: string;
  evidence?: PayablesEvidence;
}

export interface StoredTopUp {
  id: string;
  ref: string;
  amount: string;
  reason: string;
  state: TopUpState;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
}

export interface StoredFloat {
  id: string;
  legalEntityId: string;
  costCentreId: string;
  name: string;
  custodianId: string;
  custodianName: string;
  /** The authorised float (illustrative, configured by administration; E-37). */
  imprest: string;
  counts: StoredCount[];
  topUps: StoredTopUp[];
  history: StoredEvent[];
}

export interface StoredBudgetVersion {
  n: number;
  state: BudgetVersionState;
  lines: Array<{ category: SpendCategory; amount: string }>;
  reason: string;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  submittedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface StoredBudget {
  id: string;
  ref: string;
  legalEntityId: string;
  costCentreId: string;
  year: FiscalYear;
  versions: StoredBudgetVersion[];
  demo: boolean;
  history: StoredEvent[];
}

export interface PayablesState {
  version: typeof PAYABLES_STATE_VERSION;
  tenantId: string;
  suppliers: StoredSupplier[];
  bills: StoredBill[];
  payments: StoredPayment[];
  expenses: StoredExpense[];
  floats: StoredFloat[];
  budgets: StoredBudget[];
  /** Next sequence per entity, document kind and year. */
  seq: Record<string, number>;
  idempotency: IdempotencyStore;
}

/** Payables documents numbered per entity (the society engine's tokens). Bills and payment vouchers use E.0's series. */
export const PAYABLES_NUMBERING = {
  supplier: '{code}-SUP-{seq:4}',
  expense: '{code}-EXP-{yyyy}-{seq:4}',
  claim: '{code}-CLM-{yyyy}-{seq:4}',
  top_up: '{code}-PCT-{yyyy}-{seq:4}',
  budget: '{code}-BUD-{seq:3}',
} as const;
export type PayablesDocKind = keyof typeof PAYABLES_NUMBERING | 'supplier_bill' | 'payment_voucher';

const yearScoped = (kind: PayablesDocKind) => kind !== 'supplier' && kind !== 'budget';

/** The next reference of a kind for an entity (sequence per entity, kind and, where the pattern has one, year). */
export function nextRef(st: PayablesState, dev: DeveloperState, legalEntityId: string, kind: PayablesDocKind, on: string): string {
  const key = `${legalEntityId}:${kind}${yearScoped(kind) ? `:${on.slice(0, 4)}` : ''}`;
  const seq = (st.seq[key] ?? 0) + 1;
  st.seq[key] = seq;
  if (kind === 'supplier_bill' || kind === 'payment_voucher') return formatDeveloperRef(dev, legalEntityId, kind, { seq, on });
  const entity = dev.legalEntities.find((e) => e.id === legalEntityId);
  if (!entity) throw new RangeError(`No entity ${legalEntityId}`);
  return formatRef(PAYABLES_NUMBERING[kind], { code: entity.code, seq, on });
}

// ---------------------------------------------------------------------------------------------
// Seed (Larkspur Estates only; fictional)
// ---------------------------------------------------------------------------------------------

const nameOf = (personaId: string, fallback: string) => findPersona(personaId)?.displayName ?? fallback;
const principalOf = (personaId: string, fallback: string) => findPersona(personaId)?.principalId ?? fallback;

const doc = (name: string, kind: PayablesEvidence['kind'] = 'invoice', size = 184_000): PayablesEvidence => ({ name, kind, size, sample: true });

export function seedPayables(tenantId: string, dev: DeveloperState | null): PayablesState {
  const st: PayablesState = { version: PAYABLES_STATE_VERSION, tenantId, suppliers: [], bills: [], payments: [], expenses: [], floats: [], budgets: [], seq: {}, idempotency: {} };
  const LE = 'le_larkspur';
  if (tenantId !== 'tnt_larkspur' || !dev?.legalEntities.some((e) => e.id === LE)) return st;
  const faiza = { by: principalOf('lsp_accounts', 'usr_lsp_0006'), byName: nameOf('lsp_accounts', 'Faiza Noor') };
  const rehan = { by: principalOf('lsp_budget_holder', 'usr_lsp_0021'), byName: nameOf('lsp_budget_holder', 'Rehan Saleem') };
  const zubair = { id: principalOf('lsp_finance_controller', 'usr_lsp_0007'), name: nameOf('lsp_finance_controller', 'Zubair Ansari') };
  const hamza = { id: principalOf('lsp_sales_manager', 'usr_lsp_0004'), name: nameOf('lsp_sales_manager', 'Hamza Rashid') };
  const mehwish = { id: principalOf('lsp_project_manager', 'usr_lsp_0005'), name: nameOf('lsp_project_manager', 'Mehwish Kazmi') };

  const supplier = (id: string, name: string, category: SupplierCategory, projectIds: string[], extra: Partial<StoredSupplier>, at: string) => {
    const s: StoredSupplier = {
      id,
      ref: nextRef(st, dev, LE, 'supplier', at.slice(0, 10)),
      legalEntityId: LE,
      name,
      category,
      contactName: extra.contactName ?? 'Accounts desk (demo)',
      phone: extra.phone ?? '+92 300 0000000',
      projectIds,
      createdBy: faiza.by,
      createdByName: faiza.byName,
      createdAt: at,
      demo: true,
      history: [{ at, ...faiza, action: 'supplier_created' }],
      ...extra,
    };
    st.suppliers.push(s);
    return s;
  };
  supplier('sup_lsp_ravi', 'Ravi Cement Traders (Demo)', 'materials', ['prj_heights', 'prj_gardens'], { taxRef: 'DEMO-NTN-0041187', contactName: 'Accounts desk (demo)', phone: '+92 300 1110001', email: 'accounts@ravi-cement.example.com', bank: { bankName: 'Demo Bank (fictional)', title: 'Ravi Cement Traders (Demo)', last4: '3307' } }, '2026-08-04T06:30:00Z');
  supplier('sup_lsp_margalla', 'Margalla Steel Works (Demo)', 'materials', ['prj_heights'], { taxRef: 'DEMO-NTN-0052290', phone: '+92 300 1110002', email: 'billing@margalla-steel.example.com', bank: { bankName: 'Demo Bank (fictional)', title: 'Margalla Steel Works (Demo)', last4: '8812' } }, '2026-08-11T07:10:00Z');
  supplier('sup_lsp_indus', 'Indus Electrical Contractors (Demo)', 'contractor', ['prj_gardens'], { taxRef: 'DEMO-NTN-0063321', phone: '+92 300 1110003', bank: { bankName: 'Demo Bank (fictional)', title: 'Indus Electrical Contractors (Demo)', last4: '5146' } }, '2026-09-01T05:45:00Z');
  supplier('sup_lsp_citypower', 'City Power Distribution (Demo)', 'utilities', ['prj_heights', 'prj_gardens'], { phone: '+92 300 1110004', bank: { bankName: 'Demo Bank (fictional)', title: 'City Power Distribution (Demo)', last4: '0420' } }, '2026-07-15T06:00:00Z');
  supplier('sup_lsp_metrowater', 'Metro Water Services (Demo)', 'utilities', ['prj_gardens'], { phone: '+92 300 1110005' }, '2026-07-15T06:05:00Z');
  supplier('sup_lsp_saffron', 'Saffron Media & Print (Demo)', 'services', [], { phone: '+92 300 1110006', email: 'studio@saffron-media.example.com' }, '2026-09-20T09:00:00Z');

  const bill = (id: string, supplierId: string, kind: BillKind, invoiceNo: string, invoiceDate: string, dueDate: string, lines: Array<Omit<StoredBillLine, 'id'>>, state: 'draft' | 'submitted', at: string, extra: { utility?: UtilityDetails; evidence?: PayablesEvidence } = {}) => {
    const ref = nextRef(st, dev, LE, 'supplier_bill', invoiceDate);
    const total = lines.reduce((s, l) => s + Number(l.amount), 0).toFixed(2);
    const b: StoredBill = {
      id,
      ref,
      legalEntityId: LE,
      supplierId,
      kind,
      supplierInvoiceNo: invoiceNo,
      invoiceDate,
      dueDate,
      lines: lines.map((l, i) => ({ id: `${id}_l${i + 1}`, ...l })),
      state,
      createdBy: faiza.by,
      createdByName: faiza.byName,
      createdAt: at,
      demo: true,
      history: [{ at, ...faiza, action: 'bill_created', values: { ref, amount: total } }],
      ...extra,
    };
    if (state === 'submitted') {
      const sub = new Date(Date.parse(at) + 3_600_000).toISOString();
      Object.assign(b, { submittedBy: faiza.by, submittedByName: faiza.byName, submittedAt: sub });
      b.history.push({ at: sub, ...faiza, action: 'bill_submitted', values: { ref, amount: total } });
    }
    st.bills.push(b);
    const s = st.suppliers.find((x) => x.id === supplierId)!;
    for (const h of b.history) s.history.push({ ...h, billId: b.id });
  };
  bill('sbl_lsp_0001', 'sup_lsp_ravi', 'standard', 'RCT-INV-4471', '2026-10-14', '2026-11-13', [{ description: 'OPC cement, 3,100 bags — Tower B podium', category: 'materials', costCentreId: 'cc_heights', amount: '1240000.00' }], 'submitted', '2026-10-15T05:20:00Z', { evidence: doc('Demo invoice RCT-INV-4471 (fictional).pdf') });
  bill('sbl_lsp_0002', 'sup_lsp_margalla', 'standard', 'MSW-2026-0918', '2026-10-16', '2026-11-15', [{ description: 'Deformed steel bars, grade 60 — Tower B slab 5', category: 'materials', costCentreId: 'cc_heights', amount: '2850000.00' }], 'submitted', '2026-10-17T06:40:00Z', { evidence: doc('Demo invoice MSW-2026-0918 (fictional).pdf', 'invoice', 212_000) });
  bill('sbl_lsp_0003', 'sup_lsp_indus', 'standard', 'IEC-552', '2026-10-21', '2026-11-20', [{ description: 'Street-light cabling, phase 1 — Block C', category: 'contractors', costCentreId: 'cc_gardens', amount: '640000.00' }], 'draft', '2026-10-22T08:15:00Z');
  bill('sbl_lsp_0004', 'sup_lsp_ravi', 'standard', 'RCT-INV-4502', '2026-10-19', '2026-11-18', [
    { description: 'Cement for Tower C retaining wall', category: 'materials', costCentreId: 'cc_heights', amount: '380000.00' },
    { description: 'Cement for Block C boundary wall', category: 'materials', costCentreId: 'cc_gardens', amount: '295000.00' },
  ], 'submitted', '2026-10-20T04:55:00Z', { evidence: doc('Demo invoice RCT-INV-4502 (fictional).pdf') });
  bill('sbl_lsp_0005', 'sup_lsp_citypower', 'utility', 'DEMO-04-1187-0926', '2026-10-05', '2026-10-28', [{ description: 'Site office and tower cranes, September 2026', category: 'utilities', costCentreId: 'cc_heights', amount: '86450.00' }], 'submitted', '2026-10-06T07:00:00Z', {
    utility: { service: 'electricity', consumerNo: 'DEMO-04-1187', periodFrom: '2026-09-01', periodTo: '2026-09-30' },
    evidence: doc('Demo electricity bill DEMO-04-1187 Sep 2026 (fictional).pdf', 'invoice', 96_000),
  });
  bill('sbl_lsp_0006', 'sup_lsp_metrowater', 'utility', 'MWS-77120-0926', '2026-10-08', '2026-10-30', [{ description: 'Site water connection, September 2026', category: 'utilities', costCentreId: 'cc_gardens', amount: '12300.00' }], 'draft', '2026-10-09T07:30:00Z', {
    utility: { service: 'water', consumerNo: 'MWS-77120', periodFrom: '2026-09-01', periodTo: '2026-09-30' },
  });
  bill('sbl_lsp_0007', 'sup_lsp_saffron', 'standard', 'SMP-1093', '2026-10-12', '2026-11-11', [{ description: 'Brochures and site hoarding prints — Heights launch', category: 'marketing', costCentreId: 'cc_lsp_sales', amount: '175000.00' }], 'submitted', '2026-10-13T10:10:00Z', { evidence: doc('Demo invoice SMP-1093 (fictional).pdf', 'invoice', 154_000) });

  // Petty-cash floats: the authorised float is administration's (illustrative); counts need a witness.
  st.floats.push({
    id: 'pcf_lsp_heights',
    legalEntityId: LE,
    costCentreId: 'cc_heights',
    name: 'Larkspur Heights site office float (Demo)',
    custodianId: rehan.by,
    custodianName: rehan.byName,
    imprest: '50000.00',
    counts: [
      {
        id: 'pcc_lsp_0001',
        countedOn: '2026-10-24',
        notes: { '5000': 4, '1000': 9, '500': 4, '100': 2, '50': 1 },
        amount: '31250.00',
        countedBy: rehan.by,
        countedByName: rehan.byName,
        countedAt: '2026-10-24T12:30:00Z',
        state: 'awaiting_witness',
        evidence: doc('Demo cash count sheet 24 Oct 2026 (fictional).pdf', 'count_sheet', 64_000),
      },
    ],
    topUps: [],
    history: [{ at: '2026-10-24T12:30:00Z', ...rehan, action: 'count_recorded', values: { amount: '31250.00' } }],
  });
  st.floats.push({ id: 'pcf_lsp_hq', legalEntityId: LE, costCentreId: 'cc_lsp_hq', name: 'Head office float (Demo)', custodianId: faiza.by, custodianName: faiza.byName, imprest: '25000.00', counts: [], topUps: [], history: [] });

  const expense = (id: string, kind: ExpenseKind, maker: { by: string; byName: string }, costCentreId: string, category: SpendCategory, description: string, amount: string, incurredOn: string, payee: string, state: 'draft' | 'submitted', at: string, extra: Partial<StoredExpense> = {}) => {
    const ref = nextRef(st, dev, LE, kind === 'claim' ? 'claim' : 'expense', incurredOn);
    const e: StoredExpense = {
      id,
      ref,
      kind,
      legalEntityId: LE,
      costCentreId,
      category,
      description,
      amount,
      incurredOn,
      payee,
      state,
      createdBy: maker.by,
      createdByName: maker.byName,
      createdAt: at,
      demo: true,
      history: [{ at, ...maker, action: 'expense_created', values: { ref, amount } }],
      ...extra,
    };
    if (state === 'submitted') {
      const sub = new Date(Date.parse(at) + 1_800_000).toISOString();
      Object.assign(e, { submittedBy: maker.by, submittedByName: maker.byName, submittedAt: sub });
      e.history.push({ at: sub, ...maker, action: 'expense_submitted', values: { ref, amount } });
    }
    st.expenses.push(e);
  };
  expense('exp_lsp_0001', 'business', rehan, 'cc_heights', 'site_running', 'Diesel for the site office generator', '18500.00', '2026-10-21', 'Ravi Road Fuel Station (Demo)', 'submitted', '2026-10-21T11:00:00Z', { paidVia: 'petty_cash', floatId: 'pcf_lsp_heights', evidence: doc('Demo fuel receipt 21 Oct 2026 (fictional).jpg', 'receipt', 88_000) });
  expense('exp_lsp_0002', 'business', faiza, 'cc_lsp_hq', 'office', 'Printer toner for the accounts office', '9800.00', '2026-10-23', 'Mall Road Stationers (Demo)', 'draft', '2026-10-23T06:20:00Z', { paidVia: 'payable' });
  expense('exp_lsp_0003', 'business', faiza, 'cc_gardens', 'site_running', 'Safety signage for Block C works', '22000.00', '2026-10-18', 'SignCraft Lahore (Demo)', 'submitted', '2026-10-19T05:40:00Z', { paidVia: 'payable', evidence: doc('Demo invoice SC-2210 (fictional).pdf', 'invoice', 120_000) });
  expense('exp_lsp_0004', 'claim', faiza, 'cc_lsp_sales', 'travel', 'Client site visit travel, Lahore–Islamabad', '14200.00', '2026-10-16', hamza.name, 'submitted', '2026-10-17T09:00:00Z', { claimantId: hamza.id, claimantName: hamza.name, evidence: doc('Demo travel receipts 16 Oct 2026 (fictional).pdf', 'receipt', 140_000) });
  expense('exp_lsp_0005', 'claim', faiza, 'cc_gardens', 'travel', 'Site inspection mileage, Block C', '6750.00', '2026-10-20', mehwish.name, 'submitted', '2026-10-20T13:10:00Z', { claimantId: mehwish.id, claimantName: mehwish.name, evidence: doc('Demo mileage log Oct 2026 (fictional).pdf', 'receipt', 72_000) });
  expense('exp_lsp_0006', 'claim', faiza, 'cc_lsp_hq', 'office', 'Audit committee meeting refreshments', '4500.00', '2026-10-22', zubair.name, 'submitted', '2026-10-22T14:00:00Z', { claimantId: zubair.id, claimantName: zubair.name, evidence: doc('Demo café receipt 22 Oct 2026 (fictional).jpg', 'receipt', 41_000) });
  const heightsFloat = st.floats[0]!;
  heightsFloat.history.push({ at: '2026-10-21T11:30:00Z', ...rehan, action: 'expense_charged', values: { ref: st.expenses[0]!.ref, amount: '18500.00' } });

  const budget = (id: string, costCentreId: string, maker: { by: string; byName: string }, state: 'draft' | 'submitted', lines: Array<{ category: SpendCategory; amount: string }>, at: string, reason: string) => {
    const ref = nextRef(st, dev, LE, 'budget', at.slice(0, 10));
    const v: StoredBudgetVersion = { n: 1, state, lines, reason, preparedBy: maker.by, preparedByName: maker.byName, preparedAt: at, ...(state === 'submitted' ? { submittedAt: new Date(Date.parse(at) + 7_200_000).toISOString() } : {}) };
    const total = lines.reduce((s, l) => s + Number(l.amount), 0).toFixed(2);
    st.budgets.push({
      id,
      ref,
      legalEntityId: LE,
      costCentreId,
      year: 'FY2026-27',
      versions: [v],
      demo: true,
      history: [{ at, ...maker, action: 'version_created', values: { n: '1', amount: total } }, ...(v.submittedAt ? [{ at: v.submittedAt, ...maker, action: 'version_submitted', values: { n: '1', amount: total } }] : [])],
    });
  };
  budget('bud_lsp_heights_fy27', 'cc_heights', rehan, 'submitted', [
    { category: 'materials', amount: '45000000.00' },
    { category: 'contractors', amount: '18000000.00' },
    { category: 'site_running', amount: '1200000.00' },
    { category: 'utilities', amount: '900000.00' },
    { category: 'other', amount: '300000.00' },
  ], '2026-10-15T08:00:00Z', 'Initial FY2026-27 budget (demo)');
  budget('bud_lsp_gardens_fy27', 'cc_gardens', faiza, 'draft', [
    { category: 'contractors', amount: '9500000.00' },
    { category: 'materials', amount: '6000000.00' },
    { category: 'site_running', amount: '650000.00' },
    { category: 'utilities', amount: '240000.00' },
  ], '2026-10-22T09:30:00Z', 'Initial FY2026-27 budget (demo)');
  budget('bud_lsp_hq_fy27', 'cc_lsp_hq', faiza, 'submitted', [
    { category: 'office', amount: '1500000.00' },
    { category: 'professional_fees', amount: '2400000.00' },
    { category: 'utilities', amount: '600000.00' },
  ], '2026-10-10T07:00:00Z', 'Initial FY2026-27 budget (demo)');
  return st;
}

const current = (s: PayablesState | undefined, tenantId: string): s is PayablesState => !!s && s.version === PAYABLES_STATE_VERSION && s.tenantId === tenantId;

/** For reading: the stored section when current, else the seed (computed, never stored). */
export function payablesState(ctx: Pick<HandlerContext, 'access' | 'data' | 'demo'>): PayablesState {
  const stored = ctx.demo.peekSection<PayablesState>(PAYABLES_SECTION);
  return current(stored, ctx.data.tenantId) ? stored : seedPayables(ctx.data.tenantId, developerState(ctx));
}

/** For a change that passed every check: stored on first use, re-seeded when stale. Call `ctx.demo.save()` after. */
export function payablesStateForWrite(ctx: Pick<HandlerContext, 'access' | 'data' | 'demo'>): PayablesState {
  if (!current(ctx.demo.peekSection<PayablesState>(PAYABLES_SECTION), ctx.data.tenantId)) ctx.demo.resetSection(PAYABLES_SECTION);
  return ctx.demo.section<PayablesState>(PAYABLES_SECTION, () => seedPayables(ctx.data.tenantId, developerState(ctx)));
}

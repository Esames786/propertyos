import type { BankImportRow, BankImportState, BankLine, FiscalPeriod, GlAccountLock, GlAccountState, GlAccountType, JournalKind, JournalState, LedgerEvent, PostingDecision, PostingEvent } from '@repo/contracts';
import { buildIban } from '@repo/i18n/format';
import type { DeveloperState } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { developerState, ENTITY_PROFILES } from '../state';
import { pkt } from '../../hr/state';
import { DEMO_COLLECTION_ACCOUNT } from '../../records';
import { addJournal, approveAccount, approveImport, approveJournal, closePeriod, createImport, draftAccount, normaliseJournal, postJournal, reverseJournal, submitImport, submitJournal, type Actor, type RawJournal } from './engine';
import { priorStatement } from './samples';

/**
 * Gate E.7 ledger and bank-import records of one organisation (one state per tenant, in its demo
 * partition; reset by "Reset demo"). Everything is fictional money for Larkspur Estates (Demo).
 *
 * **E.0 developer state** (Wave 1 integration, decision E-37): the legal entity, its code and its cost centres
 * are E.0's read-only administration data (`developer/state.ts`), and the verified collection account is E.0's
 * too (the one the buyer portal shows, `DEMO_COLLECTION_ACCOUNT`); the ledger adds its fiscal year, its chart and
 * its operating and escrow accounts.
 *
 * The demo ledger is entered through the journal path (`normaliseJournal` → `addJournal` → submit →
 * approve by another person → post by another person), by the fictional accounts officer and finance
 * controller. Every seeded journal is a labelled manual "Demo" journal: opening balances, accruals, a
 * reclassification and a mistaken accrual corrected by its reversal. None comes from an invoice, a
 * payment or a bank line, and none touches cash at bank (E-17: cash lines only from confirmed payments
 * or settlement confirmations, which do not exist in this gate).
 */
// 1: Gate E.7 (Wave 1, provisional). 2: Wave 1 integration (E.0's entity, code, cost centres, numbering and keys).
export const LEDGER_STATE_VERSION = 2;
// E.0's convention: an area's own records live in the section `developer.<area>`.
export const LEDGER_SECTION = 'developer.ledger';

export interface StoredEntity {
  id: string;
  name: string;
  code: string;
  /** First month of the fiscal year (7 = July). */
  fiscalYearStartMonth: number;
  /** First month of the books ("2026-07"). */
  booksFrom: string;
}

export interface StoredCostCentre {
  id: string;
  entityId: string;
  code: string;
  labelKey: string;
  projectId?: string;
}

export interface StoredBankAccount {
  id: string;
  entityId: string;
  name: string;
  bankName: string;
  iban: string;
  /** A statement is imported only for a verified account. */
  verified: boolean;
  glAccountId?: string;
}

export interface StoredGlAccount {
  id: string;
  entityId: string;
  code: string;
  labelKey?: string;
  name: string;
  type: GlAccountType;
  state: GlAccountState;
  lock?: GlAccountLock;
  bankAccountId?: string;
  sinceVersion?: number;
  draftedBy: string;
  draftedByName: string;
  draftedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectReason?: string;
  history: LedgerEvent[];
}

export interface StoredChartVersion {
  entityId: string;
  version: number;
  at: string;
  by: string;
  byName: string;
  approvedByName?: string;
  change: 'seeded' | 'account_added';
  accountCode?: string;
}

export interface StoredJournalLine {
  n: number;
  accountId: string;
  debit: string;
  credit: string;
  memo?: string;
  costCentreId?: string;
}

export interface StoredJournal {
  id: string;
  ref: string;
  entityId: string;
  date: string;
  memo: string;
  kind: JournalKind;
  state: JournalState;
  lines: StoredJournalLine[];
  demo: boolean;
  makerId: string;
  makerName: string;
  createdAt: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  postedBy?: string;
  postedByName?: string;
  postedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectReason?: string;
  /** This journal reverses that one. */
  reversalOfId?: string;
  /** That journal reverses this one (pending or posted). */
  reversalId?: string;
  reverseReason?: string;
  history: LedgerEvent[];
}

export interface StoredPeriod extends FiscalPeriod {
  reopenRequest?: { by: string; byName: string; at: string; reason: string };
}

export interface StoredRuleVersion {
  n: number;
  effectiveFrom: string;
  debitAccountId: string;
  creditAccountId: string;
  draftedBy: string;
  draftedByName: string;
  draftedAt: string;
  note?: string;
}

export interface StoredRule {
  id: string;
  ref: string;
  entityId: string;
  event: PostingEvent;
  sourceSlice: 'E.6' | 'E.8' | 'E.14';
  blockedBy: PostingDecision[];
  versions: StoredRuleVersion[];
  history: LedgerEvent[];
}

export interface StoredImport {
  id: string;
  ref: string;
  entityId: string;
  accountId: string;
  fileName: string;
  sample: boolean;
  fileHash: string;
  state: BankImportState;
  rows: BankImportRow[];
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectReason?: string;
  committedLines?: number;
  history: LedgerEvent[];
}

/** Issue #16 / §4.5: a key binds the operation, the principal, the target and the normalised request. */
export interface IdemEntry {
  op: string;
  principal: string;
  target: string;
  fp: string;
  id: string;
}

export interface LedgerState {
  version: typeof LEDGER_STATE_VERSION;
  counters: Record<string, number>;
  entities: StoredEntity[];
  costCentres: StoredCostCentre[];
  bankAccounts: StoredBankAccount[];
  accounts: StoredGlAccount[];
  chartVersions: StoredChartVersion[];
  journals: StoredJournal[];
  periods: StoredPeriod[];
  rules: StoredRule[];
  imports: StoredImport[];
  /** Committed statement lines: unmatched statement lines (never receipts or payments). */
  lines: BankLine[];
  idempotency: Record<string, IdemEntry>;
}

export const emptyLedger = (): LedgerState => ({
  version: LEDGER_STATE_VERSION,
  counters: {},
  entities: [],
  costCentres: [],
  bankAccounts: [],
  accounts: [],
  chartVersions: [],
  journals: [],
  periods: [],
  rules: [],
  imports: [],
  lines: [],
  idempotency: {},
});

/**
 * Fictional people of the seeded ledger, from the reconciled Wave 1 roster (people.ts): Saad prepares journals
 * (lsp_ledger_clerk, no bank permission), Faiza prepares chart and posting-rule changes and statement imports
 * (lsp_accounts), Zubair approves, posts and closes (lsp_finance_controller). Nobody approves their own work.
 */
export const SAAD: Actor = { by: 'usr_lsp_0008', byName: 'Saad Hameed' };
export const FAIZA: Actor = { by: 'usr_lsp_0006', byName: 'Faiza Noor' };
export const ZUBAIR: Actor = { by: 'usr_lsp_0007', byName: 'Zubair Ansari' };

export const LARKSPUR_ENTITY = 'le_larkspur';
export const BOOKS_FROM = '2026-07';
/** The demo's business date (fixtures are frozen in time). */
export const LEDGER_TODAY = '2026-10-26';

/**
 * The verified collection account is E.0's (developer state `collectionAccounts`, id `dca_lsp_01`, masked to the
 * same last four digits): one account, the one the buyer portal shows. The operating and escrow accounts are the
 * ledger's own (E.0 seeds collection accounts only).
 */
export const COLLECTION_ACCOUNT = { id: 'dca_lsp_01', iban: DEMO_COLLECTION_ACCOUNT.iban };
export const OPERATING_ACCOUNT = { id: 'lba_lsp_operating', iban: buildIban('PK', 'DEMO0000009876543210') };
export const ESCROW_ACCOUNT = { id: 'lba_lsp_escrow', iban: buildIban('PK', 'DEMO0000005550001111') };

/** The illustrative chart (E-16: "illustrative, not a statutory chart"), codes by type. */
const CHART: ReadonlyArray<[code: string, name: string, type: GlAccountType, lock?: GlAccountLock]> = [
  ['1000', 'Cash at bank — collection account', 'asset', 'cash_evidence'],
  ['1010', 'Cash at bank — operating account', 'asset', 'cash_evidence'],
  ['1100', 'Receivables — buyers', 'asset'],
  ['1200', 'Advances to contractors', 'asset'],
  ['1300', 'Land held for development', 'asset'],
  ['1310', 'Construction work in progress', 'asset'],
  ['2000', 'Payables — suppliers', 'liability'],
  ['2100', 'Contract liability — customer advances', 'liability'],
  ['2200', 'Accrued expenses', 'liability'],
  ['3000', 'Share capital', 'equity'],
  ['3100', 'Retained earnings', 'equity'],
  ['4000', 'Revenue — recognition policy not set', 'income', 'revenue_policy'],
  ['4100', 'Other income', 'income'],
  ['5000', 'Salaries and wages', 'expense'],
  ['5100', 'Rent and utilities', 'expense'],
  ['5200', 'Marketing and advertising', 'expense'],
  ['5300', 'Professional fees', 'expense'],
];

export const accountId = (entityCode: string, code: string) => `gla_${entityCode.toLowerCase()}_c${code}`;

/** Seeds an entity's read-only setup and its illustrative chart (version 1). */
export function seedEntity(s: LedgerState, entity: StoredEntity, opts: { costCentres?: Array<Omit<StoredCostCentre, 'entityId'>>; banks?: StoredBankAccount[]; at: string; by: Actor; approver: Actor }): void {
  s.entities.push(entity);
  s.costCentres.push(...(opts.costCentres ?? []).map((c) => ({ ...c, entityId: entity.id })));
  s.bankAccounts.push(...(opts.banks ?? []));
  for (const [code, name, type, lock] of CHART) {
    const bank = (opts.banks ?? []).find((b) => b.glAccountId === accountId(entity.code, code));
    s.accounts.push({
      id: accountId(entity.code, code),
      entityId: entity.id,
      code,
      labelKey: `ledger:chart.accounts.${code}`,
      name,
      type,
      state: 'active',
      ...(lock ? { lock } : {}),
      ...(bank ? { bankAccountId: bank.id } : {}),
      sinceVersion: 1,
      draftedBy: opts.by.by,
      draftedByName: opts.by.byName,
      draftedAt: opts.at,
      approvedBy: opts.approver.by,
      approvedByName: opts.approver.byName,
      approvedAt: opts.at,
      history: [{ at: opts.at, by: opts.approver.by, byName: opts.approver.byName, action: 'account_seeded' }],
    });
  }
  s.chartVersions.push({ entityId: entity.id, version: 1, at: opts.at, by: opts.by.by, byName: opts.by.byName, approvedByName: opts.approver.byName, change: 'seeded' });
}

/** A seeded journal through the journal path: drafted by the maker, approved and posted by someone else. */
function journal(s: LedgerState, entityId: string, raw: RawJournal, day: string, stage: 'draft' | 'submitted' | 'posted', maker = SAAD, checker = ZUBAIR) {
  const n = normaliseJournal(s, entityId, raw, LEDGER_TODAY);
  if (!n.journal) throw new Error(`seed journal invalid: ${JSON.stringify(n.problems)}`);
  const j = addJournal(s, n.journal, maker, pkt(day, '10:00'), { demo: true });
  if (stage === 'draft') return j;
  submitJournal(j, maker, pkt(day, '10:05'));
  if (stage === 'submitted') return j;
  approveJournal(j, checker, pkt(day, '15:30'));
  postJournal(s, j, checker, pkt(day, '15:35'));
  return j;
}

/** Larkspur's entity code: E.0's developer state (read-only administration data, E-37). */
const LSP = ENTITY_PROFILES.le_larkspur!.code;
const L = (code: string, debit: string, credit: string, extra: { memo?: string; costCentreId?: string } = {}) => ({ accountId: accountId(LSP, code), debit, credit, ...extra });

/** The ledger's label of each of E.0's cost centres (EN and UR in ledger.json). */
const COST_CENTRE_LABEL: Readonly<Record<string, string>> = { head_office: 'ledger:costCentres.head', sales: 'ledger:costCentres.sales', prj_heights: 'ledger:costCentres.heights', prj_gardens: 'ledger:costCentres.gardens' };

export function seedLarkspur(s: LedgerState, dev: DeveloperState): void {
  const chartAt = pkt('2026-07-01', '09:00');
  // Wave 1 integration: the entity and its cost centres are E.0's (ids, codes and name); the ledger adds its
  // fiscal year and first month of books.
  const entity = dev.legalEntities.find((e) => e.id === LARKSPUR_ENTITY)!;
  seedEntity(s, { id: entity.id, name: entity.name, code: entity.code, fiscalYearStartMonth: 7, booksFrom: BOOKS_FROM }, {
    at: chartAt,
    by: FAIZA,
    approver: ZUBAIR,
    costCentres: dev.costCentres
      .filter((c) => c.legalEntityId === entity.id && COST_CENTRE_LABEL[c.projectId ?? c.kind])
      .map((c) => ({ id: c.id, code: c.code, labelKey: COST_CENTRE_LABEL[c.projectId ?? c.kind]!, ...(c.projectId ? { projectId: c.projectId } : {}) })),
    banks: [
      { id: COLLECTION_ACCOUNT.id, entityId: LARKSPUR_ENTITY, name: DEMO_COLLECTION_ACCOUNT.accountTitle, bankName: DEMO_COLLECTION_ACCOUNT.bankName, iban: COLLECTION_ACCOUNT.iban, verified: true, glAccountId: accountId(LSP, '1000') },
      { id: OPERATING_ACCOUNT.id, entityId: LARKSPUR_ENTITY, name: 'Larkspur Estates Operating (DEMO)', bankName: 'Demo Bank (fictional)', iban: OPERATING_ACCOUNT.iban, verified: true, glAccountId: accountId(LSP, '1010') },
      { id: ESCROW_ACCOUNT.id, entityId: LARKSPUR_ENTITY, name: 'Larkspur Gardens Escrow (DEMO)', bankName: 'Demo Bank (fictional)', iban: ESCROW_ACCOUNT.iban, verified: false },
    ],
  });

  // Posting rules: proposed only (E-15…E-17 need an accounting adviser). Version 1 from the start of the books.
  const rule = (n: number, event: PostingEvent, sourceSlice: StoredRule['sourceSlice'], blockedBy: PostingDecision[], dr: string, cr: string): StoredRule => ({
    id: `prl_${LSP.toLowerCase()}_${String(n).padStart(3, '0')}`,
    ref: `${LSP}-PR-${String(n).padStart(3, '0')}`,
    entityId: LARKSPUR_ENTITY,
    event,
    sourceSlice,
    blockedBy,
    versions: [{ n: 1, effectiveFrom: '2026-07-01', debitAccountId: accountId(LSP, dr), creditAccountId: accountId(LSP, cr), draftedBy: FAIZA.by, draftedByName: FAIZA.byName, draftedAt: pkt('2026-07-01', '09:30') }],
    history: [{ at: pkt('2026-07-01', '09:30'), by: FAIZA.by, byName: FAIZA.byName, action: 'rule_proposed' }],
  });
  s.rules.push(
    rule(1, 'instalment_invoiced', 'E.6', ['E-15', 'E-17'], '1100', '2100'),
    rule(2, 'buyer_payment_confirmed', 'E.6', ['E-17'], '1000', '1100'),
    rule(3, 'supplier_bill_approved', 'E.8', ['E-16', 'E-17'], '1310', '2000'),
    rule(4, 'supplier_payment_settled', 'E.8', ['E-17', 'E-18'], '2000', '1010'),
    rule(5, 'payroll_approved', 'E.14', ['E-17', 'E-33'], '5000', '2200'),
  );
  s.counters['le_larkspur:rule'] = 5;
  // A second, later version of the supplier-bill rule (versions apply by effective date).
  const bills = s.rules[2]!;
  bills.versions.push({ n: 2, effectiveFrom: '2026-11-01', debitAccountId: accountId(LSP, '5100'), creditAccountId: accountId(LSP, '2000'), draftedBy: FAIZA.by, draftedByName: FAIZA.byName, draftedAt: pkt('2026-10-19', '12:10'), note: 'Bills of the head office go to office expenses from November (proposed).' });
  bills.history.push({ at: pkt('2026-10-19', '12:10'), by: FAIZA.by, byName: FAIZA.byName, action: 'rule_version_drafted', values: { version: '2', from: '2026-11-01' } });

  // July: opening balances (no cash: cash at bank changes only on evidence).
  journal(s, LARKSPUR_ENTITY, {
    date: '2026-07-01',
    memo: 'Demo opening balances (fictional)',
    lines: [
      L('1300', '120000000.00', '', { memo: 'Land held for development', costCentreId: 'cc_gardens' }),
      L('1310', '45000000.00', '', { memo: 'Larkspur Heights works to date', costCentreId: 'cc_heights' }),
      L('1200', '10000000.00', '', { costCentreId: 'cc_heights' }),
      L('3000', '', '150000000.00'),
      L('3100', '', '10000000.00'),
      L('2000', '', '15000000.00'),
    ],
  }, '2026-07-01', 'posted');

  // Chart version 2: an account added by draft → approval (September).
  const charges = draftAccount(s, { entityId: LARKSPUR_ENTITY, code: '5400', name: 'Bank charges', type: 'expense' }, FAIZA, pkt('2026-09-08', '11:00'));
  approveAccount(s, charges, ZUBAIR, pkt('2026-09-09', '10:20'));

  journal(s, LARKSPUR_ENTITY, { date: '2026-09-20', memo: 'Demo accrual — consultant fees, September (fictional)', lines: [L('5300', '1200000.00', '', { costCentreId: 'cc_lsp_hq' }), L('2200', '', '1200000.00')] }, '2026-09-20', 'posted');

  // The first three months are closed (no posting in them any more).
  closePeriod(s, LARKSPUR_ENTITY, '2026-07', ZUBAIR, pkt('2026-08-04', '17:00'));
  closePeriod(s, LARKSPUR_ENTITY, '2026-08', ZUBAIR, pkt('2026-09-03', '17:00'));
  closePeriod(s, LARKSPUR_ENTITY, '2026-09', ZUBAIR, pkt('2026-10-05', '17:00'));

  // October (open).
  journal(s, LARKSPUR_ENTITY, { date: '2026-10-05', memo: 'Demo accrual — October office rent (fictional)', lines: [L('5100', '450000.00', '', { costCentreId: 'cc_lsp_hq' }), L('2200', '', '450000.00')] }, '2026-10-05', 'posted');
  const twice = journal(s, LARKSPUR_ENTITY, { date: '2026-10-08', memo: 'Demo accrual — October office rent, entered twice by mistake (fictional)', lines: [L('5100', '450000.00', '', { costCentreId: 'cc_lsp_hq' }), L('2200', '', '450000.00')] }, '2026-10-08', 'posted');
  const reversal = reverseJournal(s, twice, '2026-10-09', 'Rent accrual entered twice (demo)', SAAD, pkt('2026-10-09', '09:40'));
  approveJournal(reversal, ZUBAIR, pkt('2026-10-09', '11:15'));
  postJournal(s, reversal, ZUBAIR, pkt('2026-10-09', '11:20'));
  journal(s, LARKSPUR_ENTITY, { date: '2026-10-12', memo: 'Demo reclassification — contractor advance applied to work in progress (fictional)', lines: [L('1310', '2500000.00', '', { costCentreId: 'cc_heights' }), L('1200', '', '2500000.00', { costCentreId: 'cc_heights' })] }, '2026-10-12', 'posted');
  journal(s, LARKSPUR_ENTITY, { date: '2026-10-20', memo: 'Demo accrual — marketing agency retainer, October (fictional)', lines: [L('5200', '300000.00', '', { costCentreId: 'cc_heights' }), L('2200', '', '300000.00')] }, '2026-10-20', 'submitted');
  journal(s, LARKSPUR_ENTITY, { date: '2026-10-23', memo: 'Demo accrual — audit fee estimate (fictional)', lines: [L('5300', '600000.00', '', { costCentreId: 'cc_lsp_hq' }), L('2200', '', '600000.00')] }, '2026-10-23', 'draft');

  // A chart change waiting for approval.
  draftAccount(s, { entityId: LARKSPUR_ENTITY, code: '5500', name: 'Insurance', type: 'expense' }, FAIZA, pkt('2026-10-21', '14:30'));

  // One statement already imported for the collection account (unmatched statement lines only).
  const prior = createImport(s, { entityId: LARKSPUR_ENTITY, accountId: COLLECTION_ACCOUNT.id, fileName: 'sample-larkspur-collection-2026-10-01-09.csv', sample: true, content: priorStatement(COLLECTION_ACCOUNT.iban) }, FAIZA, pkt('2026-10-10', '10:00'), '2026-10-10');
  submitImport(prior, FAIZA, pkt('2026-10-10', '10:05'));
  approveImport(s, prior, COLLECTION_ACCOUNT.iban, ZUBAIR, pkt('2026-10-10', '12:40'));
}

/** Created on first use; seeded for Larkspur only (others start empty: no developer tenant else licenses accounting). */
export function ledgerState(ctx: HandlerContext): LedgerState {
  const make = () => {
    const s = emptyLedger();
    const dev = ctx.tenantId === 'tnt_larkspur' ? developerState(ctx) : null;
    if (dev) seedLarkspur(s, dev);
    return s;
  };
  const state = ctx.demo.section<LedgerState>(LEDGER_SECTION, make);
  if (state.version !== LEDGER_STATE_VERSION) Object.assign(state, make());
  return state;
}

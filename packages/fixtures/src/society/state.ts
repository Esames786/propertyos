import type {
  BankLine,
  BankStatement,
  Beneficiary,
  BeneficiaryChange,
  BillingRun,
  BillingRunItem,
  ChargeRule,
  CollectionPayment,
  CreditNote,
  CustomerInvoice,
  DocumentKind,
  Exemption,
  FlatFact,
  ImportRow,
  LiabilityChange,
  MethodRule,
  Money,
  NumberingScheme,
  OpeningBalanceBatch,
  PaymentSubmission,
  Receipt,
  SocietyAuditEntry,
  SocietyDemoMode,
} from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { pad } from '../seed';
import {
  ALNOOR_CODE,
  ALNOOR_ENTITY,
  ALNOOR_METHODS,
  ALNOOR_OLD_PAYEE,
  ALNOOR_PAYEE,
  ALNOOR_SITE,
  ALNOOR_STAFF,
  alnoorRegister,
  COOLING_OFF_DAYS,
  FIRST_PERIOD,
  IMPORTED_AT,
  OFFICE_EXEMPTION_REASON,
  OFFICE_FLAT,
  OPENING_AS_OF,
  OPENING_BALANCES,
  sampleFlatFile,
  sampleOpeningFile,
  SEED_RULES,
  type FlatRow,
} from './alnoor';
import { fingerprint } from './import';
import { accountIdOf, buildSociety, factOn, flatIdOf, payerOn, type SocietyModel } from './model';
import { defaultNumbering, formatRef, sequenceScope } from './numbering';
import { allocatedByLine, readInvoice } from './statement';

/**
 * The society's session state (the demo partition's `society` section, shared by the office and the
 * resident app of one browser). Static fixtures stay immutable; everything people do in the demo is
 * recorded here and every read derives from it. "fresh" starts before the flat register is
 * imported; "ready" with setup complete and November not yet billed; "collecting" with November
 * billed and residents' payments arriving (scenario.ts).
 */
export type { SocietyAuditEntry };

export const SOCIETY_STATE_VERSION = 2;

export interface StoredImport {
  id: string;
  kind: 'flats' | 'opening_balances';
  fileName: string;
  fileHash: string;
  rows: ImportRow[];
  by: string;
  at: string;
}

export interface StoredRun extends Omit<BillingRun, 'stale'> {
  hash?: string;
  items: BillingRunItem[];
  invoiceIds?: string[];
}

export interface PostingPolicyState {
  roles: string[];
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface SocietyState {
  version: typeof SOCIETY_STATE_VERSION;
  mode: SocietyDemoMode;
  register: { rows: FlatRow[]; fileHashes: string[]; by: string; byName: string; at: string } | null;
  imports: Record<string, StoredImport>;
  openingBatches: Array<OpeningBalanceBatch & { fileHash: string }>;
  rules: ChargeRule[];
  exemptions: Exemption[];
  /** Requested, approved and corrected changes of liability (only approved ones apply). */
  payerChanges: LiabilityChange[];
  runs: StoredRun[];
  invoices: CustomerInvoice[];
  creditNotes: CreditNote[];
  // Collections (C.2)
  submissions: PaymentSubmission[];
  bank: { statements: BankStatement[]; lines: BankLine[] };
  payments: CollectionPayment[];
  receipts: Receipt[];
  beneficiaries: Beneficiary[];
  beneficiaryChanges: BeneficiaryChange[];
  coolingOffDays: number;
  methods: MethodRule[];
  numbering: NumberingScheme;
  posting: PostingPolicyState;
  /** Document sequences per numbering scope (see numbering.ts). */
  counters: Record<string, number>;
  audit: SocietyAuditEntry[];
  seq: number;
}

export const SOCIETY_SECTION = 'society';

/** Roles that post an approved run by default (owner decision, C.1 review): finance, never the preparer. */
export const DEFAULT_POSTING_ROLES = ['treasurer', 'accounts_officer'];

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const { manager, treasurer } = ALNOOR_STAFF;

export function emptySociety(mode: SocietyDemoMode): SocietyState {
  return {
    version: SOCIETY_STATE_VERSION,
    mode,
    register: null,
    imports: {},
    openingBatches: [],
    rules: [],
    exemptions: [],
    payerChanges: [],
    runs: [],
    invoices: [],
    creditNotes: [],
    submissions: [],
    bank: { statements: [], lines: [] },
    payments: [],
    receipts: [],
    beneficiaries: [structuredClone(ALNOOR_OLD_PAYEE), structuredClone(ALNOOR_PAYEE)],
    beneficiaryChanges: [
      {
        id: 'bch_anr_0001',
        siteId: ALNOOR_SITE.id,
        legalEntityId: ALNOOR_ENTITY.id,
        proposed: { bankName: ALNOOR_PAYEE.bankName, branch: ALNOOR_PAYEE.branch, accountTitle: ALNOOR_PAYEE.accountTitle, iban: ALNOOR_PAYEE.iban },
        reason: 'The association opened its own account; the committee account closes.',
        verification: 'bank_letter_checked',
        state: 'active',
        proposedBy: manager.principalId,
        proposedByName: manager.name,
        proposedAt: '2026-10-09T09:30:00Z',
        decidedBy: treasurer.principalId,
        decidedByName: treasurer.name,
        decidedAt: '2026-10-09T15:00:00Z',
        effectiveOn: '2026-10-12',
        beneficiaryId: ALNOOR_PAYEE.id,
      },
    ],
    coolingOffDays: COOLING_OFF_DAYS,
    methods: structuredClone(ALNOOR_METHODS),
    numbering: defaultNumbering(ALNOOR_CODE),
    posting: { roles: [...DEFAULT_POSTING_ROLES] },
    counters: {},
    audit: [],
    seq: 0,
  };
}

/**
 * The next reference of a kind from the site's numbering scheme. The sequence restarts per the
 * pattern's scope (period, year or never) and only ever moves forward.
 */
export function nextRef(state: Pick<SocietyState, 'numbering' | 'counters'>, kind: DocumentKind, on: string): string {
  const pattern = state.numbering[kind];
  const scope = sequenceScope(kind, pattern, on);
  const seq = (state.counters[scope] ?? 0) + 1;
  state.counters[scope] = seq;
  return formatRef(pattern, { code: state.numbering.code, seq, on });
}

/** Opening-balance invoices for an approved batch (one per account and flat, dated as of go-live). */
export function openingInvoices(batch: OpeningBalanceBatch, facts: readonly FlatFact[], startAt: number, ref: () => string): CustomerInvoice[] {
  return batch.rows.map((row, i) => {
    const n = startAt + i + 1;
    const flatId = flatIdOf(row.flatCode);
    const payer = payerOn(facts, flatId, OPENING_AS_OF);
    const id = `cin_ob_${pad(n, 4)}`;
    const key = fingerprint([ALNOOR_SITE.id, row.accountId, flatId, 'opening', batch.id].join('|'));
    return {
      id,
      ref: ref(),
      legalEntityId: ALNOOR_ENTITY.id,
      legalEntityName: ALNOOR_ENTITY.name,
      siteId: ALNOOR_SITE.id,
      billingAccountId: row.accountId,
      accountNo: row.accountNo,
      payerPartyId: payer?.partyId ?? '',
      payerName: payer?.partyName ?? '',
      source: 'opening_balance',
      period: OPENING_AS_OF.slice(0, 7),
      issuedOn: OPENING_AS_OF,
      dueOn: OPENING_AS_OF,
      issuance: 'issued',
      lines: [
        {
          id: `iln_${key}`,
          kind: 'opening_balance',
          unitId: flatId,
          unitCode: row.flatCode,
          period: OPENING_AS_OF.slice(0, 7),
          amount: row.amount,
          credited: money(0n),
          allocated: money(0n),
          billingAccountId: row.accountId,
          sourceType: 'opening_balance',
          sourceId: batch.id,
          postingVersion: 1,
          idempotencyKey: key,
          payerPartyId: payer?.partyId ?? '',
          payerName: payer?.partyName ?? '',
        },
      ],
      total: row.amount,
      credited: money(0n),
      allocated: money(0n),
      outstanding: row.amount,
      settlement: 'unpaid',
      overdue: false,
    };
  });
}

export function openingBatchOf(id: string, rows: ReadonlyArray<{ account: string; flat: string; amount: string }>, meta: Pick<OpeningBalanceBatch, 'fileName' | 'importedBy' | 'importedByName' | 'importedAt'>): OpeningBalanceBatch {
  const total = rows.reduce((s, r) => s + toPaisa(r.amount), 0n);
  return {
    id,
    state: 'pending_approval',
    ...meta,
    accounts: new Set(rows.map((r) => r.account)).size,
    total: money(total),
    rows: rows.map((r) => ({ accountId: accountIdOf(r.account), accountNo: r.account, flatCode: r.flat, amount: { amount: fromPaisa(toPaisa(r.amount)), currency: 'PKR' } })),
  };
}

export const ruleVersionOf = (seed: (typeof SEED_RULES)[number], by: { principalId: string; name: string }, at: string): ChargeRule => ({
  id: `${seed.ruleId}_v1`,
  ruleId: seed.ruleId,
  version: 1,
  siteId: ALNOOR_SITE.id,
  category: seed.category,
  scope: seed.scope,
  scopeName: seed.scopeName,
  basis: 'fixed',
  amount: { amount: seed.amount, currency: 'PKR' },
  frequency: 'monthly',
  from: FIRST_PERIOD,
  createdBy: by.principalId,
  createdByName: by.name,
  createdAt: at,
});

export const auditEntry = (
  n: number,
  at: string,
  who: { principalId: string; name: string },
  action: string,
  target: SocietyAuditEntry['target'],
  extra: Partial<SocietyAuditEntry> = {},
): SocietyAuditEntry => ({ id: `aud_anr_${pad(n, 4)}`, at, by: who.principalId, byName: who.name, action, target, ...extra });

/** Setup complete (register, opening balances, charges, A-108 exemption), November not yet billed. */
export function readySociety(): SocietyState {
  const s = emptySociety('ready');
  const rows = alnoorRegister();
  s.register = { rows, fileHashes: [fingerprint(sampleFlatFile().content)], by: manager.principalId, byName: manager.name, at: IMPORTED_AT };
  const model = buildSociety(rows);

  const batch: OpeningBalanceBatch & { fileHash: string } = {
    ...openingBatchOf('obb_anr_0001', OPENING_BALANCES, { fileName: sampleOpeningFile().fileName, importedBy: manager.principalId, importedByName: manager.name, importedAt: '2026-10-16T09:00:00Z' }),
    state: 'approved',
    decidedBy: treasurer.principalId,
    decidedByName: treasurer.name,
    decidedAt: '2026-10-17T11:00:00Z',
    fileHash: fingerprint(sampleOpeningFile().content),
  };
  s.openingBatches = [batch];
  s.invoices = openingInvoices(batch, model.facts, 0, () => nextRef(s, 'opening', OPENING_AS_OF));
  s.rules = SEED_RULES.map((r) => ruleVersionOf(r, { principalId: manager.principalId, name: manager.name }, '2026-10-18T10:00:00Z'));
  s.exemptions = [
    {
      id: 'exm_anr_0001',
      siteId: ALNOOR_SITE.id,
      unitId: flatIdOf(OFFICE_FLAT),
      unitCode: OFFICE_FLAT,
      categories: 'all',
      percent: 100,
      reason: OFFICE_EXEMPTION_REASON,
      from: FIRST_PERIOD,
      state: 'approved',
      requestedBy: manager.principalId,
      requestedByName: manager.name,
      requestedAt: '2026-10-18T10:20:00Z',
      decidedBy: treasurer.principalId,
      decidedByName: treasurer.name,
      decidedAt: '2026-10-19T09:00:00Z',
    },
  ];
  s.audit = [
    auditEntry(1, '2026-10-09T09:30:00Z', manager, 'beneficiaryProposed', { kind: 'beneficiary', id: 'bch_anr_0001', label: ALNOOR_PAYEE.iban }),
    auditEntry(2, '2026-10-09T15:00:00Z', treasurer, 'beneficiaryApproved', { kind: 'beneficiary', id: 'bch_anr_0001', label: ALNOOR_PAYEE.iban }, { values: { effectiveOn: '2026-10-12' } }),
    auditEntry(3, IMPORTED_AT, manager, 'flatsImported', { kind: 'import', id: 'imp_ready', label: sampleFlatFile().fileName }, { values: { count: '80' } }),
    auditEntry(4, '2026-10-16T09:00:00Z', manager, 'openingImported', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts) } }),
    auditEntry(5, '2026-10-17T11:00:00Z', treasurer, 'openingApproved', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts) }, flats: batch.rows.map((r) => r.flatCode) }),
    auditEntry(6, '2026-10-18T10:00:00Z', manager, 'rulesCreated', { kind: 'site', id: ALNOOR_SITE.id, label: ALNOOR_SITE.name }, { values: { count: String(SEED_RULES.length) } }),
    auditEntry(7, '2026-10-18T10:20:00Z', manager, 'exemptionRequested', { kind: 'exemption', id: 'exm_anr_0001', label: OFFICE_FLAT }, { flats: [OFFICE_FLAT] }),
    auditEntry(8, '2026-10-19T09:00:00Z', treasurer, 'exemptionApproved', { kind: 'exemption', id: 'exm_anr_0001', label: OFFICE_FLAT }, { flats: [OFFICE_FLAT] }),
  ];
  s.seq = 8;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Derived views of the state
// ---------------------------------------------------------------------------------------------

export interface SocietyView {
  state: SocietyState;
  model: SocietyModel;
  /** Ownership, occupancy and liability with the approved payer changes applied. */
  facts: FlatFact[];
  /** Invoices as read today: credit notes and payment allocations applied. */
  invoices: CustomerInvoice[];
}

/**
 * Approved liability changes applied in order of their effective date (the date a change starts,
 * not when it was recorded), so a later-dated change never erases an earlier one, and a change for
 * the same date replaces the earlier one. Superseded, withdrawn and pending changes never apply.
 * A change to the person already liable on that date changes nothing (a revocation).
 */
export function withPayerChanges(facts: readonly FlatFact[], changes: readonly LiabilityChange[], people: SocietyModel['people']): FlatFact[] {
  const out = facts.map((f) => ({ ...f }));
  const approved = changes.filter((c) => c.state === 'approved').sort((a, b) => a.from.localeCompare(b.from) || (a.decidedAt ?? '').localeCompare(b.decidedAt ?? ''));
  for (const c of approved) {
    const sample = out.find((f) => f.role === 'payer' && f.flatId === c.flatId);
    if (!sample) continue;
    // Payer periods starting on or after the change date are replaced by it.
    for (let i = out.length - 1; i >= 0; i--) if (out[i]!.role === 'payer' && out[i]!.flatId === c.flatId && out[i]!.from >= c.from) out.splice(i, 1);
    const before = out.find((f) => f.role === 'payer' && f.flatId === c.flatId && f.from < c.from && (f.to === undefined || f.to >= c.from));
    if (before && before.partyId === c.partyId) {
      // Liable already: the period simply continues (no split in history).
      delete before.to;
      continue;
    }
    if (before) before.to = c.from;
    const person = people.find((p) => p.id === c.partyId);
    out.push({ ...sample, id: `fct_payer_${c.id}`, partyId: c.partyId, partyName: person?.displayName ?? c.partyName, from: c.from, to: undefined });
  }
  return out.map((f) => (f.to === undefined ? (({ to: _to, ...rest }) => rest)(f) : f));
}

export function viewOf(state: SocietyState, today: string): SocietyView {
  const model = buildSociety(state.register?.rows ?? []);
  const facts = withPayerChanges(model.facts, state.payerChanges, model.people);
  const allocated = allocatedByLine(state.payments);
  const invoices = state.invoices.map((i) => readInvoice(i, state.creditNotes, today, allocated));
  return { state, model, facts, invoices };
}

/** Unapplied credit per billing account (payments received and not yet settling any line). */
export function creditByAccount(state: SocietyState): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const p of state.payments) {
    const left = toPaisa(p.unapplied.amount);
    if (left > 0n) out.set(p.billingAccountId, (out.get(p.billingAccountId) ?? 0n) + left);
  }
  return out;
}

/** Statement balance per account: open charges less unapplied credit (below zero = in credit). */
export function balances(view: SocietyView): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const i of view.invoices) {
    for (const l of i.lines) {
      const open = toPaisa(l.amount.amount) - toPaisa(l.credited.amount) - toPaisa(l.allocated.amount);
      out.set(l.billingAccountId, (out.get(l.billingAccountId) ?? 0n) + open);
    }
  }
  for (const [account, credit] of creditByAccount(view.state)) out.set(account, (out.get(account) ?? 0n) - credit);
  return out;
}

/** Outstanding per flat (lines carry the flat; unapplied credit belongs to no flat). */
export function flatBalances(view: SocietyView): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const i of view.invoices) {
    for (const l of i.lines) out.set(l.unitId, (out.get(l.unitId) ?? 0n) + toPaisa(l.amount.amount) - toPaisa(l.credited.amount) - toPaisa(l.allocated.amount));
  }
  return out;
}

export const currentFacts = (view: SocietyView, flatId: string, on: string) => view.facts.filter((f) => f.flatId === flatId && factOn(f, on));

/**
 * The verified collection account residents are shown on a date: the issuing entity's verified
 * account whose active period covers the date. A change still in cooling-off is never shown.
 */
export function beneficiaryOn(state: SocietyState, legalEntityId: string, on: string): Beneficiary | null {
  return (
    state.beneficiaries.find((b) => b.legalEntityId === legalEntityId && b.status !== 'pending_verification' && b.verifiedOn !== undefined && b.activeFrom !== undefined && b.activeFrom <= on && (b.activeTo === undefined || on < b.activeTo)) ?? null
  );
}

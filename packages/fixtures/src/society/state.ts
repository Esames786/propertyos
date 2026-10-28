import type {
  BillingRun,
  BillingRunItem,
  ChargeRule,
  CreditNote,
  CustomerInvoice,
  Exemption,
  FlatFact,
  ImportRow,
  Money,
  OpeningBalanceBatch,
  SocietyAuditEntry,
  SocietyDemoMode,
} from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { pad } from '../seed';
import {
  ALNOOR_ENTITY,
  ALNOOR_SITE,
  ALNOOR_STAFF,
  alnoorRegister,
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
import { readInvoice } from './statement';

/**
 * The society's session state (the demo partition's `society` section). Static fixtures stay
 * immutable; everything the building manager and treasurer do in the demo is recorded here and
 * every read derives from it. "fresh" starts before the flat register is imported; "ready" starts
 * with setup complete and November not yet billed.
 */
export type { SocietyAuditEntry };

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

export interface PayerChange {
  id: string;
  flatId: string;
  partyId: string;
  from: string;
  by: string;
  byName: string;
  at: string;
}

export interface SocietyState {
  version: 1;
  mode: SocietyDemoMode;
  register: { rows: FlatRow[]; fileHashes: string[]; by: string; byName: string; at: string } | null;
  imports: Record<string, StoredImport>;
  openingBatches: Array<OpeningBalanceBatch & { fileHash: string }>;
  rules: ChargeRule[];
  exemptions: Exemption[];
  payerChanges: PayerChange[];
  runs: StoredRun[];
  invoices: CustomerInvoice[];
  creditNotes: CreditNote[];
  audit: SocietyAuditEntry[];
  seq: number;
}

export const SOCIETY_SECTION = 'society';

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const { manager, treasurer } = ALNOOR_STAFF;

export function emptySociety(mode: SocietyDemoMode): SocietyState {
  return { version: 1, mode, register: null, imports: {}, openingBatches: [], rules: [], exemptions: [], payerChanges: [], runs: [], invoices: [], creditNotes: [], audit: [], seq: 0 };
}

/** Opening-balance invoices for an approved batch (one per account and flat, dated as of go-live). */
export function openingInvoices(batch: OpeningBalanceBatch, facts: readonly FlatFact[], startAt: number): CustomerInvoice[] {
  return batch.rows.map((row, i) => {
    const n = startAt + i + 1;
    const flatId = flatIdOf(row.flatCode);
    const payer = payerOn(facts, flatId, OPENING_AS_OF);
    const id = `cin_ob_${pad(n, 4)}`;
    const key = fingerprint([ALNOOR_SITE.id, row.accountId, flatId, 'opening', batch.id].join('|'));
    return {
      id,
      ref: `ANR-OB-${pad(n, 4)}`,
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
  s.invoices = openingInvoices(batch, model.facts, 0);
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
  const entry = (n: number, at: string, who: typeof manager | typeof treasurer, action: string, target: SocietyAuditEntry['target'], extra: Partial<SocietyAuditEntry> = {}): SocietyAuditEntry => ({ id: `aud_anr_${pad(n, 4)}`, at, by: who.principalId, byName: who.name, action, target, ...extra });
  s.audit = [
    entry(1, IMPORTED_AT, manager, 'flatsImported', { kind: 'import', id: 'imp_ready', label: sampleFlatFile().fileName }, { values: { count: '80' } }),
    entry(2, '2026-10-16T09:00:00Z', manager, 'openingImported', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts) } }),
    entry(3, '2026-10-17T11:00:00Z', treasurer, 'openingApproved', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts) }, flats: batch.rows.map((r) => r.flatCode) }),
    entry(4, '2026-10-18T10:00:00Z', manager, 'rulesCreated', { kind: 'site', id: ALNOOR_SITE.id, label: ALNOOR_SITE.name }, { values: { count: String(SEED_RULES.length) } }),
    entry(5, '2026-10-18T10:20:00Z', manager, 'exemptionRequested', { kind: 'exemption', id: 'exm_anr_0001', label: OFFICE_FLAT }, { flats: [OFFICE_FLAT] }),
    entry(6, '2026-10-19T09:00:00Z', treasurer, 'exemptionApproved', { kind: 'exemption', id: 'exm_anr_0001', label: OFFICE_FLAT }, { flats: [OFFICE_FLAT] }),
  ];
  s.seq = 6;
  return s;
}

export const initialSociety = (mode: SocietyDemoMode): SocietyState => (mode === 'fresh' ? emptySociety('fresh') : readySociety());

// ---------------------------------------------------------------------------------------------
// Derived views of the state
// ---------------------------------------------------------------------------------------------

export interface SocietyView {
  state: SocietyState;
  model: SocietyModel;
  /** Ownership, occupancy and liability with the session's payer changes applied. */
  facts: FlatFact[];
  invoices: CustomerInvoice[];
}

/** Liability changes from a date: the flat's current payer period ends, the new one starts (I-5). */
export function withPayerChanges(facts: readonly FlatFact[], changes: readonly PayerChange[], people: SocietyModel['people']): FlatFact[] {
  const out = facts.map((f) => ({ ...f }));
  for (const c of [...changes].sort((a, b) => a.at.localeCompare(b.at))) {
    const open = out.filter((f) => f.role === 'payer' && f.flatId === c.flatId && (f.to === undefined || f.to > c.from) && f.from < c.from);
    const sample = out.find((f) => f.role === 'payer' && f.flatId === c.flatId);
    if (!sample) continue;
    for (const f of open) f.to = c.from;
    // A later period starting on or after the change date is replaced by the change.
    for (let i = out.length - 1; i >= 0; i--) if (out[i]!.role === 'payer' && out[i]!.flatId === c.flatId && out[i]!.from >= c.from) out.splice(i, 1);
    const person = people.find((p) => p.id === c.partyId);
    out.push({ ...sample, id: `fct_payer_${c.id}`, partyId: c.partyId, partyName: person?.displayName ?? '', from: c.from, to: undefined });
  }
  return out.map((f) => (f.to === undefined ? (({ to: _to, ...rest }) => rest)(f) : f));
}

export function viewOf(state: SocietyState, today: string): SocietyView {
  const model = buildSociety(state.register?.rows ?? []);
  const facts = withPayerChanges(model.facts, state.payerChanges, model.people);
  const invoices = state.invoices.map((i) => readInvoice(i, state.creditNotes, today));
  return { state, model, facts, invoices };
}

/** Outstanding per account (opening balances and posted invoices less credits). */
export function balances(view: SocietyView): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const i of view.invoices) out.set(i.billingAccountId, (out.get(i.billingAccountId) ?? 0n) + toPaisa(i.outstanding.amount));
  return out;
}

/** Outstanding per flat (lines carry the flat). */
export function flatBalances(view: SocietyView): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const i of view.invoices) {
    for (const l of i.lines) out.set(l.unitId, (out.get(l.unitId) ?? 0n) + toPaisa(l.amount.amount) - toPaisa(l.credited.amount));
  }
  return out;
}

export const currentFacts = (view: SocietyView, flatId: string, on: string) => view.facts.filter((f) => f.flatId === flatId && factOn(f, on));

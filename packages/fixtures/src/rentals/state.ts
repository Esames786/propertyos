import type { DepositHolding, IssuingModel, LeaseState, Money, PayoutState, RentEvent, StatementBody } from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import { pkt } from '../hr/state';
import { pad } from '../seed';
import { directoryTenant } from '../tenant-directory';

/**
 * Gate S.3 rentals records of an organisation (one state per tenant, in its demo partition). Seeds are
 * deterministic and fictional, for Riverbend Estate Managers (Demo) only; any other organisation starts
 * with its sites and nothing else. Nothing here is a real person, property, account or amount.
 *
 * Riverbend runs lettings for four fictional owners on two licensed sites. Tahira Rehman (agent model)
 * has a flat at each site, so her agreement, statements and payouts span both; Mirza Family Properties
 * (Demo) uses the principal model; Farhan Saeed (agent) has a flat of his own and, since September, a
 * flat shared with Nida Saeed, whose agreement is still an unsigned draft. Leases began before the
 * rentals add-on was licensed (1 September 2026) and were migrated; a new joint lease is waiting for
 * activation. The September and October rent rolls are approved demands (never invoices); November's is
 * not prepared. Nothing has been settled: no evidence path exists in this gate.
 */
// 1: Gate S.3.
export const RENT_STATE_VERSION = 1;
export const RENT_SECTION = 'rentals';

export interface StoredSite {
  id: string;
  name: string;
  code: string;
  legalEntityId: string;
  legalEntityName: string;
}

export interface StoredUnit {
  id: string;
  code: string;
  siteId: string;
  kind: 'flat' | 'plot';
}

export interface StoredOwner {
  id: string;
  ref: string;
  name: string;
  kind: 'individual' | 'company';
  /** The person who signs in for the owner (a landlord's own party, or a company's authorised person). */
  partyId: string;
  /** Their customer-app principal, when they have one (a conflicted member of staff is refused on it). */
  principalId?: string;
  /** Principal model: the owner's own client legal entity. */
  entity?: { id: string; name: string };
  /** Where an owner payout would go (fictional; masked to the last four characters). */
  beneficiary: { bankName: string; last4: string; verified: boolean };
}

/** Who owns a unit, by share, effective-dated: from ≤ day < to. */
export interface StoredOwnership {
  unitId: string;
  ownerId: string;
  share: string;
  from: string;
  to?: string;
}

export interface StoredPerson {
  partyId: string;
  ref: string;
  name: string;
}

export interface StoredAgreementVersion {
  n: number;
  effectiveFrom: string;
  model: IssuingModel;
  /** The fictional signed agreement on file; a version without it can never be approved. */
  signed: { reference: string; date: string } | null;
  /** Agent model: the owner authorised the manager to collect on their behalf. */
  collectOnBehalf: boolean;
  feePct: string;
  depositHolding: DepositHolding;
  depositMaxMonths: number;
  account: { kind: 'client_money' | 'owner_account'; label: string; last4: string; verified: boolean };
  subLedger?: string;
  approved: boolean;
  draftedBy: string;
  draftedByName: string;
  draftedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  note?: string;
}

export interface StoredAgreement {
  id: string;
  ref: string;
  ownerId: string;
  versions: StoredAgreementVersion[];
  history: RentEvent[];
}

export interface StoredLeaseVersion {
  n: number;
  from: string;
  to: string;
  rent: Money;
  dueDay: number;
  reason: 'created' | 'renewed';
  by: string;
  byName: string;
  at: string;
  /** The agreement version of each landlord the version is bound to (never rewritten later). */
  agreements: Array<{ agreementId: string; version: number }>;
}

export interface StoredLease {
  id: string;
  ref: string;
  unitId: string;
  siteId: string;
  state: LeaseState;
  landlords: Array<{ ownerId: string; share: string }>;
  tenant: { partyId: string; name: string };
  model: IssuingModel;
  deposit: Money;
  versions: StoredLeaseVersion[];
  authority?: { reference: string; date: string; by: string; recordedByName: string; at: string };
  termination?: { date: string; reason: string; byName: string; at: string };
  draftedBy: string;
  draftedByName: string;
  draftedAt: string;
  submittedBy?: string;
  submittedByName?: string;
  activatedBy?: string;
  activatedByName?: string;
  activatedAt?: string;
  /** The lease's own payer account (kind lease), created on activation. */
  billingAccount?: { id: string; ref: string };
  history: RentEvent[];
}

/** An owner expense the owner approved in writing; paying it needs evidence (none exists here). */
export interface StoredExpense {
  id: string;
  ref: string;
  ownerId: string;
  unitId: string;
  siteId: string;
  text: string;
  amount: Money;
  approvedOn: string;
  ownerApproval: string;
}

export interface StoredRollLine {
  key: string;
  leaseId: string;
  amount: Money;
  dueDate: string;
  leaseVersion: number;
}

export interface StoredRoll {
  period: string;
  state: 'draft' | 'approved';
  version: number;
  lines: StoredRollLine[];
  fingerprint: string;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  /** Everyone who previewed it: none of them may approve it. */
  makers: string[];
  makerNames: string[];
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNote?: string;
  history: RentEvent[];
}

export interface StoredStatement {
  id: string;
  ref: string;
  ownerId: string;
  period: string;
  /** The whole-owner snapshot frozen on issue (readers with fewer sites get it filtered). */
  body: StatementBody;
  /** The opening payable of each site (so a reader with fewer sites gets totals over theirs only). */
  openingBySite: Record<string, string>;
  issuedBy: string;
  issuedByName: string;
  issuedAt: string;
  history: RentEvent[];
}

export interface StoredPayout {
  id: string;
  ref: string;
  ownerId: string;
  amount: Money;
  beneficiary: { bankName: string; last4: string; verified: boolean };
  note: string;
  state: PayoutState;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  rejectReason?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: RentEvent[];
}

/**
 * A settlement bound to evidence (a matched statement line on a verified client-money account, from
 * the S.1/C.2 reconciler). **No route writes these in this gate**: the reconciler has no lease or payout
 * subject, so the list stays empty and every settled-basis figure is 0.00.
 */
export interface SettledEvent {
  id: string;
  kind: 'rent' | 'expense' | 'payout';
  ownerId: string;
  siteId: string;
  period: string;
  amount: Money;
  sourceRef: string;
}

/** Issue #16: an idempotency entry binds the operation, the principal, the target and the request. */
export interface IdemEntry {
  op: string;
  principal: string;
  target: string;
  fp: string;
  id: string;
}

export interface RentalsState {
  version: typeof RENT_STATE_VERSION;
  counters: Record<string, number>;
  sites: StoredSite[];
  units: StoredUnit[];
  owners: StoredOwner[];
  ownerships: StoredOwnership[];
  people: StoredPerson[];
  agreements: StoredAgreement[];
  leases: StoredLease[];
  expenses: StoredExpense[];
  rolls: StoredRoll[];
  statements: StoredStatement[];
  payouts: StoredPayout[];
  settled: SettledEvent[];
  idempotency: Record<string, IdemEntry>;
}

const PREFIX = { lease: ['lse', 'LS'], account: ['ba_lease', 'LA'], statement: ['ost', 'OS'], payout: ['opi', 'PO'], agreement: ['agr', 'MA'] } as const;

/** Next id and reference of a kind ("lse_rb_0007", "RB-LS-0007"). */
export function nextRent(state: RentalsState, kind: keyof typeof PREFIX): { id: string; ref: string } {
  const seq = (state.counters[kind] ?? 0) + 1;
  state.counters[kind] = seq;
  const [prefix, ref] = PREFIX[kind];
  return { id: `${prefix}_rb_${pad(seq, 4)}`, ref: `RB-${ref}-${pad(seq, 4)}` };
}

export const PKR = (amount: string): Money => ({ amount, currency: 'PKR' });
export const ev = (who: { by: string; byName: string }, at: string, action: string, extra: Partial<RentEvent> = {}): RentEvent => ({ at, by: who.by, byName: who.byName, action, ...extra });

export const FAISAL = { by: 'usr_rb_0001', byName: 'Faisal Butt' };
export const SADIA = { by: 'usr_rb_0002', byName: 'Sadia Rauf' };
export const NAILA = { by: 'usr_rb_0003', byName: 'Naila Haider' };
export const USMAN = { by: 'usr_rb_0004', byName: 'Usman Ghani' };

export const RENTALS_LICENSED = '2026-09-01';
const DEMO_BANK = 'Demo Bank (fictional)';
const CLIENT_ACCOUNT = { kind: 'client_money' as const, label: 'Riverbend client money account (Demo)', last4: '4410', verified: true };

export const emptyRentals = (sites: StoredSite[] = []): RentalsState => ({
  version: RENT_STATE_VERSION,
  counters: {},
  sites,
  units: [],
  owners: [],
  ownerships: [],
  people: [],
  agreements: [],
  leases: [],
  expenses: [],
  rolls: [],
  statements: [],
  payouts: [],
  settled: [],
  idempotency: {},
});

/** The organisation's sites (from its licence directory); rentals may be licensed on some of them. */
function sitesOf(tenantId: string): StoredSite[] {
  const t = directoryTenant(tenantId);
  if (!t) return [];
  const le = tenantId === 'tnt_riverbend' ? 'le_riverbend' : `le_${tenantId.replace(/^tnt_/, '')}`;
  return t.sites.map((s) => ({ id: s.id, name: s.name, code: s.id.replace(/^site_/, '').toUpperCase(), legalEntityId: le, legalEntityName: t.legalName }));
}

/** Created on first use; seeded for Riverbend only (`after` adds the records worked out from the seed). */
export function rentalsState(ctx: HandlerContext, after?: (state: RentalsState) => void): RentalsState {
  const make = () => {
    const s = emptyRentals(sitesOf(ctx.tenantId ?? ''));
    if (ctx.tenantId === 'tnt_riverbend') {
      seedRiverbend(s);
      after?.(s);
    }
    return s;
  };
  const state = ctx.demo.section<RentalsState>(RENT_SECTION, make);
  if (state.version !== RENT_STATE_VERSION) Object.assign(state, make());
  return state;
}

const unit = (code: string, siteId: string, kind: 'flat' | 'plot' = 'flat'): StoredUnit => ({ id: `unt_rb_${code.replace('-', '').toLowerCase()}`, code, siteId, kind });

function migrated(at: string): RentEvent {
  return ev(USMAN, at, 'lease_migrated', { note: 'Migrated from the manager’s previous lettings register (fictional).' });
}

export function seedRiverbend(s: RentalsState): void {
  s.units.push(
    unit('H-1204', 'site_rb_heights'),
    unit('H-0802', 'site_rb_heights'),
    unit('H-0507', 'site_rb_heights'),
    unit('H-0310', 'site_rb_heights'),
    unit('C-07', 'site_rb_court'),
    unit('C-11', 'site_rb_court'),
    unit('C-12', 'site_rb_court'),
    unit('C-03', 'site_rb_court'),
    unit('V-14', 'site_rb_villas', 'plot'),
  );
  s.owners.push(
    { id: 'own_rb_tahira', ref: 'RB-OW-001', name: 'Tahira Rehman', kind: 'individual', partyId: 'pty_rb_0001', principalId: 'usr_rb_c0001', beneficiary: { bankName: DEMO_BANK, last4: '3301', verified: true } },
    { id: 'own_rb_mirza', ref: 'RB-OW-002', name: 'Mirza Family Properties (Demo)', kind: 'company', partyId: 'pty_rb_0002', principalId: 'usr_rb_c0002', entity: { id: 'le_rb_mirza', name: 'Mirza Family Properties (Pvt) Ltd (Demo)' }, beneficiary: { bankName: DEMO_BANK, last4: '7781', verified: true } },
    { id: 'own_rb_farhan', ref: 'RB-OW-003', name: 'Farhan Saeed', kind: 'individual', partyId: 'pty_rb_0003', beneficiary: { bankName: DEMO_BANK, last4: '5520', verified: true } },
    { id: 'own_rb_nida', ref: 'RB-OW-004', name: 'Nida Saeed', kind: 'individual', partyId: 'pty_rb_0004', beneficiary: { bankName: DEMO_BANK, last4: '6614', verified: false } },
    { id: 'own_rb_zafar', ref: 'RB-OW-005', name: 'Zafar Iqbal', kind: 'individual', partyId: 'pty_rb_0005', beneficiary: { bankName: DEMO_BANK, last4: '9032', verified: false } },
    { id: 'own_rb_aamir', ref: 'RB-OW-006', name: 'Aamir Javed', kind: 'individual', partyId: 'pty_rb_0006', beneficiary: { bankName: DEMO_BANK, last4: '1187', verified: false } },
  );
  s.ownerships.push(
    { unitId: 'unt_rb_h1204', ownerId: 'own_rb_tahira', share: '100.00', from: '2024-01-10' },
    { unitId: 'unt_rb_h0802', ownerId: 'own_rb_farhan', share: '100.00', from: '2022-02-01', to: '2026-09-15' },
    { unitId: 'unt_rb_h0802', ownerId: 'own_rb_farhan', share: '50.00', from: '2026-09-15' },
    { unitId: 'unt_rb_h0802', ownerId: 'own_rb_nida', share: '50.00', from: '2026-09-15' },
    { unitId: 'unt_rb_h0507', ownerId: 'own_rb_farhan', share: '100.00', from: '2023-07-01' },
    { unitId: 'unt_rb_h0310', ownerId: 'own_rb_zafar', share: '100.00', from: '2020-01-01' },
    { unitId: 'unt_rb_c07', ownerId: 'own_rb_tahira', share: '100.00', from: '2023-05-01' },
    { unitId: 'unt_rb_c11', ownerId: 'own_rb_mirza', share: '100.00', from: '2025-11-01' },
    { unitId: 'unt_rb_c12', ownerId: 'own_rb_mirza', share: '100.00', from: '2025-11-01' },
    { unitId: 'unt_rb_c03', ownerId: 'own_rb_tahira', share: '100.00', from: '2021-03-01', to: '2026-07-01' },
    { unitId: 'unt_rb_c03', ownerId: 'own_rb_aamir', share: '100.00', from: '2026-07-01' },
    { unitId: 'unt_rb_v14', ownerId: 'own_rb_tahira', share: '100.00', from: '2022-08-01' },
  );
  s.people.push(
    { partyId: 'pty_rb_0010', ref: 'RB-P-0010', name: 'Adeel Shah' },
    { partyId: 'pty_rb_0011', ref: 'RB-P-0011', name: 'Mehwish Kamal' },
    { partyId: 'pty_rb_0012', ref: 'RB-P-0012', name: 'Rizwan Ali' },
    { partyId: 'pty_rb_0013', ref: 'RB-P-0013', name: 'Sadia Noor' },
    { partyId: 'pty_rb_0014', ref: 'RB-P-0014', name: 'Usama Khalid' },
    { partyId: 'pty_rb_0015', ref: 'RB-P-0015', name: 'Bushra Naz' },
    { partyId: 'pty_rb_0016', ref: 'RB-P-0016', name: 'Hamid Raza' },
    { partyId: 'pty_rb_0017', ref: 'RB-P-0017', name: 'Laila Ahmed' },
  );

  const agentVersion = (subLedger: string, effectiveFrom: string, reference: string, signedOn: string, feePct: string, at: string): StoredAgreementVersion => ({
    n: 1,
    effectiveFrom,
    model: 'agent',
    signed: { reference, date: signedOn },
    collectOnBehalf: true,
    feePct,
    depositHolding: 'client_deposit_account',
    depositMaxMonths: 2,
    account: CLIENT_ACCOUNT,
    subLedger,
    approved: true,
    draftedBy: FAISAL.by,
    draftedByName: FAISAL.byName,
    draftedAt: at,
    approvedBy: NAILA.by,
    approvedByName: NAILA.byName,
    approvedAt: at,
  });
  const agreementMigrated = (at: string) => ev(FAISAL, at, 'agreement_migrated', { note: 'Signed agreement carried over from the manager’s records (fictional).' });
  s.agreements.push(
    {
      id: 'agr_rb_0001',
      ref: 'RB-MA-0001',
      ownerId: 'own_rb_tahira',
      versions: [
        agentVersion('OSL-0001', '2023-05-01', 'RB-MA-2023-014 (fictional)', '2023-04-20', '8.00', pkt(RENTALS_LICENSED, '09:00')),
        {
          ...agentVersion('OSL-0001', '2026-12-01', 'RB-MA-2026-041 (fictional)', '2026-10-14', '7.50', pkt('2026-10-15', '11:20')),
          n: 2,
          draftedAt: pkt('2026-10-14', '16:05'),
          approvedAt: pkt('2026-10-15', '11:20'),
          note: 'Renegotiated fee from December 2026 (fictional).',
        },
      ],
      history: [agreementMigrated(pkt(RENTALS_LICENSED, '09:00')), ev(FAISAL, pkt('2026-10-14', '16:05'), 'version_drafted', { values: { version: '2' } }), ev(NAILA, pkt('2026-10-15', '11:20'), 'version_approved', { values: { version: '2' } })],
    },
    {
      id: 'agr_rb_0002',
      ref: 'RB-MA-0002',
      ownerId: 'own_rb_mirza',
      versions: [
        {
          n: 1,
          effectiveFrom: '2025-11-01',
          model: 'principal',
          signed: { reference: 'RB-MA-2025-031 (fictional)', date: '2025-10-22' },
          collectOnBehalf: false,
          feePct: '5.00',
          depositHolding: 'owner_account',
          depositMaxMonths: 2,
          account: { kind: 'owner_account', label: 'Mirza Family Properties (Demo) — own account', last4: '7781', verified: true },
          approved: true,
          draftedBy: FAISAL.by,
          draftedByName: FAISAL.byName,
          draftedAt: pkt(RENTALS_LICENSED, '09:05'),
          approvedBy: NAILA.by,
          approvedByName: NAILA.byName,
          approvedAt: pkt(RENTALS_LICENSED, '09:05'),
        },
      ],
      history: [agreementMigrated(pkt(RENTALS_LICENSED, '09:05'))],
    },
    {
      id: 'agr_rb_0003',
      ref: 'RB-MA-0003',
      ownerId: 'own_rb_farhan',
      versions: [agentVersion('OSL-0003', '2022-02-01', 'RB-MA-2022-006 (fictional)', '2022-01-18', '8.00', pkt(RENTALS_LICENSED, '09:10'))],
      history: [agreementMigrated(pkt(RENTALS_LICENSED, '09:10'))],
    },
    {
      id: 'agr_rb_0004',
      ref: 'RB-MA-0004',
      ownerId: 'own_rb_nida',
      versions: [
        {
          ...agentVersion('OSL-0004', '2026-11-01', '', '', '8.00', pkt('2026-10-20', '15:40')),
          signed: null,
          approved: false,
          approvedBy: undefined,
          approvedByName: undefined,
          approvedAt: undefined,
          note: 'Waiting for Nida Saeed’s signature (fictional).',
        },
      ],
      history: [ev(FAISAL, pkt('2026-10-20', '15:40'), 'version_drafted', { values: { version: '1' } })],
    },
  );
  s.counters.agreement = 4;

  const version = (n: number, from: string, to: string, rent: string, dueDay: number, agreements: StoredLeaseVersion['agreements'], who: { by: string; byName: string }, at: string, reason: 'created' | 'renewed' = 'created'): StoredLeaseVersion => ({
    n, from, to, rent: PKR(rent), dueDay, reason, by: who.by, byName: who.byName, at, agreements,
  });
  const lic = pkt(RENTALS_LICENSED, '10:00');
  const account = (n: number) => ({ id: `ba_lease_rb_${pad(n, 4)}`, ref: `RB-LA-${pad(n, 4)}` });
  const migratedLease = (n: number, unitCode: string, siteId: string, landlords: StoredLease['landlords'], tenant: StoredLease['tenant'], model: IssuingModel, deposit: string, versions: StoredLeaseVersion[], authority: string, state: LeaseState = 'active'): StoredLease => ({
    id: `lse_rb_${pad(n, 4)}`,
    ref: `RB-LS-${pad(n, 4)}`,
    unitId: `unt_rb_${unitCode.replace('-', '').toLowerCase()}`,
    siteId,
    state,
    landlords,
    tenant,
    model,
    deposit: PKR(deposit),
    versions,
    authority: { reference: authority, date: versions[0]!.from, by: USMAN.by, recordedByName: USMAN.byName, at: lic },
    draftedBy: USMAN.by,
    draftedByName: USMAN.byName,
    draftedAt: lic,
    activatedBy: USMAN.by,
    activatedByName: USMAN.byName,
    activatedAt: lic,
    billingAccount: account(n),
    history: [migrated(lic)],
  });
  s.leases.push(
    migratedLease(1, 'H-1204', 'site_rb_heights', [{ ownerId: 'own_rb_tahira', share: '100.00' }], { partyId: 'pty_rb_0010', name: 'Adeel Shah' }, 'agent', '170000.00', [version(1, '2026-03-01', '2027-02-28', '85000.00', 5, [{ agreementId: 'agr_rb_0001', version: 1 }], USMAN, lic)], 'TR-AUTH-2026-02 (fictional)'),
    migratedLease(2, 'C-07', 'site_rb_court', [{ ownerId: 'own_rb_tahira', share: '100.00' }], { partyId: 'pty_rb_0011', name: 'Mehwish Kamal' }, 'agent', '124000.00', [version(1, '2025-12-16', '2026-12-15', '62000.00', 1, [{ agreementId: 'agr_rb_0001', version: 1 }], USMAN, lic)], 'TR-AUTH-2025-11 (fictional)'),
    migratedLease(3, 'C-11', 'site_rb_court', [{ ownerId: 'own_rb_mirza', share: '100.00' }], { partyId: 'pty_rb_0012', name: 'Rizwan Ali' }, 'principal', '116000.00', [version(1, '2026-01-01', '2027-06-30', '58000.00', 1, [{ agreementId: 'agr_rb_0002', version: 1 }], USMAN, lic)], 'MFP-AUTH-2025-12 (fictional)'),
    migratedLease(4, 'H-0802', 'site_rb_heights', [{ ownerId: 'own_rb_farhan', share: '100.00' }], { partyId: 'pty_rb_0014', name: 'Usama Khalid' }, 'agent', '140000.00', [version(1, '2025-09-01', '2026-08-31', '70000.00', 5, [{ agreementId: 'agr_rb_0003', version: 1 }], USMAN, lic)], 'FS-AUTH-2025-08 (fictional)', 'ended'),
  );
  // H-0507: renewed in April 2026 at a higher rent (two versions; the first stays as it was).
  s.leases.push({
    ...migratedLease(6, 'H-0507', 'site_rb_heights', [{ ownerId: 'own_rb_farhan', share: '100.00' }], { partyId: 'pty_rb_0015', name: 'Bushra Naz' }, 'agent', '136000.00', [
      version(1, '2025-05-01', '2026-04-30', '65000.00', 1, [{ agreementId: 'agr_rb_0003', version: 1 }], USMAN, lic),
      version(2, '2026-05-01', '2027-04-30', '68000.00', 1, [{ agreementId: 'agr_rb_0003', version: 1 }], USMAN, lic, 'renewed'),
    ], 'FS-AUTH-2025-04 (fictional)'),
  });
  // H-0802, shared since 15 September: a new lease drafted by the portfolio manager and submitted for
  // activation. It cannot be activated until Nida Saeed's agreement is signed and approved.
  s.leases.push({
    id: 'lse_rb_0005',
    ref: 'RB-LS-0005',
    unitId: 'unt_rb_h0802',
    siteId: 'site_rb_heights',
    state: 'review',
    landlords: [
      { ownerId: 'own_rb_farhan', share: '50.00' },
      { ownerId: 'own_rb_nida', share: '50.00' },
    ],
    tenant: { partyId: 'pty_rb_0013', name: 'Sadia Noor' },
    model: 'agent',
    deposit: PKR('144000.00'),
    versions: [version(1, '2026-11-15', '2027-11-14', '72000.00', 5, [{ agreementId: 'agr_rb_0003', version: 1 }, { agreementId: 'agr_rb_0004', version: 1 }], SADIA, pkt('2026-10-21', '10:15'))],
    authority: { reference: 'FS-NS-AUTH-2026-10 (fictional)', date: '2026-10-19', by: SADIA.by, recordedByName: SADIA.byName, at: pkt('2026-10-21', '10:15') },
    draftedBy: SADIA.by,
    draftedByName: SADIA.byName,
    draftedAt: pkt('2026-10-21', '10:15'),
    submittedBy: SADIA.by,
    submittedByName: SADIA.byName,
    history: [ev(SADIA, pkt('2026-10-21', '10:15'), 'lease_drafted'), ev(SADIA, pkt('2026-10-21', '10:40'), 'lease_submitted')],
  });
  s.counters.lease = 6;
  s.counters.account = 6;

  s.expenses.push(
    { id: 'oex_rb_0001', ref: 'RB-OX-0001', ownerId: 'own_rb_tahira', unitId: 'unt_rb_h1204', siteId: 'site_rb_heights', text: 'Water heater replacement, H-1204 (fictional quotation)', amount: PKR('18500.00'), approvedOn: '2026-10-12', ownerApproval: 'Owner e-mail approval TR-EX-2026-10 (fictional)' },
    { id: 'oex_rb_0002', ref: 'RB-OX-0002', ownerId: 'own_rb_farhan', unitId: 'unt_rb_h0802', siteId: 'site_rb_heights', text: 'Repainting after the tenancy ended, H-0802 (fictional quotation)', amount: PKR('32000.00'), approvedOn: '2026-09-05', ownerApproval: 'Owner letter FS-EX-2026-09 (fictional)' },
  );

  // The September and October rolls: approved demands, prepared by the accounts officer and approved by
  // the finance controller. Never posted (no lease subject in the shared invoice engine).
  const rollLines = (period: string) =>
    [
      { id: 'lse_rb_0001', rent: '85000.00', day: 5, v: 1 },
      { id: 'lse_rb_0002', rent: '62000.00', day: 1, v: 1 },
      { id: 'lse_rb_0003', rent: '58000.00', day: 1, v: 1 },
      { id: 'lse_rb_0006', rent: '68000.00', day: 1, v: 2 },
    ].map((l) => ({ key: `${l.id}:${period}:v${l.v}`, leaseId: l.id, amount: PKR(l.rent), dueDate: `${period}-${pad(l.day, 2)}`, leaseVersion: l.v }));
  const roll = (period: string, prepared: string, approved: string): StoredRoll => {
    const lines = rollLines(period);
    return {
      period,
      state: 'approved',
      version: 1,
      lines,
      fingerprint: lines.map((l) => `${l.key}=${l.amount.amount}@${l.dueDate}`).join('|'),
      preparedBy: USMAN.by,
      preparedByName: USMAN.byName,
      preparedAt: prepared,
      makers: [USMAN.by],
      makerNames: [USMAN.byName],
      approvedBy: NAILA.by,
      approvedByName: NAILA.byName,
      approvedAt: approved,
      history: [ev(USMAN, prepared, 'roll_previewed', { values: { version: '1', total: '273000.00' } }), ev(NAILA, approved, 'roll_approved', { values: { version: '1', total: '273000.00' } })],
    };
  };
  s.rolls.push(roll('2026-09', pkt('2026-09-02', '10:30'), pkt('2026-09-03', '12:10')), roll('2026-10', pkt('2026-09-25', '11:00'), pkt('2026-09-27', '15:45')));
}

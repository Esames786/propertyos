import { decide, type AgreementVersionState, type AgreementVersionView, type AgreementView, type IssuingModel, type LeaseAgreementRef, type LeaseBlocker, type LeaseIssuing, type LeaseState, type LeaseSummary, type LeaseView, type Money, type OwnerStatementView, type PayoutHold, type PayoutView, type Permission, type RentEvent, type RentRollView, type RollLineView, type RollState, type StatementBody, type StatementLineView } from '@repo/contracts';
import { POSTING_NEEDS } from '@repo/contracts';
import { authorize, can, notFound, permits, type HandlerContext } from '../handler-types';
import { seesBankFeed } from '../society/finance/bank-scope';
import { problem, stamp } from '../society/handlers';
import { addDays, availableToInstruct, basisPoints, firstDay, isDate, lastDay, ledger, monthOf, money, nextMonth, overlaps, paisa, rentKey, schedule, shareOf, sharesValid, sum, ZERO } from './rules';
import { RENTALS_LICENSED, rentalsState, type RentalsState, type StoredAgreement, type StoredAgreementVersion, type StoredLease, type StoredOwner, type StoredPayout, type StoredRoll, type StoredRollLine, type StoredStatement } from './state';

/**
 * Gate S.3 read models and the request context. Every office endpoint needs the office app, the
 * `rentals` add-on and a rentals permission (the transport checks both first).
 *
 * **Scope.** The rentals sites a person may see are the organisation's sites where the shared access
 * rule (`decide`) allows a `rentals` record of that site and its legal entity: the licence for the site
 * and the person's data scope, today. It is worked out on every request, so a withdrawn grant or a
 * narrowed scope applies at once. Then:
 * - a lease, its schedule, versions and history follow its unit's site;
 * - an **owner** (their agreement, statements and payouts) spans the sites of their units; seeing it
 *   needs one of them, and **acting** on it needs every one (`ownerWhole`). A reader with some of the
 *   sites sees only those sites' lines, with totals over them, and a scope-limited flag (never a count
 *   or an amount of what is hidden): nested history, issued snapshots and payout amounts included;
 * - a **rent roll** covers every licensed rentals site: acting on it needs all of them.
 * Anything else is "not found", exactly like an id never issued.
 */

export interface R {
  ctx: HandlerContext;
  st: RentalsState;
  /** The rentals sites the person may see. */
  scope: Set<string>;
  /** The organisation's sites where rentals is licensed today (whatever the person's scope). */
  rentalSites: string[];
  today: string;
  now: string;
  me: { principalId: string; name: string };
}

const licensedSite = (ctx: HandlerContext, siteId: string) => !!ctx.access && decide(ctx.access, { module: 'rentals', siteId, at: ctx.at, suspension: ctx.suspension }).allowed;

export function rentOf(ctx: HandlerContext): R {
  if (ctx.persona?.app !== 'backoffice') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const st = rentalsState(ctx, seedIssued);
  const visible = st.sites.filter((s) => permits(ctx, 'rentals', { siteId: s.id, legalEntityId: s.legalEntityId }));
  if (!visible.length) {
    // The shared rule's own refusal for the organisation's first site; anything else is "not found".
    const first = st.sites[0];
    if (first) authorize(ctx, 'rentals', { siteId: first.id, legalEntityId: first.legalEntityId });
    notFound(ctx);
  }
  return {
    ctx,
    st,
    scope: new Set(visible.map((s) => s.id)),
    rentalSites: st.sites.filter((s) => licensedSite(ctx, s.id)).map((s) => s.id),
    today: ctx.at,
    now: stamp(ctx),
    me: { principalId: ctx.persona!.principalId, name: ctx.persona!.displayName },
  };
}

export const holds = (r: R, permission: Permission) => can(r.ctx, permission);
export const ownerPayoutsLicensed = (r: R) => !!r.ctx.access?.features.includes('rentals.owner_payouts');

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export const siteName = (st: RentalsState, id: string) => st.sites.find((s) => s.id === id)?.name ?? '';
export const unitOf = (st: RentalsState, id: string) => st.units.find((u) => u.id === id);
export const ownerOf = (st: RentalsState, id: string) => st.owners.find((o) => o.id === id);
export const agreementOf = (st: RentalsState, ownerId: string) => st.agreements.find((a) => a.ownerId === ownerId);
const inForce = (o: { from: string; to?: string }, on: string) => o.from <= on && (o.to === undefined || on < o.to);
export const ownershipsOn = (st: RentalsState, unitId: string, on: string) => st.ownerships.filter((o) => o.unitId === unitId && inForce(o, on));

export const leaseEnd = (l: StoredLease) => l.termination?.date ?? l.versions.at(-1)!.to;
export const leaseStart = (l: StoredLease) => l.versions[0]!.from;

/** The lease's state today: an active lease past its end has ended (or was terminated early). */
export function leaseState(l: StoredLease, today: string): LeaseState {
  if (l.state === 'active' && leaseEnd(l) < today) return l.termination ? 'terminated' : 'ended';
  return l.state;
}
export const isEnding = (l: StoredLease, today: string) => leaseState(l, today) === 'active' && leaseEnd(l) <= addDays(today, 60);
/** Leases that carry rent (never a draft, a proposal or a cancelled one). */
export const isLet = (l: StoredLease, today: string) => ['active', 'ended', 'terminated'].includes(leaseState(l, today));

export const leaseVisible = (r: R, l: StoredLease) => r.scope.has(l.siteId);

/** The sites of an owner's units at rentals sites (their agreement, statements and payouts span them). */
export function ownerSites(r: R, ownerId: string): string[] {
  const units = new Set(r.st.ownerships.filter((o) => o.ownerId === ownerId).map((o) => o.unitId));
  for (const l of r.st.leases) if (l.landlords.some((x) => x.ownerId === ownerId)) units.add(l.unitId);
  return [...new Set([...units].map((u) => unitOf(r.st, u)?.siteId).filter((s): s is string => !!s && r.rentalSites.includes(s)))];
}
export const ownerVisible = (r: R, ownerId: string) => ownerSites(r, ownerId).some((s) => r.scope.has(s));
/**
 * Every site of the owner is in the person's scope: the sites of their units at rentals sites and
 * (Issue #17) every site their rentals records touch, licensed today or not. With a site whose rentals
 * grant was withdrawn, nobody holds the whole owner: owner-wide figures and actions fail closed.
 */
export const ownerWhole = (r: R, ownerId: string) => {
  const sites = ownerSites(r, ownerId);
  return sites.length > 0 && sites.every((s) => r.scope.has(s)) && ownerFootprint(r.st, ownerId).every((s) => r.scope.has(s));
};

/**
 * Issue #17 (P0): every site an owner's rentals records touch, whether or not rentals is licensed there
 * today: the leases they let, their approved expenses, settlement events and issued statements. (A unit
 * owned with no rentals record carries no rentals money.) Owner-wide figures (payout instructions, the
 * owner-wide opening, a whole statement) are for a reader who may see every one of these sites.
 */
export function ownerFootprint(st: RentalsState, ownerId: string): string[] {
  const sites = new Set<string>();
  for (const l of st.leases) if (l.landlords.some((x) => x.ownerId === ownerId)) sites.add(l.siteId);
  for (const x of st.expenses) if (x.ownerId === ownerId) sites.add(x.siteId);
  for (const e of st.settled) if (e.ownerId === ownerId) sites.add(e.siteId);
  for (const s of st.statements) if (s.ownerId === ownerId) for (const id of statementSites(s.body, s.openingBySite)) sites.add(id);
  sites.delete('');
  return [...sites];
}

/** The sites a statement's records come from (an owner-wide line or opening carries no site). */
export const statementSites = (body: StatementBody, openingBySite: Record<string, string>): string[] => [...new Set([...Object.keys(openingBySite), ...body.lines.map((l) => l.siteId)])].filter((s) => s !== '');
/** Every licensed rentals site of the organisation is in the person's scope (a rent roll spans them). */
export const tenantWhole = (r: R) => r.rentalSites.length > 0 && r.rentalSites.every((s) => r.scope.has(s));

// ---------------------------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------------------------

/** The approved version in force on a day (the latest approved one starting on or before it). */
export const versionOn = (a: StoredAgreement | undefined, on: string) =>
  a?.versions.filter((v) => v.approved && v.effectiveFrom <= on).sort((x, y) => y.effectiveFrom.localeCompare(x.effectiveFrom) || y.n - x.n)[0];
export const draftOf = (a: StoredAgreement | undefined) => a?.versions.find((v) => !v.approved);

export function versionState(a: StoredAgreement, v: StoredAgreementVersion, today: string): AgreementVersionState {
  if (!v.approved) return 'draft';
  if (v.effectiveFrom > today) return 'scheduled';
  return versionOn(a, today)?.n === v.n ? 'active' : 'superseded';
}

/** Who issues under a version: the manager as agent, or the owner's own client legal entity. */
export function issuingEntity(r: R, owner: StoredOwner, v: Pick<StoredAgreementVersion, 'model'>): string {
  if (v.model === 'principal') return owner.entity?.name ?? owner.name;
  return r.st.sites[0]?.legalEntityName ?? '';
}

// ---------------------------------------------------------------------------------------------
// Leases (RNT-001, RNT-002)
// ---------------------------------------------------------------------------------------------

/** The agreement version a lease version is bound to for one landlord (bound on drafting or renewal). */
function boundVersion(r: R, l: StoredLease, ownerId: string, at: 'first' | 'last' = 'last') {
  const a = agreementOf(r.st, ownerId);
  const lv = at === 'first' ? l.versions[0]! : l.versions.at(-1)!;
  const n = lv.agreements.find((x) => x.agreementId === a?.id)?.version;
  return { a, v: a?.versions.find((v) => v.n === n) };
}

/** Why a lease in review cannot be activated yet (checked again, in full, on activation). */
export function leaseBlockers(r: R, l: StoredLease): LeaseBlocker[] {
  const out = new Set<LeaseBlocker>();
  const start = leaseStart(l);
  if (!sharesValid(l.landlords.map((x) => x.share))) out.add('shares');
  const models = new Set<IssuingModel>();
  for (const x of l.landlords) {
    if (!ownershipsOn(r.st, l.unitId, start).some((o) => o.ownerId === x.ownerId)) out.add('not_owner');
    const a = agreementOf(r.st, x.ownerId);
    if (!a) {
      out.add('agreement_missing');
      continue;
    }
    const v = versionOn(a, start);
    if (!v) {
      out.add(draftOf(a) ? 'agreement_unsigned' : 'agreement_missing');
      continue;
    }
    models.add(v.model);
    if (v.model !== l.model) out.add('model_mismatch');
    if (v.model === 'agent' && !v.collectOnBehalf) out.add('no_collection_authority');
    if (!v.account.verified) out.add('account_unverified');
  }
  if (models.size > 1) out.add('mixed_models');
  if (!l.authority) out.add('authority_missing');
  if (overlappingLease(r, l)) out.add('overlap');
  if (start < addDays(r.today, -31)) out.add('starts_too_early');
  return [...out];
}

/** Another active or proposed lease of the same unit whose term overlaps (never the lease itself). */
export function overlapping(r: R, l: Pick<StoredLease, 'id' | 'unitId'> & { from: string; to: string }): StoredLease | undefined {
  return r.st.leases.find((x) => x.id !== l.id && x.unitId === l.unitId && ['active', 'review', 'draft'].includes(leaseState(x, r.today)) && overlaps({ from: leaseStart(x), to: leaseEnd(x) }, { from: l.from, to: l.to }));
}
export const overlappingLease = (r: R, l: StoredLease) => overlapping(r, { id: l.id, unitId: l.unitId, from: leaseStart(l), to: leaseEnd(l) });

export function leaseSummary(r: R, l: StoredLease): LeaseSummary {
  const v = l.versions.at(-1)!;
  return {
    id: l.id,
    ref: l.ref,
    state: leaseState(l, r.today),
    ending: isEnding(l, r.today),
    unitId: l.unitId,
    unitCode: unitOf(r.st, l.unitId)?.code ?? '',
    siteId: l.siteId,
    siteName: siteName(r.st, l.siteId),
    tenantName: l.tenant.name,
    landlords: l.landlords.map((x) => ({ ownerId: x.ownerId, name: ownerOf(r.st, x.ownerId)?.name ?? '', share: x.share })),
    model: l.model,
    rent: v.rent,
    from: leaseStart(l),
    to: v.to,
    ...(l.termination ? { terminationDate: l.termination.date } : {}),
    deposit: l.deposit,
  };
}

const versionTerms = (l: StoredLease) => l.versions.map((v) => ({ n: v.n, from: v.from, to: v.to, rent: paisa(v.rent), dueDay: v.dueDay }));
export const leaseSchedule = (l: StoredLease) => schedule(versionTerms(l), leaseEnd(l));

function issuingOf(r: R, l: StoredLease): LeaseIssuing | null {
  const first = l.landlords[0];
  if (!first) return null;
  const owner = ownerOf(r.st, first.ownerId);
  const { v } = boundVersion(r, l, first.ownerId);
  const version = v ?? versionOn(agreementOf(r.st, first.ownerId), leaseStart(l));
  if (!owner || !version) return null;
  return {
    model: l.model,
    entityName: issuingEntity(r, owner, { model: l.model }),
    account: version.account,
    subLedgers: l.model === 'agent' ? l.landlords.map((x) => boundVersion(r, l, x.ownerId).v?.subLedger ?? versionOn(agreementOf(r.st, x.ownerId), leaseStart(l))?.subLedger).filter((s): s is string => !!s) : [],
  };
}

export function leaseView(r: R, l: StoredLease): LeaseView {
  const state = leaseState(l, r.today);
  const unit = unitOf(r.st, l.unitId)!;
  const v = l.versions.at(-1)!;
  const manage = holds(r, 'lease.manage');
  const blockers = state === 'review' || state === 'draft' ? leaseBlockers(r, l) : [];
  const ownDraft = l.draftedBy === r.me.principalId || l.submittedBy === r.me.principalId;
  const landlords: LeaseAgreementRef[] = l.landlords.map((x) => {
    const { a, v: bound } = boundVersion(r, l, x.ownerId);
    const ver = bound?.approved ? bound : versionOn(a, leaseStart(l));
    return {
      ownerId: x.ownerId,
      ownerName: ownerOf(r.st, x.ownerId)?.name ?? '',
      share: x.share,
      ...(a ? { agreementId: a.id, agreementRef: a.ref } : {}),
      ...(ver ? { version: ver.n, model: ver.model } : bound ? { version: bound.n, model: bound.model } : {}),
      signed: !!ver?.approved && !!ver.signed,
    };
  });
  const rolls = new Map(r.st.rolls.map((x) => [x.period, x]));
  const holding = boundVersion(r, l, l.landlords[0]?.ownerId ?? '').v?.depositHolding ?? null;
  const ended = state === 'ended' || state === 'terminated';
  const active = state === 'active';
  return {
    id: l.id,
    ref: l.ref,
    state,
    ending: isEnding(l, r.today),
    unit: { id: unit.id, code: unit.code, siteId: unit.siteId, siteName: siteName(r.st, unit.siteId), kind: unit.kind },
    tenant: { partyId: l.tenant.partyId, name: l.tenant.name },
    landlords,
    terms: {
      from: leaseStart(l),
      to: v.to,
      rent: v.rent,
      dueDay: v.dueDay,
      deposit: l.deposit,
      ...(l.termination ? { terminationDate: l.termination.date, terminationReason: l.termination.reason } : {}),
    },
    issuing: issuingOf(r, l),
    billingAccount: l.billingAccount ? { ref: l.billingAccount.ref, kind: 'lease' } : null,
    ...(l.authority ? { authority: { reference: l.authority.reference, date: l.authority.date, recordedByName: l.authority.recordedByName, at: l.authority.at } } : {}),
    versions: l.versions.map((x) => ({
      n: x.n,
      from: x.from,
      to: x.to,
      rent: x.rent,
      dueDay: x.dueDay,
      reason: x.reason,
      byName: x.byName,
      at: x.at,
      agreements: x.agreements.map((b) => {
        const a = r.st.agreements.find((y) => y.id === b.agreementId);
        return { ref: a?.ref ?? '', version: b.version, ownerName: ownerOf(r.st, a?.ownerId ?? '')?.name ?? '' };
      }),
    })),
    schedule: isLet(l, r.today)
      ? leaseSchedule(l).map((s) => {
          const roll = rolls.get(s.period);
          const inRoll = roll?.lines.some((x) => x.key === rentKey(l.id, s.period, s.version));
          return { period: s.period, dueDate: s.dueDate, amount: money(s.amount), version: s.version, roll: inRoll ? roll!.state : 'not_prepared', settlement: 'not_settled' as const };
        })
      : [],
    invoices: [],
    deposit: {
      agreed: l.deposit,
      // No deposit receipt can be evidenced in this gate: nothing is held on an evidenced basis.
      heldEvidenced: ZERO,
      holding,
      state: paisa(l.deposit) > 0n ? 'awaiting_evidence' : 'none',
      refund: { due: ended && paisa(l.deposit) > 0n, refundable: ZERO, reason: ended ? 'no_evidence' : 'not_due' },
    },
    subLedger: { applicable: l.model === 'agent', refs: issuingOf(r, l)?.subLedgers ?? [], settled: ZERO },
    unitLeases: r.st.leases
      .filter((x) => x.unitId === l.unitId && x.id !== l.id && leaseVisible(r, x))
      .sort((a, b) => leaseStart(b).localeCompare(leaseStart(a)))
      .map((x) => ({ id: x.id, ref: x.ref, state: leaseState(x, r.today), tenantName: x.tenant.name, from: leaseStart(x), to: leaseEnd(x) })),
    draftedByName: l.draftedByName,
    draftedAt: l.draftedAt,
    ...(l.submittedByName ? { submittedByName: l.submittedByName } : {}),
    ...(l.activatedByName ? { activatedByName: l.activatedByName, activatedAt: l.activatedAt! } : {}),
    history: l.history,
    blockers,
    actions: {
      submit: manage && state === 'draft',
      activate: manage && state === 'review' && !ownDraft && blockers.length === 0,
      cancel: manage && (state === 'draft' || state === 'review'),
      renew: manage && active && !l.termination,
      terminate: manage && active && !l.termination,
      authority: manage && (state === 'draft' || state === 'review') && !l.authority,
    },
    ...(manage && state === 'review' && ownDraft ? { blocked: 'own_draft' as const } : manage && state === 'review' && blockers.length ? { blocked: 'blockers' as const } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Rent roll (RNT-004)
// ---------------------------------------------------------------------------------------------

/** What a rent roll for the period holds: every let lease's schedule line due in it (all sites). */
export function rollLinesFor(r: R, period: string): StoredRollLine[] {
  const out: StoredRollLine[] = [];
  for (const l of r.st.leases) {
    if (!isLet(l, r.today)) continue;
    const s = leaseSchedule(l).find((x) => x.period === period);
    if (s) out.push({ key: rentKey(l.id, period, s.version), leaseId: l.id, amount: money(s.amount), dueDate: s.dueDate, leaseVersion: s.version });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
export const rollFingerprint = (lines: readonly StoredRollLine[]) => lines.map((l) => `${l.key}=${l.amount.amount}@${l.dueDate}`).join('|');
export const rollOf = (r: R, period: string) => r.st.rolls.find((x) => x.period === period);
export const isRollStale = (r: R, roll: StoredRoll) => roll.state === 'draft' && rollFingerprint(rollLinesFor(r, roll.period)) !== roll.fingerprint;

/** Periods a roll may be prepared for: from the rentals licence month to next month. */
export const periodAllowed = (r: R, period: string) => period >= monthOf(licenceStart(r)) && period <= nextMonth(monthOf(r.today));
export function licenceStart(r: R): string {
  const froms = (r.ctx.access?.grants ?? []).filter((g) => g.module === 'rentals').map((g) => g.from.slice(0, 10)).sort();
  return froms[0] ?? RENTALS_LICENSED;
}

function rollLineView(r: R, line: StoredRollLine): RollLineView | null {
  const l = r.st.leases.find((x) => x.id === line.leaseId);
  if (!l || !leaseVisible(r, l)) return null;
  return {
    key: line.key,
    leaseId: l.id,
    leaseRef: l.ref,
    unitCode: unitOf(r.st, l.unitId)?.code ?? '',
    siteId: l.siteId,
    siteName: siteName(r.st, l.siteId),
    tenantName: l.tenant.name,
    landlords: l.landlords.map((x) => ownerOf(r.st, x.ownerId)?.name ?? ''),
    model: l.model,
    amount: line.amount,
    dueDate: line.dueDate,
    leaseVersion: line.leaseVersion,
    billingKind: 'rent',
    payerAccountRef: l.billingAccount?.ref ?? '',
    settlement: 'not_settled',
  };
}

/** Roll history for a reader with some sites: no totals of the whole roll. */
const projectHistory = (events: RentEvent[], whole: boolean): RentEvent[] => (whole ? events : events.map(({ values: _v, note: _n, ...e }) => e));

export function rollView(r: R, period: string): RentRollView {
  const roll = rollOf(r, period);
  const whole = tenantWhole(r);
  const lines = (roll ? roll.lines : rollLinesFor(r, period)).map((x) => rollLineView(r, x)).filter((x): x is RollLineView => !!x);
  const state: RollState = roll?.state ?? 'not_prepared';
  const stale = !!roll && isRollStale(r, roll);
  const bill = holds(r, 'rent.bill');
  const approve = holds(r, 'rent.approve');
  const mine = !!roll && roll.makers.includes(r.me.principalId);
  const allowed = periodAllowed(r, period);
  const periods: RentRollView['periods'] = [];
  for (let m = monthOf(licenceStart(r)); m <= nextMonth(monthOf(r.today)); m = nextMonth(m)) periods.push({ period: m, state: rollOf(r, m)?.state ?? 'not_prepared' });
  return {
    period,
    state,
    version: roll?.version ?? 0,
    stale,
    lines,
    totals: { amount: money(sum(lines.map((l) => paisa(l.amount)))), lines: lines.length },
    scopeLimited: !whole,
    ...(roll ? { preparedByName: roll.preparedByName, preparedAt: roll.preparedAt, makers: roll.makerNames } : { makers: [] }),
    ...(roll?.approvedByName ? { approvedByName: roll.approvedByName, approvedAt: roll.approvedAt! } : {}),
    ...(roll?.approvalNote && whole ? { approvalNote: roll.approvalNote } : {}),
    posting: { available: false, needs: POSTING_NEEDS },
    history: projectHistory(roll?.history ?? [], whole),
    actions: {
      preview: bill && whole && allowed && state !== 'approved',
      approve: approve && whole && state === 'draft' && !stale && !mine,
    },
    ...((bill || approve) && !whole ? { blocked: 'other_sites' as const } : !allowed ? { blocked: 'period_not_allowed' as const } : approve && state === 'draft' && mine ? { blocked: 'own_roll' as const } : approve && state === 'draft' && stale ? { blocked: 'stale' as const } : {}),
    periods,
    today: r.today,
  };
}

// ---------------------------------------------------------------------------------------------
// Owner statements (RNT-005)
// ---------------------------------------------------------------------------------------------

/** The owners a statement can be issued for in a period: an approved agreement in force by its end. */
export const statementOwners = (r: R, period: string) => r.st.owners.filter((o) => !!versionOn(agreementOf(r.st, o.id), lastDay(period)));

const settledOf = (st: RentalsState, ownerId: string, kind: 'rent' | 'expense' | 'payout', test: (period: string) => boolean) => st.settled.filter((e) => e.ownerId === ownerId && e.kind === kind && test(e.period));

/**
 * One owner's statement for a period, over all their sites (filter it for a reader with fewer). Every
 * line names its source. Settled lines come only from bound settlement events (none exist in this
 * gate); approved demands, approved expenses, deposits and payout instructions are memo lines.
 */
export function statementBody(st: RentalsState, ownerId: string, period: string, today: string): { body: StatementBody; openingBySite: Record<string, string> } {
  const owner = ownerOf(st, ownerId)!;
  const a = agreementOf(st, ownerId)!;
  const v = versionOn(a, lastDay(period))!;
  const feeBp = basisPoints(v.feePct) ?? 0n;
  const lines: StatementLineView[] = [];
  const shareIn = (l: StoredLease) => basisPoints(l.landlords.find((x) => x.ownerId === ownerId)?.share ?? '0') ?? 0n;
  const site = (id: string) => ({ siteId: id, siteName: siteName(st, id) });
  const roll = st.rolls.find((x) => x.period === period && x.state === 'approved');
  for (const line of roll?.lines ?? []) {
    const l = st.leases.find((x) => x.id === line.leaseId);
    if (!l || !l.landlords.some((x) => x.ownerId === ownerId)) continue;
    lines.push({ kind: 'rent_due', ...site(l.siteId), unitCode: unitOf(st, l.unitId)?.code ?? '', leaseId: l.id, leaseRef: l.ref, basis: 'memo', amount: money(shareOf(paisa(line.amount), shareIn(l))), source: { kind: 'rent_roll', id: period, ref: line.key }, state: 'approved_demand' });
  }
  for (const e of settledOf(st, ownerId, 'rent', (p) => p === period)) {
    lines.push({ kind: 'rent_settled', ...site(e.siteId), basis: 'settled', amount: e.amount, source: { kind: 'lease', id: e.id, ref: e.sourceRef }, state: 'settled' });
    const fee = ledger({ model: v.model, feeBp, opening: 0n, settledRent: [paisa(e.amount)], settledExpenses: [], settledPayouts: [] }).fees;
    if (fee > 0n) lines.push({ kind: 'management_fee', ...site(e.siteId), basis: 'settled', amount: money(fee), source: { kind: 'lease', id: e.id, ref: e.sourceRef }, state: 'settled' });
  }
  for (const x of st.expenses.filter((x) => x.ownerId === ownerId && monthOf(x.approvedOn) === period)) {
    lines.push({ kind: 'owner_expense', ...site(x.siteId), unitCode: unitOf(st, x.unitId)?.code ?? '', basis: 'memo', amount: x.amount, source: { kind: 'expense', id: x.id, ref: x.ref }, text: x.text, state: 'approved_unpaid' });
  }
  for (const e of settledOf(st, ownerId, 'expense', (p) => p === period)) lines.push({ kind: 'owner_expense', ...site(e.siteId), basis: 'settled', amount: e.amount, source: { kind: 'expense', id: e.id, ref: e.sourceRef }, state: 'settled' });
  for (const l of st.leases) {
    if (!l.landlords.some((x) => x.ownerId === ownerId) || !isLet(l, today) || paisa(l.deposit) === 0n) continue;
    if (!(leaseStart(l) <= lastDay(period) && leaseEnd(l) >= firstDay(period))) continue;
    lines.push({ kind: 'deposit_held', ...site(l.siteId), unitCode: unitOf(st, l.unitId)?.code ?? '', leaseId: l.id, leaseRef: l.ref, basis: 'memo', amount: money(shareOf(paisa(l.deposit), shareIn(l))), source: { kind: 'lease', id: l.id, ref: l.ref }, state: 'awaiting_evidence' });
  }
  // The sites the owner lets through the manager (their leases): the statement's sites.
  const ownerSiteIds = [...new Set(st.leases.filter((l) => l.landlords.some((x) => x.ownerId === ownerId)).map((l) => l.siteId))];
  // A payout instruction belongs to the whole owner, never to one site: a reader with only some of the
  // owner's sites never sees it (no site id, so the projection drops it).
  const owned = { siteId: '', siteName: '' };
  for (const p of st.payouts.filter((x) => x.ownerId === ownerId && (x.state === 'awaiting_approval' || x.state === 'approved') && x.preparedAt.slice(0, 10) <= lastDay(period))) {
    lines.push({ kind: 'payout_pending', ...owned, basis: 'memo', amount: p.amount, source: { kind: 'payout', id: p.id, ref: p.ref }, state: p.state === 'approved' ? 'approved_not_sent' : 'awaiting_approval' });
  }
  for (const e of settledOf(st, ownerId, 'payout', (p) => p === period)) lines.push({ kind: 'payout_settled', ...owned, basis: 'settled', amount: e.amount, source: { kind: 'payout', id: e.id, ref: e.sourceRef }, state: 'settled' });

  // Opening: every settled event before the period, per site (so a reader with fewer sites gets theirs).
  const openingBySite: Record<string, string> = {};
  for (const id of new Set([...ownerSiteIds, ...st.settled.filter((e) => e.ownerId === ownerId).map((e) => e.siteId)])) {
    const before = (k: 'rent' | 'expense' | 'payout') => settledOf(st, ownerId, k, (p) => p < period).filter((e) => e.siteId === id).map((e) => paisa(e.amount));
    openingBySite[id] = ledger({ model: v.model, feeBp, opening: 0n, settledRent: before('rent'), settledExpenses: before('expense'), settledPayouts: before('payout') }).closing.toString();
  }
  const body: StatementBody = {
    owner: { id: owner.id, name: owner.name, ref: owner.ref },
    period,
    model: v.model,
    agreement: { ref: a.ref, version: v.n, feePct: v.feePct },
    lines,
    totals: totalsOf(lines, v.model, sum(Object.values(openingBySite).map((x) => BigInt(x)))),
    memo: memoOf(lines),
  };
  return { body, openingBySite };
}

const ofKind = (lines: readonly StatementLineView[], kind: StatementLineView['kind'], basis: 'settled' | 'memo') => sum(lines.filter((l) => l.kind === kind && l.basis === basis).map((l) => paisa(l.amount)));

export function totalsOf(lines: readonly StatementLineView[], model: IssuingModel, opening: bigint): StatementBody['totals'] {
  const settledRent = ofKind(lines, 'rent_settled', 'settled');
  const fees = ofKind(lines, 'management_fee', 'settled');
  const settledExpenses = ofKind(lines, 'owner_expense', 'settled');
  const settledPayouts = ofKind(lines, 'payout_settled', 'settled');
  const open = model === 'principal' ? 0n : opening;
  const closing = model === 'principal' ? 0n : open + settledRent - fees - settledExpenses - settledPayouts;
  return { opening: money(open), settledRent: money(settledRent), fees: money(fees), settledExpenses: money(settledExpenses), settledPayouts: money(settledPayouts), closing: money(closing) };
}

export const memoOf = (lines: readonly StatementLineView[]): StatementBody['memo'] => ({
  rentDue: money(ofKind(lines, 'rent_due', 'memo')),
  expensesApproved: money(ofKind(lines, 'owner_expense', 'memo')),
  depositsAgreed: money(ofKind(lines, 'deposit_held', 'memo')),
  // Deposits held on an evidenced basis: none can be evidenced in this gate.
  depositsHeld: ZERO,
  pendingPayouts: money(ofKind(lines, 'payout_pending', 'memo')),
});

/**
 * Issue #17 (P0): **the one site projection of an owner statement**, for the office (RNT-005) and the
 * landlord view (PORTAL-037). `permitted` are the sites this reader may see for the owner; `whole` says
 * they may see every site the owner's records touch (and the statement's own sites). A whole reader gets
 * the statement as it is. Anyone else gets a partial statement: the permitted sites' lines only, with
 * totals recalculated from those lines and the permitted sites' own openings (frozen per site in the
 * snapshot). Owner-wide lines (payout instructions and settled payouts, `siteId: ''`) and an owner-wide
 * opening never reach them. Issue #18: a settled line's source reference (the bank's statement line)
 * reaches holders of the bank feed (`bank.view` or `bank.reconcile`) only.
 */
export function projectStatement(ctx: HandlerContext, body: StatementBody, openingBySite: Record<string, string>, permitted: ReadonlySet<string>, whole: boolean): { body: StatementBody; scopeLimited: boolean } {
  const bank = seesBankFeed(ctx);
  const safe = (lines: readonly StatementLineView[]) => lines.map((l) => (l.basis === 'settled' && !bank ? { ...l, source: { ...l.source, ref: '' } } : l));
  if (whole) return { body: { ...body, lines: safe(body.lines) }, scopeLimited: false };
  const lines = body.lines.filter((l) => l.siteId !== '' && permitted.has(l.siteId));
  const opening = sum(Object.entries(openingBySite).filter(([s]) => s !== '' && permitted.has(s)).map(([, v]) => BigInt(v)));
  return { body: { ...body, lines: safe(lines), totals: totalsOf(lines, body.model, opening), memo: memoOf(lines) }, scopeLimited: true };
}

/**
 * Issue #17 (P0 and GPT's follow-up review of `d050bad`): whether a reader may know that an issued
 * statement exists at all — its id, reference, period, issuer, date and "issued" state. Only with the
 * whole owner, or when at least one of the statement's own sites is theirs (it is then shown through
 * `projectStatement`, labelled partial). A statement of hidden sites only is never listed, and looking
 * it up answers exactly as if it had never been issued. The one rule for the landlord view and the office.
 */
export const statementKnown = (s: Pick<StoredStatement, 'body' | 'openingBySite'>, permitted: ReadonlySet<string>, whole: boolean) => whole || statementSites(s.body, s.openingBySite).some((x) => permitted.has(x));

/** An office reader holds the whole statement: every site of the owner and of the statement itself. */
const officeWhole = (r: R, body: StatementBody, openingBySite: Record<string, string>) => ownerWhole(r, body.owner.id) && statementSites(body, openingBySite).every((s) => r.scope.has(s));

/** A body as one office reader may see it: whole only with every site of the owner and of the statement. */
export function projectBody(r: R, body: StatementBody, openingBySite: Record<string, string>): { body: StatementBody; scopeLimited: boolean } {
  return projectStatement(r.ctx, body, openingBySite, r.scope, officeWhole(r, body, openingBySite));
}

/** An issued statement this office reader may know about (`statementKnown` with the reader's sites). */
export const officeKnows = (r: R, s: StoredStatement) => statementKnown(s, r.scope, officeWhole(r, s.body, s.openingBySite));

/** The owner's issued statement for a period, whoever asks (only for the issuer's own duplicate check). */
export const storedStatementOf = (st: RentalsState, ownerId: string, period: string) => st.statements.find((s) => s.ownerId === ownerId && s.period === period);

/** The owner's issued statement for a period as this reader may know it: one of hidden sites only is not there. */
export function issuedOf(r: R, ownerId: string, period: string) {
  const s = storedStatementOf(r.st, ownerId, period);
  return s && officeKnows(r, s) ? s : undefined;
}

export function statementView(r: R, ownerId: string, period: string): OwnerStatementView {
  const issued = issuedOf(r, ownerId, period);
  const whole = ownerWhole(r, ownerId);
  const source = issued ? { body: issued.body, openingBySite: issued.openingBySite } : statementBody(r.st, ownerId, period, r.today);
  const { body, scopeLimited } = projectBody(r, source.body, source.openingBySite);
  const future = period > monthOf(r.today);
  const view = holds(r, 'owner_statement.view');
  // Issue #17 (R4): reading a statement never publishes it; issuing needs its own permission.
  const issuer = holds(r, 'owner_statement.issue');
  return {
    ...body,
    ...(issued ? { id: issued.id, ref: issued.ref, issuedByName: issued.issuedByName, issuedAt: issued.issuedAt } : {}),
    state: issued ? 'issued' : 'draft',
    scopeLimited,
    history: projectHistory(issued?.history ?? [], whole),
    actions: { issue: issuer && whole && !issued && !future },
    ...(view && !whole ? { blocked: 'other_sites' as const } : future ? { blocked: 'future_period' as const } : issued ? { blocked: 'already_issued' as const } : !issuer ? { blocked: 'issue_permission' as const } : {}),
  };
}

/** Seeded on first use: September's statement for Tahira Rehman, issued on 3 October. */
export function seedIssued(st: RentalsState): void {
  const { body, openingBySite } = statementBody(st, 'own_rb_tahira', '2026-09', '2026-10-03');
  const at = '2026-10-03T11:30:00+05:00';
  const s: StoredStatement = {
    id: 'ost_rb_0001',
    ref: 'RB-OS-0001',
    ownerId: 'own_rb_tahira',
    period: '2026-09',
    body,
    openingBySite,
    issuedBy: 'usr_rb_0004',
    issuedByName: 'Usman Ghani',
    issuedAt: at,
    history: [{ at, by: 'usr_rb_0004', byName: 'Usman Ghani', action: 'statement_issued', values: { period: '2026-09', closing: body.totals.closing.amount } }],
  };
  st.statements.push(s);
  st.counters.statement = 1;
}

// ---------------------------------------------------------------------------------------------
// Owner payouts (RNT-006)
// ---------------------------------------------------------------------------------------------

export const PENDING: readonly StoredPayout['state'][] = ['awaiting_approval', 'approved'];

/** The owner's settled closing payable today and what is already instructed (whole-owner figures). */
export function payable(st: RentalsState, ownerId: string, today: string) {
  const v = versionOn(agreementOf(st, ownerId), today);
  const model = v?.model ?? 'agent';
  const feeBp = basisPoints(v?.feePct ?? '0') ?? 0n;
  const all = (k: 'rent' | 'expense' | 'payout') => st.settled.filter((e) => e.ownerId === ownerId && e.kind === k).map((e) => paisa(e.amount));
  const closing = ledger({ model, feeBp, opening: 0n, settledRent: all('rent'), settledExpenses: all('expense'), settledPayouts: all('payout') }).closing;
  const pending = st.payouts.filter((p) => p.ownerId === ownerId && PENDING.includes(p.state)).map((p) => paisa(p.amount));
  return { model, closing, pending: sum(pending), available: availableToInstruct(closing, pending) };
}

export function payoutHolds(r: R, owner: StoredOwner): PayoutHold[] {
  const v = versionOn(agreementOf(r.st, owner.id), r.today);
  const out: PayoutHold[] = [];
  if (!ownerWhole(r, owner.id)) return ['other_sites'];
  if (v?.model === 'principal') out.push('principal_model');
  else if (!v?.collectOnBehalf) out.push('no_collection_authority');
  if (!owner.beneficiary.verified) out.push('beneficiary_unverified');
  if (payable(r.st, owner.id, r.today).available === 0n && v?.model !== 'principal') out.push('no_settled_money');
  return out;
}

/** The staff member is one of the owner's own people (a conflicted approver or preparer). */
export const conflicted = (r: R, owner: StoredOwner | undefined) => !!owner?.principalId && owner.principalId === r.me.principalId;

export function payoutView(r: R, p: StoredPayout): PayoutView {
  const owner = ownerOf(r.st, p.ownerId);
  const approve = holds(r, 'owner_payout.approve');
  const prepare = holds(r, 'owner_payout.prepare');
  const mine = p.preparedBy === r.me.principalId;
  const own = conflicted(r, owner);
  return {
    id: p.id,
    ref: p.ref,
    ownerId: p.ownerId,
    ownerName: owner?.name ?? '',
    amount: p.amount,
    // Issue #18: masked bank details only for the people who prepare or approve payouts.
    ...(approve || prepare ? { beneficiary: p.beneficiary } : {}),
    state: p.state,
    settlement: 'not_settled',
    note: p.note,
    preparedByName: p.preparedByName,
    preparedAt: p.preparedAt,
    ...(p.approvedByName ? { approvedByName: p.approvedByName, approvedAt: p.approvedAt! } : {}),
    ...(p.rejectedByName ? { rejectedByName: p.rejectedByName, rejectedAt: p.rejectedAt!, rejectReason: p.rejectReason! } : {}),
    ...(p.cancelledByName ? { cancelledByName: p.cancelledByName, cancelledAt: p.cancelledAt!, cancelReason: p.cancelReason! } : {}),
    history: p.history,
    actions: {
      approve: approve && p.state === 'awaiting_approval' && !mine && !own,
      reject: approve && p.state === 'awaiting_approval' && !mine && !own,
      cancel: (approve || prepare) && (p.state === 'awaiting_approval' || p.state === 'approved'),
    },
    ...(approve && p.state === 'awaiting_approval' && mine ? { blocked: 'own_instruction' as const } : approve && p.state === 'awaiting_approval' && own ? { blocked: 'own_record' as const } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Settings (RNT-007)
// ---------------------------------------------------------------------------------------------

export function agreementView(r: R, a: StoredAgreement): AgreementView {
  const owner = ownerOf(r.st, a.ownerId)!;
  const whole = ownerWhole(r, a.ownerId);
  const configure = holds(r, 'rentals.configure');
  const draft = draftOf(a);
  const versions: AgreementVersionView[] = [...a.versions]
    .sort((x, y) => y.n - x.n)
    .map((v) => ({
      n: v.n,
      state: versionState(a, v, r.today),
      effectiveFrom: v.effectiveFrom,
      model: v.model,
      signed: v.signed,
      collectOnBehalf: v.collectOnBehalf,
      feePct: v.feePct,
      depositHolding: v.depositHolding,
      depositMaxMonths: v.depositMaxMonths,
      account: v.account,
      ...(v.subLedger ? { subLedger: v.subLedger } : {}),
      issuingEntityName: issuingEntity(r, owner, v),
      draftedByName: v.draftedByName,
      draftedAt: v.draftedAt,
      ...(v.approvedByName ? { approvedByName: v.approvedByName, approvedAt: v.approvedAt! } : {}),
      ...(v.note && whole ? { note: v.note } : {}),
      // Leases of the reader's sites only.
      boundLeases: r.st.leases.filter((l) => leaseVisible(r, l) && l.versions.some((lv) => lv.agreements.some((b) => b.agreementId === a.id && b.version === v.n))).map((l) => l.ref),
    }));
  return {
    id: a.id,
    ref: a.ref,
    owner: { id: owner.id, name: owner.name },
    sites: ownerSites(r, a.ownerId).filter((s) => r.scope.has(s)).map((s) => siteName(r.st, s)),
    versions,
    scopeLimited: !whole,
    actions: {
      draft: configure && whole,
      approve: configure && whole && !!draft && draft.draftedBy !== r.me.principalId && !!draft.signed,
    },
    ...(configure && !whole ? { blocked: 'other_sites' as const } : configure && draft && draft.draftedBy === r.me.principalId ? { blocked: 'own_draft' as const } : {}),
  };
}

export const moneyOrZero = (m: Money | undefined) => m ?? ZERO;
export { isDate };

import { DEPOSIT_HOLDINGS, ISSUING_MODELS, LEASE_FILTERS, RENT_TEMPLATES, type AgreementVersionInput, type AgreementView, type LeaseAuthorityInput, type LeaseDraftInput, type LeaseExport, type LeaseFilter, type LeaseOptions, type LeaseRenewInput, type LeasesList, type LeaseTerminateInput, type LeaseView, type OwnerStatementIssueInput, type OwnerStatementsList, type OwnerStatementView, type PayoutInput, type PayoutsView, type PayoutView, type Permission, type RentalSettings, type RentRollView } from '@repo/contracts';
import { matches, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { invalid } from '../operations/common';
import { problem } from '../society/handlers';
import { addDays, AMOUNT, basisPoints, fingerprint, instructionAllowed, isDate, MONTH, money, monthOf, nextMonth, paisa, sum, termMonths } from './rules';
import { ev, nextRent, type StoredAgreementVersion, type StoredLease, type StoredPayout, type StoredRoll } from './state';
import {
  agreementOf,
  agreementView,
  conflicted,
  draftOf,
  holds,
  isEnding,
  officeKnows,
  leaseBlockers,
  leaseEnd,
  leaseStart,
  leaseState,
  leaseSummary,
  leaseView,
  leaseVisible,
  licenceStart,
  overlapping,
  ownerOf,
  ownershipsOn,
  ownerSites,
  ownerVisible,
  ownerWhole,
  payable,
  payoutHolds,
  payoutView,
  PENDING,
  periodAllowed,
  isRollStale,
  rentOf,
  rollFingerprint,
  rollLinesFor,
  rollOf,
  rollView,
  siteName,
  statementBody,
  statementOwners,
  statementView,
  storedStatementOf,
  tenantWhole,
  unitOf,
  versionOn,
  type R,
} from './views';

/**
 * Gate S.3 rentals endpoints (RNT-001…009). The transport checks the `rentals` add-on, the feature
 * where one applies and the permission; `rentOf` checks the office app and the person's rentals sites.
 * Then each handler checks, in this order and before reading any id from the request body:
 * 1. **Authority**: the record's site in scope (a lease), or every site of the owner (agreement,
 *    statement, payout) or of the organisation (rent roll) for any change.
 * 2. **The ids** in the path or body, in scope (anything else: "not found" or a field problem, identical
 *    for an id never issued).
 * 3. **Idempotency** (Issues #16 and #18): every rentals create (lease, renewal, roll preview, statement
 *    issue, payout instruction, agreement version) binds its key to the operation, the person, the
 *    target and the normalised request; a repeated key replays only that same request, re-read through
 *    the scoped lookups; anything else is `409 idempotency_key_reused` (the code payroll and S.1 use),
 *    which discloses nothing and changes nothing.
 * 4. **The record's state**, then **maker ≠ checker** by principal (and nobody acts on their own
 *    property), then **validation** of every field, before anything is stored.
 * A refused request changes nothing. Rentals cannot be practised in training mode (no practice store).
 *
 * There is no posting, settlement, payment or evidence route: rent is never invoiced here, nothing is
 * collected, and an approved payout instruction moves no money and reduces no payable.
 */

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<Record<keyof T, unknown>>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const q = (ctx: HandlerContext, key: string) => String(ctx.req.query?.[key] ?? '').trim();
const save = (r: R) => r.ctx.demo.save();
const who = (r: R) => ({ by: r.me.principalId, byName: r.me.name });
const stamp = (r: R, action: string, extra: { note?: string; values?: Record<string, string> } = {}) => ev(who(r), r.now, action, extra);

function refuse(ctx: HandlerContext, status: number, code: string, key: string, values?: Record<string, string>): never {
  if (values) problem(ctx, status, code, `rentals:problems.${key}`, { _: [{ code: `rentals:problems.${key}Detail`, params: values }] });
  problem(ctx, status, code, `rentals:problems.${key}`);
}

function text(ctx: HandlerContext, field: string, raw: unknown, min: number, max: number): string {
  const v = str(raw);
  if (v.length < min) invalid(ctx, field, min <= 1 ? 'forms:errors.required' : 'rentals:errors.minLength', { min: String(min) });
  if (v.length > max) invalid(ctx, field, 'rentals:errors.maxLength', { max: String(max) });
  return v;
}

function amount(ctx: HandlerContext, field: string, raw: unknown, allowZero = false): bigint {
  const v = str(typeof raw === 'number' ? String(raw) : raw).replace(/,/g, '');
  if (!AMOUNT.test(v)) invalid(ctx, field, 'rentals:errors.amount');
  const p = paisa(v);
  if (p < 0n || (!allowZero && p === 0n) || p > 1_000_000_000n) invalid(ctx, field, 'rentals:errors.amount');
  return p;
}

/** Changes are refused in training mode: rentals has no practice records. */
function official(r: R): R {
  if (r.ctx.req.training) refuse(r.ctx, 403, 'training_not_supported', 'trainingNotSupported');
  return r;
}

/** Every site of the owner (agreement, statements, payouts span them). Never names another site. */
function wholeOwner(r: R, ownerId: string): void {
  if (!ownerWhole(r, ownerId)) refuse(r.ctx, 403, 'other_sites', 'otherSites');
}

/**
 * Issue #16 idempotency. Call after the authority checks. With a key already used, only the same
 * operation by the same principal on the same target with the same normalised request is a replay
 * (the caller re-reads the record through its scoped lookup); anything else is a non-disclosing 409.
 */
function idempotent(r: R, op: string, target: string, input: unknown): { replay?: string; remember: (id: string) => void } {
  const key = r.ctx.req.idempotencyKey;
  const fp = fingerprint(input);
  if (key) {
    const e = r.st.idempotency[key];
    if (e) {
      if (e.op === op && e.principal === r.me.principalId && e.target === target && e.fp === fp) return { replay: e.id, remember: () => {} };
      refuse(r.ctx, 409, 'idempotency_key_reused', 'idempotencyKeyReused');
    }
  }
  return { remember: (id) => void (key ? (r.st.idempotency[key] = { op, principal: r.me.principalId, target, fp, id }) : undefined) };
}

/** A replayed record must still be the reader's to see; otherwise the replay discloses nothing. */
function replayed<T>(r: R, found: T | undefined): T {
  if (found === undefined) refuse(r.ctx, 409, 'idempotency_key_reused', 'idempotencyKeyReused');
  return found;
}

function findLease(r: R, id = r.ctx.params.id): StoredLease {
  const l = r.st.leases.find((x) => x.id === id);
  if (!l || !leaseVisible(r, l)) notFound(r.ctx);
  return l;
}

/** A lease the person may change: its site in scope (a lease belongs to one site). */
function leaseToChange(r: R): StoredLease {
  official(r);
  return findLease(r);
}

// ---------------------------------------------------------------------------------------------
// Leases (RNT-001, RNT-002, RNT-003, RNT-008, RNT-009)
// ---------------------------------------------------------------------------------------------

const inFilter = (r: R, l: StoredLease, f: LeaseFilter) => {
  const s = leaseState(l, r.today);
  if (f === 'all') return s !== 'cancelled';
  if (f === 'active') return s === 'active';
  if (f === 'ending') return isEnding(l, r.today);
  if (f === 'draft') return s === 'draft' || s === 'review';
  return s === 'ended' || s === 'terminated';
};

function visibleLeases(r: R): StoredLease[] {
  const site = q(r.ctx, 'site');
  const term = q(r.ctx, 'q');
  return r.st.leases
    .filter((l) => leaseVisible(r, l) && (!site || l.siteId === site))
    .filter((l) => !term || matches(term, l.ref, l.tenant.name, unitOf(r.st, l.unitId)?.code, ...l.landlords.map((x) => ownerOf(r.st, x.ownerId)?.name)))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

function leasesList(r: R): LeasesList {
  const raw = q(r.ctx, 'status');
  const filter: LeaseFilter = (LEASE_FILTERS as readonly string[]).includes(raw) ? (raw as LeaseFilter) : 'all';
  const leases = visibleLeases(r);
  const counts = Object.fromEntries(LEASE_FILTERS.map((f) => [f, leases.filter((l) => inFilter(r, l, f)).length])) as LeasesList['counts'];
  // KPIs over everything the reader may see (the site and search filters apply to the list only).
  const mine = r.st.leases.filter((l) => leaseVisible(r, l));
  const active = mine.filter((l) => leaseState(l, r.today) === 'active');
  const month = monthOf(r.today);
  const roll = rollOf(r, month);
  const due = (roll?.lines ?? []).filter((x) => mine.some((l) => l.id === x.leaseId));
  const owners = r.st.owners.filter((o) => versionOn(agreementOf(r.st, o.id), r.today) && ownerWhole(r, o.id));
  return {
    items: leases.filter((l) => inFilter(r, l, filter)).map((l) => leaseSummary(r, l)),
    counts,
    kpis: {
      active: active.length,
      rentUnderManagement: money(sum(active.map((l) => paisa(l.versions.at(-1)!.rent)))),
      dueThisMonth: money(sum(due.map((x) => paisa(x.amount)))),
      dueMonth: month,
      rollState: roll?.state ?? 'not_prepared',
      ownerPayableSettled: money(sum(owners.map((o) => payable(r.st, o.id, r.today).closing))),
      pendingPayouts: r.st.payouts.filter((p) => PENDING.includes(p.state) && owners.some((o) => o.id === p.ownerId)).length,
    },
    sites: r.st.sites.filter((s) => r.scope.has(s.id)).map((s) => ({ id: s.id, name: s.name, code: s.code })),
    scopeLimited: !tenantWhole(r),
    canCreate: holds(r, 'lease.manage'),
    today: r.today,
  };
}

function exportLeases(r: R): LeaseExport {
  return {
    scopeLimited: !tenantWhole(r),
    rows: visibleLeases(r).filter((l) => leaseState(l, r.today) !== 'cancelled').map((l) => {
      const s = leaseSummary(r, l);
      return { ref: s.ref, state: s.state, unit: s.unitCode, site: s.siteName, tenant: s.tenantName, landlords: s.landlords.map((x) => `${x.name} ${x.share}%`).join('; '), model: s.model, rent: s.rent.amount, from: s.from, to: s.terminationDate ?? s.to, deposit: s.deposit.amount };
    }),
  };
}

function leaseOptions(r: R): LeaseOptions {
  const ownersOfParty = new Set(r.st.owners.map((o) => o.partyId));
  return {
    units: r.st.units
      .filter((u) => r.scope.has(u.siteId))
      .map((u) => {
        const current = r.st.leases.find((l) => l.unitId === u.id && ['active', 'review', 'draft'].includes(leaseState(l, r.today)));
        return {
          id: u.id,
          code: u.code,
          siteId: u.siteId,
          siteName: siteName(r.st, u.siteId),
          owners: ownershipsOn(r.st, u.id, r.today).map((o) => {
            const a = agreementOf(r.st, o.ownerId);
            const v = versionOn(a, r.today) ?? draftOf(a);
            return { ownerId: o.ownerId, name: ownerOf(r.st, o.ownerId)?.name ?? '', share: o.share, ...(a && v ? { agreement: { ref: a.ref, model: v.model, signed: !!v.approved && !!v.signed, inForce: !!versionOn(a, r.today) } } : {}) };
          }),
          ...(current ? { current: { ref: current.ref, to: leaseEnd(current) } } : {}),
        };
      }),
    // Prospective tenants: people of the register who hold no current lease and own nothing here.
    tenants: r.st.people
      .filter((p) => !ownersOfParty.has(p.partyId) && !r.st.leases.some((l) => l.tenant.partyId === p.partyId && ['active', 'review', 'draft'].includes(leaseState(l, r.today))))
      .map((p) => ({ partyId: p.partyId, name: p.name, ref: p.ref })),
    today: r.today,
  };
}

const LEASE_MAX = 10_000_000_00n; // PKR 10,000,000.00 a month

function createLease(r: R): LeaseView {
  const { ctx } = official(r);
  const b = body<LeaseDraftInput>(ctx);
  // The unit first: one outside the reader's rentals sites is the same field problem as one never issued.
  const unit = unitOf(r.st, str(b.unitId));
  if (!unit || !r.scope.has(unit.siteId)) invalid(ctx, 'unitId', 'forms:errors.required');
  const idem = idempotent(r, 'lease.create', unit.id, b);
  if (idem.replay) return leaseView(r, replayed(r, r.st.leases.find((l) => l.id === idem.replay && leaseVisible(r, l))));
  const from = str(b.from);
  const to = str(b.to);
  if (!isDate(from)) invalid(ctx, 'from', 'rentals:errors.date');
  if (!isDate(to)) invalid(ctx, 'to', 'rentals:errors.date');
  if (to <= from) invalid(ctx, 'to', 'rentals:errors.endAfterStart');
  const months = termMonths(from, to);
  if (months < 1 || months > 36) invalid(ctx, 'to', 'rentals:errors.term');
  if (from < addDays(r.today, -31)) invalid(ctx, 'from', 'rentals:errors.startTooEarly');
  if (from > addDays(r.today, 366)) invalid(ctx, 'from', 'rentals:errors.startTooFar');
  // Landlords: registered owners of the unit on the start date, shares adding up to 100 %.
  const raw = Array.isArray(b.landlords) ? (b.landlords as Array<{ ownerId?: unknown; share?: unknown }>) : [];
  if (raw.length < 1 || raw.length > 4) invalid(ctx, 'landlords', 'rentals:errors.landlords');
  const owners = ownershipsOn(r.st, unit.id, from);
  const landlords = raw.map((x) => ({ ownerId: str(x?.ownerId), share: str(typeof x?.share === 'number' ? String(x.share) : x?.share) }));
  if (new Set(landlords.map((x) => x.ownerId)).size !== landlords.length || landlords.some((x) => !owners.some((o) => o.ownerId === x.ownerId))) invalid(ctx, 'landlords', 'rentals:errors.notOwner');
  const bps = landlords.map((x) => basisPoints(x.share));
  if (bps.some((x) => x === null || x <= 0n) || sum(bps as bigint[]) !== 10000n) invalid(ctx, 'landlords', 'rentals:errors.shares');
  // No signed agreement and no agreement in preparation: nobody may let the unit on the owner's behalf.
  const agreements = landlords.map((x) => agreementOf(r.st, x.ownerId));
  if (agreements.some((a) => !a)) invalid(ctx, 'landlords', 'rentals:errors.noAgreement');
  const model = str(b.model);
  if (!(ISSUING_MODELS as readonly string[]).includes(model)) invalid(ctx, 'model', 'forms:errors.required');
  const versions = agreements.map((a) => versionOn(a, from) ?? draftOf(a)!);
  if (new Set(versions.map((v) => v.model)).size > 1) invalid(ctx, 'model', 'rentals:errors.mixedModels');
  if (versions.some((v) => v.model !== model)) invalid(ctx, 'model', 'rentals:errors.modelMismatch');
  const tenant = r.st.people.find((p) => p.partyId === str(b.tenantPartyId));
  if (!tenant || r.st.owners.some((o) => o.partyId === tenant.partyId && landlords.some((x) => x.ownerId === o.id))) invalid(ctx, 'tenantPartyId', 'forms:errors.required');
  const rent = amount(ctx, 'rent', b.rent);
  if (rent > LEASE_MAX) invalid(ctx, 'rent', 'rentals:errors.amount');
  const dueDay = typeof b.dueDay === 'number' ? b.dueDay : Number(str(b.dueDay));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) invalid(ctx, 'dueDay', 'rentals:errors.dueDay');
  const deposit = amount(ctx, 'deposit', b.deposit, true);
  const cap = Math.max(...versions.map((v) => v.depositMaxMonths));
  if (deposit > rent * BigInt(cap)) invalid(ctx, 'deposit', 'rentals:errors.depositCap', { months: String(cap) });
  const auth = b.authority as Partial<Record<keyof LeaseAuthorityInput, unknown>> | undefined;
  let authority: StoredLease['authority'];
  if (auth && (str(auth.reference) || str(auth.date) || auth.confirmed)) authority = authorityOf(r, auth);
  // A duplicate or an overlap with another lease of the unit (its reference: the unit is in scope).
  const dup = r.st.leases.find((l) => l.unitId === unit.id && l.tenant.partyId === tenant.partyId && leaseStart(l) === from && leaseState(l, r.today) !== 'cancelled');
  if (dup) refuse(ctx, 409, 'duplicate_lease', 'duplicateLease', { ref: dup.ref });
  const clash = overlapping(r, { id: '', unitId: unit.id, from, to });
  if (clash) refuse(ctx, 409, 'lease_overlap', 'leaseOverlap', { ref: clash.ref });
  const { id, ref } = nextRent(r.st, 'lease');
  const lease: StoredLease = {
    id,
    ref,
    unitId: unit.id,
    siteId: unit.siteId,
    state: 'draft',
    landlords,
    tenant: { partyId: tenant.partyId, name: tenant.name },
    model: model as LeaseDraftInput['model'],
    deposit: money(deposit),
    versions: [{ n: 1, from, to, rent: money(rent), dueDay, reason: 'created', ...who(r), at: r.now, agreements: agreements.map((a, i) => ({ agreementId: a!.id, version: versions[i]!.n })) }],
    ...(authority ? { authority } : {}),
    draftedBy: r.me.principalId,
    draftedByName: r.me.name,
    draftedAt: r.now,
    history: [stamp(r, 'lease_drafted')],
  };
  r.st.leases.push(lease);
  idem.remember(id);
  save(r);
  return leaseView(r, lease);
}

function authorityOf(r: R, a: Partial<Record<keyof LeaseAuthorityInput, unknown>>): NonNullable<StoredLease['authority']> {
  const reference = text(r.ctx, 'authority.reference', a.reference, 3, 60);
  const date = str(a.date);
  if (!isDate(date) || date > r.today) invalid(r.ctx, 'authority.date', 'rentals:errors.authorityDate');
  if (a.confirmed !== true) invalid(r.ctx, 'authority.confirmed', 'rentals:errors.authorityConfirm');
  return { reference, date, by: r.me.principalId, recordedByName: r.me.name, at: r.now };
}

function recordAuthority(r: R): LeaseView {
  const l = leaseToChange(r);
  const s = leaseState(l, r.today);
  if (s !== 'draft' && s !== 'review') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  if (l.authority) refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  l.authority = authorityOf(r, body<LeaseAuthorityInput>(r.ctx));
  l.history.push(stamp(r, 'authority_recorded', { values: { reference: l.authority.reference } }));
  save(r);
  return leaseView(r, l);
}

function submitLease(r: R): LeaseView {
  const l = leaseToChange(r);
  if (leaseState(l, r.today) !== 'draft') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  Object.assign(l, { state: 'review', submittedBy: r.me.principalId, submittedByName: r.me.name });
  l.history.push(stamp(r, 'lease_submitted'));
  save(r);
  return leaseView(r, l);
}

/**
 * Activating a lease: by someone who neither drafted nor submitted it and is none of its landlords,
 * once every blocker is resolved (agreements signed and in force on the start date, one issuing
 * model, the owner's written authority, no overlap). The lease gets its own payer account (kind lease).
 */
function activateLease(r: R): LeaseView {
  const l = leaseToChange(r);
  if (leaseState(l, r.today) !== 'review') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  if (l.draftedBy === r.me.principalId || l.submittedBy === r.me.principalId) refuse(r.ctx, 403, 'maker_checker_required', 'makerChecker');
  if (l.landlords.some((x) => conflicted(r, ownerOf(r.st, x.ownerId)))) refuse(r.ctx, 403, 'own_record', 'ownRecord');
  const blockers = leaseBlockers(r, l);
  // The first blocker in words (its text is the same as on Lease 360).
  if (blockers.length) problem(r.ctx, 409, 'lease_blocked', 'rentals:problems.leaseBlocked', { _: [{ code: `rentals:blocker.${blockers[0]!}` }] });
  const start = leaseStart(l);
  // Bound to the agreement versions in force on the start date (a later version never rewrites it).
  l.versions[0]!.agreements = l.landlords.map((x) => {
    const a = agreementOf(r.st, x.ownerId)!;
    return { agreementId: a.id, version: versionOn(a, start)!.n };
  });
  const acc = nextRent(r.st, 'account');
  Object.assign(l, { state: 'active', activatedBy: r.me.principalId, activatedByName: r.me.name, activatedAt: r.now, billingAccount: { id: acc.id, ref: acc.ref } });
  l.history.push(stamp(r, 'lease_activated', { values: { account: acc.ref } }));
  save(r);
  return leaseView(r, l);
}

function cancelLease(r: R): LeaseView {
  const l = leaseToChange(r);
  const s = leaseState(l, r.today);
  if (s !== 'draft' && s !== 'review') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(r.ctx, 'reason', body<{ reason: string }>(r.ctx).reason, 5, 300);
  l.state = 'cancelled';
  l.history.push(stamp(r, 'lease_cancelled', { note: reason }));
  save(r);
  return leaseView(r, l);
}

/** RNT-008: renewal adds a version from the day after the current end (earlier versions never change). */
function renewLease(r: R): LeaseView {
  const l = leaseToChange(r);
  const b = body<LeaseRenewInput>(r.ctx);
  const idem = idempotent(r, 'lease.renew', l.id, b);
  if (idem.replay) return leaseView(r, l);
  if (leaseState(l, r.today) !== 'active' || l.termination) refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  const from = addDays(leaseEnd(l), 1);
  const to = str(b.to);
  if (!isDate(to)) invalid(r.ctx, 'to', 'rentals:errors.date');
  if (to <= from) invalid(r.ctx, 'to', 'rentals:errors.endAfterStart');
  const months = termMonths(from, to);
  if (months < 1 || months > 36) invalid(r.ctx, 'to', 'rentals:errors.term');
  const rent = amount(r.ctx, 'rent', b.rent);
  if (rent > LEASE_MAX) invalid(r.ctx, 'rent', 'rentals:errors.amount');
  const reason = text(r.ctx, 'reason', b.reason, 10, 300);
  const bound = l.landlords.map((x) => {
    const a = agreementOf(r.st, x.ownerId);
    const v = versionOn(a, from);
    if (!a || !v) problem(r.ctx, 409, 'lease_blocked', 'rentals:problems.leaseBlocked', { _: [{ code: 'rentals:blocker.agreement_unsigned' }] });
    if (v.model !== l.model) problem(r.ctx, 409, 'lease_blocked', 'rentals:problems.leaseBlocked', { _: [{ code: 'rentals:blocker.model_mismatch' }] });
    return { agreementId: a.id, version: v.n };
  });
  const n = l.versions.length + 1;
  l.versions.push({ n, from, to, rent: money(rent), dueDay: l.versions.at(-1)!.dueDay, reason: 'renewed', ...who(r), at: r.now, agreements: bound });
  l.history.push(stamp(r, 'lease_renewed', { note: reason, values: { version: String(n), to, rent: money(rent).amount } }));
  idem.remember(l.id);
  save(r);
  return leaseView(r, l);
}

/** RNT-008: an early end on or after today and before the current end; no later rent is scheduled. */
function terminateLease(r: R): LeaseView {
  const l = leaseToChange(r);
  if (leaseState(l, r.today) !== 'active' || l.termination) refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  const b = body<LeaseTerminateInput>(r.ctx);
  const date = str(b.date);
  if (!isDate(date)) invalid(r.ctx, 'date', 'rentals:errors.date');
  if (date < r.today || date >= leaseEnd(l)) invalid(r.ctx, 'date', 'rentals:errors.terminationDate');
  const reason = text(r.ctx, 'reason', b.reason, 10, 300);
  l.termination = { date, reason, byName: r.me.name, at: r.now };
  l.history.push(stamp(r, 'lease_terminated', { note: reason, values: { date } }));
  save(r);
  return leaseView(r, l);
}

// ---------------------------------------------------------------------------------------------
// Rent roll (RNT-004): preview and approval; posting is not connected
// ---------------------------------------------------------------------------------------------

function periodParam(r: R): string {
  const period = r.ctx.params.period ?? q(r.ctx, 'period');
  if (!MONTH.test(period)) invalid(r.ctx, 'period', 'rentals:errors.month');
  return period;
}

function previewRoll(r: R): RentRollView {
  official(r);
  if (!tenantWhole(r)) refuse(r.ctx, 403, 'other_sites', 'otherSites');
  const period = periodParam(r);
  const idem = idempotent(r, 'roll.preview', period, {});
  if (idem.replay) return rollView(r, period);
  if (!periodAllowed(r, period)) refuse(r.ctx, 409, 'period_not_allowed', 'periodNotAllowed');
  const roll = rollOf(r, period);
  if (roll?.state === 'approved') refuse(r.ctx, 409, 'roll_approved', 'rollApproved');
  const lines = rollLinesFor(r, period);
  if (!lines.length) refuse(r.ctx, 409, 'no_lines', 'noLines');
  const fp = rollFingerprint(lines);
  const total = money(sum(lines.map((l) => paisa(l.amount)))).amount;
  if (roll) {
    if (roll.fingerprint !== fp) {
      Object.assign(roll, { version: roll.version + 1, lines, fingerprint: fp });
      roll.history.push(stamp(r, 'roll_previewed', { values: { version: String(roll.version), total } }));
    }
    if (!roll.makers.includes(r.me.principalId)) {
      roll.makers.push(r.me.principalId);
      roll.makerNames.push(r.me.name);
    }
  } else {
    const created: StoredRoll = { period, state: 'draft', version: 1, lines, fingerprint: fp, preparedBy: r.me.principalId, preparedByName: r.me.name, preparedAt: r.now, makers: [r.me.principalId], makerNames: [r.me.name], history: [stamp(r, 'roll_previewed', { values: { version: '1', total } })] };
    r.st.rolls.push(created);
  }
  idem.remember(period);
  save(r);
  return rollView(r, period);
}

/** Approving freezes the demand schedule. It is not an invoice, a receipt or a payment. */
function approveRoll(r: R): RentRollView {
  official(r);
  if (!tenantWhole(r)) refuse(r.ctx, 403, 'other_sites', 'otherSites');
  const period = periodParam(r);
  const roll = rollOf(r, period);
  if (!roll) notFound(r.ctx);
  if (roll.state !== 'draft') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  if (roll.makers.includes(r.me.principalId)) refuse(r.ctx, 403, 'maker_checker_required', 'makerChecker');
  if (isRollStale(r, roll)) refuse(r.ctx, 409, 'roll_stale', 'rollStale');
  const b = body<{ acknowledge: boolean; note: string }>(r.ctx);
  if (b.acknowledge !== true) invalid(r.ctx, 'acknowledge', 'rentals:errors.acknowledge');
  const note = text(r.ctx, 'note', b.note, 0, 300);
  Object.assign(roll, { state: 'approved', approvedBy: r.me.principalId, approvedByName: r.me.name, approvedAt: r.now, ...(note ? { approvalNote: note } : {}) });
  roll.history.push(stamp(r, 'roll_approved', { ...(note ? { note } : {}), values: { version: String(roll.version), total: money(sum(roll.lines.map((l) => paisa(l.amount)))).amount } }));
  save(r);
  return rollView(r, period);
}

/**
 * RNT-004 posting (PARTIAL): the shared C.1/C.2 invoice engine has no lease billing subject, so an
 * approved roll is refused honestly. Nothing is created: no invoice, receivable, receipt or "paid".
 */
function postRoll(r: R): never {
  official(r);
  if (!tenantWhole(r)) refuse(r.ctx, 403, 'other_sites', 'otherSites');
  const roll = rollOf(r, periodParam(r));
  if (!roll) notFound(r.ctx);
  if (roll.state !== 'approved') refuse(r.ctx, 409, 'state_changed', 'stateChanged');
  refuse(r.ctx, 409, 'posting_unavailable', 'postingUnavailable');
}

// ---------------------------------------------------------------------------------------------
// Owner statements (RNT-005)
// ---------------------------------------------------------------------------------------------

function statementsList(r: R): OwnerStatementsList {
  const periods: string[] = [];
  for (let m = monthOf(licenceStart(r)); m <= monthOf(r.today); m = nextMonth(m)) periods.push(m);
  const owners = r.st.owners.filter((o) => ownerVisible(r, o.id) && periods.some((p) => statementOwners(r, p).some((x) => x.id === o.id)));
  return {
    owners: owners.map((o) => ({
      id: o.id,
      ref: o.ref,
      name: o.name,
      model: versionOn(agreementOf(r.st, o.id), r.today)?.model ?? null,
      sites: ownerSites(r, o.id).filter((s) => r.scope.has(s)).map((s) => siteName(r.st, s)),
      scopeLimited: !ownerWhole(r, o.id),
      // Issue #17 follow-up: a statement of hidden sites only is not listed (no id, ref or period).
      issued: r.st.statements.filter((s) => s.ownerId === o.id && officeKnows(r, s)).map((s) => ({ id: s.id, ref: s.ref, period: s.period })),
    })),
    periods: periods.reverse(),
    today: r.today,
  };
}

function statementOf(r: R): OwnerStatementView {
  const ownerId = q(r.ctx, 'owner');
  const period = q(r.ctx, 'period');
  if (!ownerVisible(r, ownerId) || !MONTH.test(period) || period < monthOf(licenceStart(r)) || period > monthOf(r.today)) notFound(r.ctx);
  if (!statementOwners(r, period).some((o) => o.id === ownerId)) notFound(r.ctx);
  return statementView(r, ownerId, period);
}

/** Issuing freezes the statement as it stands (an immutable snapshot the landlord can open). */
function issueStatement(r: R): OwnerStatementView {
  const { ctx } = official(r);
  const b = body<OwnerStatementIssueInput>(ctx);
  const ownerId = str(b.ownerId);
  if (!ownerOf(r.st, ownerId) || !ownerVisible(r, ownerId)) invalid(ctx, 'ownerId', 'forms:errors.required');
  wholeOwner(r, ownerId);
  const period = str(b.period);
  const idem = idempotent(r, 'statement.issue', ownerId, { period });
  if (idem.replay) return statementView(r, ownerId, replayed(r, r.st.statements.find((s) => s.id === idem.replay && s.ownerId === ownerId))!.period);
  if (!MONTH.test(period) || period < monthOf(licenceStart(r))) invalid(ctx, 'period', 'rentals:errors.month');
  if (period > monthOf(r.today)) invalid(ctx, 'period', 'rentals:errors.futurePeriod');
  if (!statementOwners(r, period).some((o) => o.id === ownerId)) invalid(ctx, 'ownerId', 'rentals:errors.noAgreement');
  // The issuer holds every site of the owner (checked above), so the stored statement is theirs to know.
  const issued = storedStatementOf(r.st, ownerId, period);
  if (issued) refuse(ctx, 409, 'already_issued', 'alreadyIssued', { ref: issued.ref });
  const { body: snapshot, openingBySite } = statementBody(r.st, ownerId, period, r.today);
  const { id, ref } = nextRent(r.st, 'statement');
  r.st.statements.push({ id, ref, ownerId, period, body: snapshot, openingBySite, issuedBy: r.me.principalId, issuedByName: r.me.name, issuedAt: r.now, history: [stamp(r, 'statement_issued', { values: { period, closing: snapshot.totals.closing.amount } })] });
  idem.remember(id);
  save(r);
  return statementView(r, ownerId, period);
}

// ---------------------------------------------------------------------------------------------
// Owner payout instructions (RNT-006): instructions only, never a payment
// ---------------------------------------------------------------------------------------------

function payoutsView(r: R): PayoutsView {
  const owners = r.st.owners.filter((o) => ownerVisible(r, o.id) && versionOn(agreementOf(r.st, o.id), r.today));
  const shown = r.st.payouts.filter((p) => ownerWhole(r, p.ownerId));
  const counts = { awaiting_approval: 0, approved: 0, rejected: 0, cancelled: 0 } as PayoutsView['counts'];
  for (const p of shown) counts[p.state] += 1;
  const prepare = holds(r, 'owner_payout.prepare');
  return {
    owners: owners.map((o) => {
      const whole = ownerWhole(r, o.id);
      const pay = payable(r.st, o.id, r.today);
      const holdsList = payoutHolds(r, o);
      return {
        id: o.id,
        ref: o.ref,
        name: o.name,
        model: versionOn(agreementOf(r.st, o.id), r.today)?.model ?? null,
        ...(whole ? { closing: money(pay.closing), pending: money(pay.pending), available: money(pay.available) } : {}),
        // Issue #18: the owner's masked account only for those who prepare or approve payouts.
        ...(whole && (prepare || holds(r, 'owner_payout.approve')) ? { beneficiary: o.beneficiary } : {}),
        holds: holdsList,
        canPrepare: prepare && whole && holdsList.length === 0 && !conflicted(r, o),
      };
    }),
    instructions: shown.sort((a, b) => b.preparedAt.localeCompare(a.preparedAt)).map((p) => payoutView(r, p)),
    counts,
    settlementAvailable: false,
    scopeLimited: owners.some((o) => !ownerWhole(r, o.id)),
  };
}

function findPayout(r: R): StoredPayout {
  const p = r.st.payouts.find((x) => x.id === r.ctx.params.id);
  // An owner's instruction is whole-owner money: a reader without every site of the owner never sees it.
  if (!p || !ownerWhole(r, p.ownerId)) notFound(r.ctx);
  return p;
}

const HOLD_REFUSAL = { principal_model: ['principal_model', 'principalModel'], no_collection_authority: ['no_collection_authority', 'noCollectionAuthority'], beneficiary_unverified: ['beneficiary_unverified', 'beneficiaryUnverified'] } as const;

function preparePayout(r: R): PayoutView {
  const { ctx } = official(r);
  const b = body<PayoutInput>(ctx);
  const owner = ownerOf(r.st, str(b.ownerId));
  if (!owner || !ownerVisible(r, owner.id) || !versionOn(agreementOf(r.st, owner.id), r.today)) invalid(ctx, 'ownerId', 'forms:errors.required');
  wholeOwner(r, owner.id);
  if (conflicted(r, owner)) refuse(ctx, 403, 'own_record', 'ownRecord');
  const idem = idempotent(r, 'payout.prepare', owner.id, b);
  if (idem.replay) return payoutView(r, replayed(r, r.st.payouts.find((p) => p.id === idem.replay && ownerWhole(r, p.ownerId))));
  for (const h of payoutHolds(r, owner)) {
    if (h in HOLD_REFUSAL) {
      const [code, key] = HOLD_REFUSAL[h as keyof typeof HOLD_REFUSAL];
      refuse(ctx, 409, code, key);
    }
  }
  const value = amount(ctx, 'amount', b.amount);
  const { available } = payable(r.st, owner.id, r.today);
  // Never more than the verified (settled) payable left after every pending instruction.
  if (!instructionAllowed(value, available)) refuse(ctx, 409, 'exceeds_available', 'exceedsAvailable', { available: money(available).amount });
  const note = text(ctx, 'note', b.note, 5, 300);
  const { id, ref } = nextRent(r.st, 'payout');
  const p: StoredPayout = { id, ref, ownerId: owner.id, amount: money(value), beneficiary: { ...owner.beneficiary }, note, state: 'awaiting_approval', preparedBy: r.me.principalId, preparedByName: r.me.name, preparedAt: r.now, history: [stamp(r, 'payout_prepared', { values: { amount: money(value).amount } })] };
  r.st.payouts.push(p);
  idem.remember(id);
  save(r);
  return payoutView(r, p);
}

/** Approving an instruction is not sending or paying it: cash and the owner payable do not change. */
function approvePayout(r: R): PayoutView {
  const { ctx } = official(r);
  const p = findPayout(r);
  if (p.state !== 'awaiting_approval') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (p.preparedBy === r.me.principalId) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  if (conflicted(r, ownerOf(r.st, p.ownerId))) refuse(ctx, 403, 'own_record', 'ownRecord');
  const pay = payable(r.st, p.ownerId, r.today);
  // Checked again: the verified payable may have changed since the instruction was prepared.
  if (paisa(p.amount) > pay.closing - (pay.pending - paisa(p.amount))) refuse(ctx, 409, 'exceeds_available', 'exceedsAvailable', { available: money(pay.closing - (pay.pending - paisa(p.amount))).amount });
  const b = body<{ acknowledge: boolean; note: string }>(ctx);
  if (b.acknowledge !== true) invalid(ctx, 'acknowledge', 'rentals:errors.acknowledge');
  const note = text(ctx, 'note', b.note, 0, 300);
  Object.assign(p, { state: 'approved', approvedBy: r.me.principalId, approvedByName: r.me.name, approvedAt: r.now });
  p.history.push(stamp(r, 'payout_approved', note ? { note } : {}));
  save(r);
  return payoutView(r, p);
}

function rejectPayout(r: R): PayoutView {
  const { ctx } = official(r);
  const p = findPayout(r);
  if (p.state !== 'awaiting_approval') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (p.preparedBy === r.me.principalId) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  Object.assign(p, { state: 'rejected', rejectedByName: r.me.name, rejectedAt: r.now, rejectReason: reason });
  p.history.push(stamp(r, 'payout_rejected', { note: reason }));
  save(r);
  return payoutView(r, p);
}

function cancelPayout(r: R): PayoutView {
  const { ctx } = official(r);
  const p = findPayout(r);
  if (p.state !== 'awaiting_approval' && p.state !== 'approved') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  Object.assign(p, { state: 'cancelled', cancelledByName: r.me.name, cancelledAt: r.now, cancelReason: reason });
  p.history.push(stamp(r, 'payout_cancelled', { note: reason }));
  save(r);
  return payoutView(r, p);
}

// ---------------------------------------------------------------------------------------------
// Settings (RNT-007): versioned management agreements
// ---------------------------------------------------------------------------------------------

function settings(r: R): RentalSettings {
  return {
    agreements: r.st.agreements.filter((a) => ownerVisible(r, a.ownerId)).map((a) => agreementView(r, a)),
    templates: [...RENT_TEMPLATES],
    feesLicensed: !!r.ctx.access?.features.includes('rentals.management_fees'),
    canConfigure: holds(r, 'rentals.configure'),
    today: r.today,
  };
}

function findAgreement(r: R) {
  const a = r.st.agreements.find((x) => x.id === r.ctx.params.id);
  if (!a || !ownerVisible(r, a.ownerId)) notFound(r.ctx);
  return a;
}

/**
 * Drafting a new version (or replacing the draft): never effective before today, so no historical
 * lease, rent roll or statement is rewritten. Approval by a second person makes it active (or
 * scheduled); a version without a signed agreement on file can never be approved.
 */
function draftVersion(r: R): AgreementView {
  const { ctx } = official(r);
  const a = findAgreement(r);
  wholeOwner(r, a.ownerId);
  const b = body<AgreementVersionInput>(ctx);
  const idem = idempotent(r, 'agreement.draft', a.id, b);
  if (idem.replay) return agreementView(r, a);
  const effectiveFrom = str(b.effectiveFrom);
  if (!isDate(effectiveFrom)) invalid(ctx, 'effectiveFrom', 'rentals:errors.date');
  if (effectiveFrom < r.today) invalid(ctx, 'effectiveFrom', 'rentals:errors.noBackdating');
  const model = str(b.model);
  if (!(ISSUING_MODELS as readonly string[]).includes(model)) invalid(ctx, 'model', 'forms:errors.required');
  const fee = basisPoints(str(typeof b.feePct === 'number' ? String(b.feePct) : b.feePct));
  if (fee === null || fee > 3000n) invalid(ctx, 'feePct', 'rentals:errors.feePct');
  const holding = str(b.depositHolding);
  if (!(DEPOSIT_HOLDINGS as readonly string[]).includes(holding)) invalid(ctx, 'depositHolding', 'forms:errors.required');
  // Agent: the deposit sits in the client deposit account; principal: in the owner's own account.
  if ((model === 'agent') !== (holding === 'client_deposit_account')) invalid(ctx, 'depositHolding', 'rentals:errors.depositHolding');
  const months = typeof b.depositMaxMonths === 'number' ? b.depositMaxMonths : Number(str(b.depositMaxMonths));
  if (!Number.isInteger(months) || months < 0 || months > 3) invalid(ctx, 'depositMaxMonths', 'rentals:errors.depositMonths');
  if (typeof b.collectOnBehalf !== 'boolean') invalid(ctx, 'collectOnBehalf', 'forms:errors.required');
  if (model === 'principal' && b.collectOnBehalf) invalid(ctx, 'collectOnBehalf', 'rentals:errors.principalCollects');
  const reference = str(b.signedReference);
  const signedOn = str(b.signedDate);
  if (reference || signedOn) {
    if (reference.length < 3 || reference.length > 60) invalid(ctx, 'signedReference', 'rentals:errors.reference');
    if (!isDate(signedOn) || signedOn > r.today) invalid(ctx, 'signedDate', 'rentals:errors.signedDate');
  }
  const note = text(ctx, 'note', b.note, 0, 300);
  const owner = ownerOf(r.st, a.ownerId)!;
  const draft = draftOf(a);
  const subLedger = a.versions.find((v) => v.subLedger)?.subLedger ?? `OSL-${a.ref.slice(-4)}`;
  const version: StoredAgreementVersion = {
    n: draft?.n ?? Math.max(0, ...a.versions.map((v) => v.n)) + 1,
    effectiveFrom,
    model: model as AgreementVersionInput['model'],
    signed: reference ? { reference, date: signedOn } : null,
    collectOnBehalf: b.collectOnBehalf as boolean,
    feePct: `${fee / 100n}.${String(fee % 100n).padStart(2, '0')}`,
    depositHolding: holding as AgreementVersionInput['depositHolding'],
    depositMaxMonths: months,
    account: model === 'agent' ? { kind: 'client_money', label: 'Riverbend client money account (Demo)', last4: '4410', verified: true } : { kind: 'owner_account', label: `${owner.entity?.name ?? owner.name} — own account`, last4: owner.beneficiary.last4, verified: owner.beneficiary.verified },
    ...(model === 'agent' ? { subLedger } : {}),
    approved: false,
    draftedBy: r.me.principalId,
    draftedByName: r.me.name,
    draftedAt: r.now,
    ...(note ? { note } : {}),
  };
  a.versions = [...a.versions.filter((v) => v.approved), version];
  a.history.push(stamp(r, draft ? 'version_redrafted' : 'version_drafted', { values: { version: String(version.n) } }));
  idem.remember(a.id);
  save(r);
  return agreementView(r, a);
}

function approveVersion(r: R): AgreementView {
  const { ctx } = official(r);
  const a = findAgreement(r);
  wholeOwner(r, a.ownerId);
  const draft = draftOf(a);
  if (!draft) refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (draft.draftedBy === r.me.principalId) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  if (!draft.signed) refuse(ctx, 409, 'agreement_unsigned', 'agreementUnsigned');
  if (draft.effectiveFrom < r.today) refuse(ctx, 409, 'effective_past', 'effectivePast');
  if (body<{ acknowledge: boolean }>(ctx).acknowledge !== true) invalid(ctx, 'acknowledge', 'rentals:errors.acknowledge');
  Object.assign(draft, { approved: true, approvedBy: r.me.principalId, approvedByName: r.me.name, approvedAt: r.now });
  a.history.push(stamp(r, 'version_approved', { values: { version: String(draft.n) } }));
  save(r);
  return agreementView(r, a);
}

// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

const RENTALS = 'rentals' as const;
const read = (permission: Permission | readonly Permission[], feature?: 'rentals.owner_statements' | 'rentals.owner_payouts') => requires(RENTALS, permission, 'history_read', feature);
const change = (permission: Permission | readonly Permission[], feature?: 'rentals.owner_statements' | 'rentals.owner_payouts') => requires(RENTALS, permission, 'operational', feature);
const route = (path: string) => new RegExp(`^${path.replace(':id', '(?<id>[\\w-]+)').replace(':period', '(?<period>[\\w-]+)')}$`);

export const RENTALS_HANDLERS: Handler[] = [
  { method: 'GET', pattern: route('/rentals/leases'), access: read('lease.view'), handle: (ctx): LeasesList => leasesList(rentOf(ctx)) },
  { method: 'GET', pattern: route('/rentals/leases/export'), access: read('lease.view'), handle: (ctx): LeaseExport => exportLeases(rentOf(ctx)) },
  { method: 'GET', pattern: route('/rentals/leases/options'), access: change('lease.manage'), handle: (ctx): LeaseOptions => leaseOptions(rentOf(ctx)) },
  {
    method: 'GET',
    pattern: route('/rentals/leases/:id'),
    access: read('lease.view'),
    handle: (ctx): LeaseView => {
      const r = rentOf(ctx);
      return leaseView(r, findLease(r));
    },
  },
  { method: 'POST', pattern: route('/rentals/leases'), access: change('lease.manage'), handle: (ctx) => createLease(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/submit'), access: change('lease.manage'), handle: (ctx) => submitLease(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/activate'), access: change('lease.manage'), handle: (ctx) => activateLease(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/cancel'), access: change('lease.manage'), handle: (ctx) => cancelLease(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/authority'), access: change('lease.manage'), handle: (ctx) => recordAuthority(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/renew'), access: change('lease.manage'), handle: (ctx) => renewLease(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/leases/:id/terminate'), access: change('lease.manage'), handle: (ctx) => terminateLease(rentOf(ctx)) },

  { method: 'GET', pattern: route('/rentals/rent-roll'), access: read(['rent.bill', 'rent.approve']), handle: (ctx): RentRollView => {
    const r = rentOf(ctx);
    const period = q(ctx, 'period') || monthOf(r.today);
    if (!MONTH.test(period)) invalid(ctx, 'period', 'rentals:errors.month');
    return rollView(r, period);
  } },
  { method: 'POST', pattern: route('/rentals/rent-roll/:period/preview'), access: change('rent.bill'), handle: (ctx) => previewRoll(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/rent-roll/:period/approve'), access: change('rent.approve'), handle: (ctx) => approveRoll(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/rent-roll/:period/post'), access: change(['rent.bill', 'rent.approve']), handle: (ctx) => postRoll(rentOf(ctx)) },

  { method: 'GET', pattern: route('/rentals/owner-statements'), access: read('owner_statement.view', 'rentals.owner_statements'), handle: (ctx): OwnerStatementsList => statementsList(rentOf(ctx)) },
  { method: 'GET', pattern: route('/rentals/owner-statements/statement'), access: read('owner_statement.view', 'rentals.owner_statements'), handle: (ctx): OwnerStatementView => statementOf(rentOf(ctx)) },
  // Issue #17 (R4): issuing publishes the statement to the landlord, so it needs its own permission, checked
  // by the transport before any id is read (reading a statement, `owner_statement.view`, never issues one).
  { method: 'POST', pattern: route('/rentals/owner-statements/issue'), access: change('owner_statement.issue', 'rentals.owner_statements'), handle: (ctx) => issueStatement(rentOf(ctx)) },

  { method: 'GET', pattern: route('/rentals/payouts'), access: read(['owner_payout.prepare', 'owner_payout.approve', 'owner_statement.view'], 'rentals.owner_payouts'), handle: (ctx): PayoutsView => payoutsView(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/payouts'), access: change('owner_payout.prepare', 'rentals.owner_payouts'), handle: (ctx) => preparePayout(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/payouts/:id/approve'), access: change('owner_payout.approve', 'rentals.owner_payouts'), handle: (ctx) => approvePayout(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/payouts/:id/reject'), access: change('owner_payout.approve', 'rentals.owner_payouts'), handle: (ctx) => rejectPayout(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/payouts/:id/cancel'), access: change(['owner_payout.prepare', 'owner_payout.approve'], 'rentals.owner_payouts'), handle: (ctx) => cancelPayout(rentOf(ctx)) },

  { method: 'GET', pattern: route('/rentals/settings'), access: read('rentals.configure'), handle: (ctx): RentalSettings => settings(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/settings/agreements/:id/versions'), access: change('rentals.configure'), handle: (ctx) => draftVersion(rentOf(ctx)) },
  { method: 'POST', pattern: route('/rentals/settings/agreements/:id/approve'), access: change('rentals.configure'), handle: (ctx) => approveVersion(rentOf(ctx)) },
];


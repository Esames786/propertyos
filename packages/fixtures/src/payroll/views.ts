import type { Money, PayAccounting, PayBreakdown, PayDashboard, PayEvent, PayInstructionView, PayLineSummary, PayPeriodView, PayPolicy, PayRunBlocker, PayRunRef, PayRunView, PayVersion, Permission } from '@repo/contracts';
import { PAY_STATUTORY } from '@repo/contracts';
import { authorize, can, notFound, permits, type HandlerContext } from '../handler-types';
import { employeeVisible, scopeOfSites, type HrScope } from '../hr/scope';
import { hrState, type HrState, type StoredEmployee } from '../hr/state';
import { employeeOf, hrNow } from '../hr/views';
import { opsSite, siteRecord } from '../operations/site';
import { problem } from '../society/handlers';
import { money, paisa } from '../society/finance/model';
import { hrFingerprint, periodOf, runTotals, seedPayroll } from './compute';
import { proposedJournal } from './rules';
import { payrollState, type PayrollState, type StoredEvent, type StoredInstruction, type StoredLine, type StoredPeriod, type StoredRun, type StoredVersion } from './state';

/**
 * Gate S.2b read models and the request context. Every payroll endpoint needs the office app, a
 * society (a developer's payroll is Gate E: "not found"), the `payroll` add-on and `hr` licensed and
 * in force, and a payroll permission (the transport checks the add-on and the permission first).
 *
 * **Scope** follows S.2a. The payroll sites are the HR sites where both add-ons and the person's
 * data scope allow a record of that site and its legal entity, worked out on every request. Then:
 * - a period or run belongs to a legal entity, and is visible when one of the entity's sites is;
 * - a pay line follows its employee (HR's rule: one of their sites in scope, same legal entity);
 * - **acting** on a period, run or instruction needs every site of the legal entity (`whole`), so
 *   nobody prepares, approves or pays lines they cannot see. A reader with only some of the sites
 *   sees only those lines, with totals over them, and the view says it is limited (never how much
 *   is hidden).
 * Anything else is "not found", exactly like an id that was never issued.
 */

export interface P {
  ctx: HandlerContext;
  hr: HrState;
  pay: PayrollState;
  /** The payroll sites the person may see. */
  scope: HrScope;
  today: string;
  now: string;
  me: { principalId: string; name: string };
  /** The `payroll.loans` feature: advance and loan instalments are listed (and held). */
  loans: boolean;
}

export function payOf(ctx: HandlerContext): P {
  if (ctx.persona?.app !== 'backoffice') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const ops = opsSite(ctx);
  if (!ops.society) notFound(ctx);
  const hr = hrState(ctx, ops);
  const pay = payrollState(ctx, ops, hr, seedPayroll);
  const sites = hr.sites.filter((s) => permits(ctx, 'payroll', { siteId: s.siteId, legalEntityId: s.legalEntityId }) && permits(ctx, 'hr', { siteId: s.siteId, legalEntityId: s.legalEntityId }));
  if (!sites.length) {
    // The shared rule's own refusal for the organisation's site (payroll needs HR); anything else is
    // "not found", never a hint that records exist.
    authorize(ctx, 'payroll', siteRecord(ops));
    authorize(ctx, 'hr', siteRecord(ops));
    notFound(ctx);
  }
  return { ctx, hr, pay, scope: scopeOfSites(sites), today: ctx.at, now: hrNow(ctx), me: { principalId: ctx.persona!.principalId, name: ctx.persona!.displayName }, loans: !!ctx.access?.features.includes('payroll.loans') };
}

export const holds = (p: P, permission: Permission) => can(p.ctx, permission);

const entitySites = (p: P, legalEntityId: string) => p.hr.sites.filter((s) => s.legalEntityId === legalEntityId);
export const entityVisible = (p: P, legalEntityId: string) => entitySites(p, legalEntityId).some((s) => p.scope.has(s.siteId));
/** Every site of the legal entity is in the person's payroll scope. */
export const entityWhole = (p: P, legalEntityId: string) => {
  const sites = entitySites(p, legalEntityId);
  return sites.length > 0 && sites.every((s) => p.scope.has(s.siteId));
};
export const entityName = (p: P, legalEntityId: string) => p.hr.sites.find((s) => s.legalEntityId === legalEntityId)?.legalEntityName ?? '';
export const entityCode = (p: P, legalEntityId: string) => p.hr.sites.find((s) => s.legalEntityId === legalEntityId)?.code ?? 'PAY';

export const seesEmployee = (p: P, e: StoredEmployee | undefined) => !!e && employeeVisible(p.hr, p.scope, e, p.today);

/** The lines the person may see: all of them with the whole legal entity, else their staff's. */
export const visibleLines = (p: P, run: StoredRun) => (entityWhole(p, run.legalEntityId) ? run.lines : run.lines.filter((l) => seesEmployee(p, employeeOf(p.hr, l.employeeId))));

export const isOwnLine = (p: P, l: Pick<StoredLine, 'employeeId'>) => employeeOf(p.hr, l.employeeId)?.principalId === p.me.principalId;

// ---------------------------------------------------------------------------------------------
// Gate S.2b closure (GitHub Issue #16, P0-1): history as the reader may see it
// ---------------------------------------------------------------------------------------------

/** Event values that never carry pay or a person: a version number, a reference. */
const SAFE_VALUES: readonly string[] = ['version', 'ref'];
/** Run events whose words name an amount: a limited reader gets the same words without it. */
const LIMITED_TEXT = new Set(['run_submitted', 'run_approved']);
/** Versions about the whole run (not about one person). */
const RUN_WIDE = new Set(['prepared', 'recalculated']);

/**
 * Every event list, projected for the reader. Someone with every site of the employer gets the full
 * audit. Someone with only some of the sites gets, for each event:
 * - **about one person** (it names an employee): the event only if they may see that person;
 * - **about the run or instruction**: who and when and what, without any amount, total or other
 *   value except a version number or a reference, and without the free-text note (a note may name
 *   anyone or any amount).
 * Nothing is recalculated or invented: the events are the stored ones, with fields left out.
 */
export function projectEvents(p: P, events: readonly StoredEvent[], whole: boolean): PayEvent[] {
  return events.flatMap(({ employeeId, ...e }): PayEvent[] => {
    if (whole) return [e];
    if (employeeId) return seesEmployee(p, employeeOf(p.hr, employeeId)) ? [e] : [];
    const values = Object.fromEntries(Object.entries(e.values ?? {}).filter(([k]) => SAFE_VALUES.includes(k)));
    return [{ at: e.at, by: e.by, byName: e.byName, action: LIMITED_TEXT.has(e.action) ? `${e.action}_limited` : e.action, ...(Object.keys(values).length ? { values } : {}) }];
  });
}

/**
 * A run's versions, projected for the reader. With every site: everything. With only some sites:
 * the number, time, author and reason, never the employer-wide net or head count (no per-version
 * filtered totals exist, and none are made up); a change about one person names them only if the
 * reader may see them, and otherwise reads "Changed".
 */
export function projectVersions(p: P, versions: readonly StoredVersion[], whole: boolean): PayVersion[] {
  return versions.map(({ aboutId, ...v }): PayVersion => {
    if (whole) return v;
    const seen = !!aboutId && seesEmployee(p, employeeOf(p.hr, aboutId));
    return { n: v.n, at: v.at, byName: v.byName, reason: RUN_WIDE.has(v.reason) || seen ? v.reason : 'changed', ...(seen && v.about ? { about: v.about } : {}) };
  });
}

export const periodById = (p: P, id: string) => p.pay.periods.find((x) => x.id === id);
export const periodOfRun = (p: P, run: StoredRun) => p.pay.periods.find((x) => x.id === run.periodId)!;
export const liveRun = (p: P, period: StoredPeriod) => p.pay.runs.find((r) => r.periodId === period.id && r.state !== 'reversed');
export const liveInstruction = (p: P, run: StoredRun) => p.pay.instructions.find((i) => i.runId === run.id && i.state !== 'cancelled');

/** A draft or submitted run whose HR facts changed since its version was calculated. */
export function isStale(p: P, run: StoredRun): boolean {
  if (run.state !== 'draft' && run.state !== 'submitted') return false;
  return hrFingerprint(p.hr, p.pay, run.legalEntityId, periodOf(periodOfRun(p, run)), p.loans) !== run.fingerprint;
}

export const POLICIES: PayPolicy[] = [
  { key: 'proration', state: 'demo_rule' },
  { key: 'statutory', state: 'not_configured' },
  { key: 'overtime', state: 'not_configured' },
  { key: 'unpaid_leave', state: 'not_configured' },
  { key: 'absences', state: 'not_configured' },
  { key: 'advance_recovery', state: 'not_configured' },
];

const runRefOf = (p: P, run: StoredRun): PayRunRef => {
  const t = runTotals(visibleLines(p, run));
  return { id: run.id, ref: run.ref, state: run.state, version: run.version, net: money(t.net), included: t.included };
};

// ---------------------------------------------------------------------------------------------
// Periods (PAY-002)
// ---------------------------------------------------------------------------------------------

export function periodView(p: P, period: StoredPeriod): PayPeriodView {
  const whole = entityWhole(p, period.legalEntityId);
  const run = liveRun(p, period) ?? [...p.pay.runs].reverse().find((r) => r.periodId === period.id);
  const anotherOpen = p.pay.periods.some((x) => x.id !== period.id && x.legalEntityId === period.legalEntityId && x.state === 'open');
  const prepare = holds(p, 'payroll.prepare') && whole;
  const approve = holds(p, 'payroll.approve') && whole;
  const live = liveRun(p, period);
  const open = prepare && period.state === 'draft' && !anotherOpen;
  const close = approve && period.state === 'open' && live?.state === 'approved';
  const blocked: PayPeriodView['blocked'] =
    !whole && (holds(p, 'payroll.prepare') || holds(p, 'payroll.approve'))
      ? 'other_sites'
      : prepare && period.state === 'draft' && anotherOpen
        ? 'another_open'
        : approve && period.state === 'open' && live?.state !== 'approved'
          ? 'run_not_approved'
          : undefined;
  return {
    id: period.id,
    ref: period.ref,
    month: period.month,
    from: period.from,
    to: period.to,
    payDate: period.payDate,
    legalEntityId: period.legalEntityId,
    legalEntityName: entityName(p, period.legalEntityId),
    state: period.state,
    ...(run ? { run: runRefOf(p, run) } : {}),
    createdByName: period.createdByName,
    createdAt: period.createdAt,
    ...(period.openedByName ? { openedByName: period.openedByName, openedAt: period.openedAt! } : {}),
    ...(period.closedByName ? { closedByName: period.closedByName, closedAt: period.closedAt! } : {}),
    history: projectEvents(p, period.history, whole),
    actions: { open, close, prepareRun: prepare && period.state === 'open' && !live },
    ...(blocked ? { blocked } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Runs (PAY-003, PAY-005)
// ---------------------------------------------------------------------------------------------

export function lineSummary(p: P, l: StoredLine): PayLineSummary {
  const s = l.snapshot;
  return {
    employeeId: l.employeeId,
    employeeName: s.name,
    code: s.code,
    role: s.role,
    department: s.department,
    basis: s.basis,
    state: l.included ? 'included' : 'excluded',
    gross: s.gross,
    deductions: s.deductions,
    net: s.net,
    blockers: s.blockers,
    warnings: s.warnings,
    own: isOwnLine(p, l),
  };
}

export function runBlockers(p: P, run: StoredRun, lines: readonly StoredLine[], stale: boolean): PayRunBlocker[] {
  const out: PayRunBlocker[] = [];
  if (run.state !== 'draft' && run.state !== 'submitted') return out;
  if (periodOfRun(p, run).state !== 'open') out.push('period_not_open');
  if (stale) out.push('stale');
  const included = lines.filter((l) => l.included);
  if (!included.length) out.push('no_lines');
  if (included.some((l) => l.snapshot.blockers.length > 0)) out.push('line_blockers');
  return out;
}

/** Whether the person made any part of the run (prepared, recalculated, changed or submitted it). */
export const madeRun = (p: P, run: StoredRun) => run.makers.includes(p.me.principalId);
export const hasOwnLine = (p: P, run: StoredRun) => run.lines.some((l) => l.included && isOwnLine(p, l));

export function runView(p: P, run: StoredRun): PayRunView {
  const period = periodOfRun(p, run);
  const whole = entityWhole(p, run.legalEntityId);
  const lines = visibleLines(p, run);
  // A reader with only some sites never learns that HR changed somewhere else.
  const stale = whole && isStale(p, run);
  const blockers = runBlockers(p, run, lines, stale);
  const t = runTotals(lines);
  const ins = liveInstruction(p, run);
  const prepare = holds(p, 'payroll.prepare') && whole;
  const approve = holds(p, 'payroll.approve') && whole;
  const draft = run.state === 'draft';
  const submitted = run.state === 'submitted';
  const approved = run.state === 'approved';
  const maker = madeRun(p, run);
  const ownLine = hasOwnLine(p, run);
  const actions = {
    recompute: prepare && draft && period.state === 'open',
    edit: prepare && draft && period.state === 'open',
    submit: prepare && draft && blockers.length === 0,
    withdraw: prepare && submitted,
    approve: approve && submitted && !maker && !ownLine && !stale,
    return: approve && submitted && run.submittedBy !== p.me.principalId,
    reverse: approve && approved && !maker && period.state !== 'closed' && !ins,
    instruct: prepare && approved && !ins,
    export: true,
  };
  const blocked: PayRunView['blocked'] =
    !whole && (holds(p, 'payroll.prepare') || holds(p, 'payroll.approve'))
      ? 'other_sites'
      : approve && submitted && maker
        ? 'own_run'
        : approve && submitted && ownLine
          ? 'own_line'
          : approve && approved && ins && !maker
            ? 'instruction_live'
            : approve && approved && period.state === 'closed'
              ? 'period_closed'
              : undefined;
  return {
    id: run.id,
    ref: run.ref,
    periodId: period.id,
    periodRef: period.ref,
    month: period.month,
    from: period.from,
    to: period.to,
    payDate: period.payDate,
    legalEntityName: entityName(p, run.legalEntityId),
    periodState: period.state,
    state: run.state,
    version: run.version,
    stale,
    scopeLimited: !whole,
    totals: { gross: money(t.gross), deductions: money(t.deductions), net: money(t.net), included: t.included, excluded: t.excluded, blocked: t.blocked },
    lines: lines.map((l) => lineSummary(p, l)),
    runBlockers: blockers,
    policies: POLICIES,
    versions: projectVersions(p, run.versions, whole),
    preparedByName: run.preparedByName,
    preparedAt: run.preparedAt,
    ...(run.submittedByName ? { submittedByName: run.submittedByName, submittedAt: run.submittedAt! } : {}),
    ...(run.approvedByName ? { approvedByName: run.approvedByName, approvedAt: run.approvedAt! } : {}),
    ...(run.approvalNote && whole ? { approvalNote: run.approvalNote } : {}),
    ...(run.reversedByName ? { reversedByName: run.reversedByName, reversedAt: run.reversedAt!, ...(whole ? { reversalReason: run.reversalReason! } : {}) } : {}),
    makers: run.makerNames,
    ...(ins ? { instruction: { id: ins.id, ref: ins.ref, state: ins.state } } : {}),
    history: projectEvents(p, run.history, whole),
    actions,
    ...(blocked ? { blocked } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// One person's pay (PAY-004)
// ---------------------------------------------------------------------------------------------

export function breakdown(p: P, run: StoredRun, l: StoredLine): PayBreakdown {
  const s = l.snapshot;
  const period = periodOfRun(p, run);
  const whole = entityWhole(p, run.legalEntityId);
  const own = isOwnLine(p, l);
  const editable = holds(p, 'payroll.prepare') && whole && run.state === 'draft' && period.state === 'open' && !own;
  const blocked: PayBreakdown['blocked'] = !holds(p, 'payroll.prepare')
    ? undefined
    : !whole
      ? 'other_sites'
      : own
        ? 'own_line'
        : run.state === 'submitted'
          ? 'submitted'
          : run.state !== 'draft'
            ? 'frozen'
            : undefined;
  const e = employeeOf(p.hr, l.employeeId)!;
  const otherRuns = p.pay.runs
    .filter((r) => r.id !== run.id && entityVisible(p, r.legalEntityId) && r.lines.some((x) => x.employeeId === l.employeeId))
    .map((r) => ({ id: r.id, ref: r.ref, month: periodOfRun(p, r).month, state: r.state }));
  return {
    run: { id: run.id, ref: run.ref, state: run.state, version: run.version, month: period.month, from: period.from, to: period.to, stale: whole && isStale(p, run) },
    employee: { id: l.employeeId, name: s.name, code: s.code, role: s.role, department: s.department, employmentType: s.employmentType, legalEntityName: entityName(p, e.legalEntityId), startDate: s.startDate, ...(s.endDate ? { endDate: s.endDate } : {}) },
    state: l.included ? 'included' : 'excluded',
    basis: s.basis,
    employedDays: s.employedDays,
    periodDays: s.periodDays,
    ...(s.basis === 'daily'
      ? { days: { ...(l.daysConfirmed ? { confirmed: { days: l.daysConfirmed.days, reason: l.daysConfirmed.reason, byName: l.daysConfirmed.byName, at: l.daysConfirmed.at } } : {}), recorded: s.recordedDays, ...(s.recordedFrom ? { recordedFrom: s.recordedFrom } : {}) } }
      : {}),
    earnings: s.earnings.map((x) => ({ kind: x.kind, ...(x.allowance ? { allowance: x.allowance } : {}), rate: x.rate, amount: x.amount, ...(x.days ? { days: x.days } : {}) })),
    bonuses: l.bonuses.map((b) => ({ id: b.id, label: b.label, amount: b.amount, reason: b.reason, addedByName: b.addedByName, addedAt: b.addedAt })),
    deductions: { applied: [], held: s.held.map((h) => ({ ...h, reason: 'advance_unverified' as const })), statutory: PAY_STATUTORY.map((key) => ({ key, state: 'not_configured' as const })), unpaidLeaveDays: s.unpaidLeaveDays, absences: s.absences },
    gross: s.gross,
    deductionsTotal: s.deductions,
    net: s.net,
    ...(l.exclusion ? { exclusion: { reason: l.exclusion.reason, byName: l.exclusion.byName, at: l.exclusion.at } } : {}),
    blockers: s.blockers,
    warnings: s.warnings,
    payment: { method: s.method, ...(s.account ? { account: s.account, accountVerified: !!s.accountVerified } : {}) },
    own,
    otherRuns,
    history: projectEvents(p, l.history, true),
    actions: {
      confirmDays: editable && s.basis === 'daily' && l.included,
      addBonus: editable && l.included && !!p.ctx.access?.features.includes('payroll.bonuses'),
      removeBonus: editable && l.bonuses.length > 0,
      exclude: editable && l.included,
      include: editable && !l.included,
    },
    ...(blocked ? { blocked } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Disbursement instructions (PAY-006) and accounting (PAY-007)
// ---------------------------------------------------------------------------------------------

/** The instruction's lines the person may see (all of them with the whole legal entity). */
function instructionLines<T extends { employeeId: string }>(p: P, ins: StoredInstruction, list: readonly T[]): T[] {
  return entityWhole(p, ins.legalEntityId) ? [...list] : list.filter((l) => seesEmployee(p, employeeOf(p.hr, l.employeeId)));
}

export const ownInInstruction = (p: P, ins: StoredInstruction) => [...ins.lines, ...ins.held].some((l) => employeeOf(p.hr, l.employeeId)?.principalId === p.me.principalId);

export function instructionView(p: P, ins: StoredInstruction): PayInstructionView {
  const run = p.pay.runs.find((r) => r.id === ins.runId)!;
  const whole = entityWhole(p, ins.legalEntityId);
  const lines = instructionLines(p, ins, ins.lines);
  const held = instructionLines(p, ins, ins.held);
  const own = ownInInstruction(p, ins);
  const preparer = ins.preparedBy === p.me.principalId;
  const approve = holds(p, 'payroll.approve') && whole;
  const prepare = holds(p, 'payroll.prepare') && whole;
  const blocked: PayInstructionView['blocked'] =
    !whole && (holds(p, 'payroll.prepare') || holds(p, 'payroll.approve')) ? 'other_sites' : approve && ins.state === 'prepared' && preparer ? 'own_instruction' : approve && ins.state === 'prepared' && own ? 'own_line' : undefined;
  return {
    id: ins.id,
    ref: ins.ref,
    runId: run.id,
    runRef: run.ref,
    month: periodOfRun(p, run).month,
    legalEntityName: entityName(p, ins.legalEntityId),
    state: ins.state,
    total: whole ? ins.total : money(lines.reduce((s, l) => s + paisa(l.amount), 0n)),
    lines: lines.map((l) => ({ employeeId: l.employeeId, employeeName: l.employeeName, method: l.method, ...(l.account ? { account: l.account } : {}), amount: l.amount, settlement: 'not_settled' as const })),
    held,
    scopeLimited: !whole,
    preparedByName: ins.preparedByName,
    preparedAt: ins.preparedAt,
    ...(ins.approvedByName ? { approvedByName: ins.approvedByName, approvedAt: ins.approvedAt! } : {}),
    ...(ins.sentByName ? { sentByName: ins.sentByName, sentAt: ins.sentAt! } : {}),
    ...(ins.cancelledByName ? { cancelledByName: ins.cancelledByName, cancelledAt: ins.cancelledAt!, ...(whole ? { cancelReason: ins.cancelReason! } : {}) } : {}),
    history: projectEvents(p, ins.history, whole),
    actions: {
      approve: approve && ins.state === 'prepared' && !preparer && !own,
      send: prepare && ins.state === 'approved',
      cancel: (prepare || approve) && (ins.state === 'prepared' || ins.state === 'approved'),
    },
    ...(blocked ? { blocked } : {}),
  };
}

/** Runs the person may see, newest period first. */
export const visibleRuns = (p: P) => p.pay.runs.filter((r) => entityVisible(p, r.legalEntityId)).sort((a, b) => periodOfRun(p, b).month.localeCompare(periodOfRun(p, a).month) || b.preparedAt.localeCompare(a.preparedAt));

export function accounting(p: P, runId?: string): PayAccounting {
  const runs = visibleRuns(p).filter((r) => (r.state === 'approved' || r.state === 'reversed') && (!runId || r.id === runId));
  let approved = 0n;
  let instructed = 0n;
  const rows = runs.map((r) => {
    const t = runTotals(visibleLines(p, r));
    const j = proposedJournal(t.gross, t.net, t.deductions);
    const lines = j.lines.map((l) => ({ account: l.account, side: l.side, amount: money(l.paisa) }));
    if (r.state === 'approved') {
      approved += t.net;
      const ins = liveInstruction(p, r);
      if (ins && (ins.state === 'approved' || ins.state === 'sent_simulated')) instructed += instructionLines(p, ins, ins.lines).reduce((s, l) => s + paisa(l.amount), 0n);
    }
    return {
      runId: r.id,
      runRef: r.ref,
      month: periodOfRun(p, r).month,
      state: r.state as 'approved' | 'reversed',
      proposed: lines,
      ...(r.state === 'reversed' ? { reversal: lines.map((l) => ({ ...l, side: l.side === 'debit' ? ('credit' as const) : ('debit' as const) })) } : {}),
      balanced: j.balanced,
      scopeLimited: !entityWhole(p, r.legalEntityId),
      statutory: [...PAY_STATUTORY],
    };
  });
  return { runs: rows, posted: [], gaps: ['no_ledger', 'no_category', 'no_settlement'], obligation: { approved: money(approved), instructed: money(instructed), settledVerified: null } };
}

// ---------------------------------------------------------------------------------------------
// Dashboard (PAY-001)
// ---------------------------------------------------------------------------------------------

const PAY = '/backoffice/pay';
export const PAY_HREF = {
  periods: `${PAY}/payroll-periods`,
  run: (id: string, filter?: string) => `${PAY}/payroll-run-workspace?run=${id}${filter ? `&filter=${filter}` : ''}`,
  finalisation: (id?: string) => `${PAY}/payroll-finalization${id ? `?run=${id}` : ''}`,
  disbursement: (id?: string) => `${PAY}/payroll-disbursement-status${id ? `?run=${id}` : ''}`,
  accounting: (id?: string) => `${PAY}/payroll-accounting${id ? `?run=${id}` : ''}`,
};

export function dashboard(p: P): PayDashboard {
  const periods = p.pay.periods.filter((x) => entityVisible(p, x.legalEntityId)).sort((a, b) => a.month.localeCompare(b.month));
  const current = periods.find((x) => x.state === 'open') ?? [...periods].reverse().find((x) => x.state === 'closed') ?? periods[0];
  const next = current ? periods.find((x) => x.legalEntityId === current.legalEntityId && x.month > current.month) : undefined;
  const run = current ? (liveRun(p, current) ?? undefined) : undefined;
  const view = run ? runView(p, run) : undefined;
  const runs = visibleRuns(p);
  const acc = accounting(p);
  const instructions = runs.map((r) => liveInstruction(p, r)).filter((i): i is StoredInstruction => !!i).map((i) => instructionView(p, i));
  const awaitingRuns = runs.filter((r) => r.state === 'submitted').map((r) => runView(p, r)).filter((v) => v.actions.approve);
  const awaitingIns = instructions.filter((i) => i.actions.approve);
  const preparerWork = holds(p, 'payroll.prepare')
    ? runs.map((r) => runView(p, r)).filter((v) => (v.state === 'draft' && v.runBlockers.length > 0) || v.actions.instruct).length + instructions.filter((i) => i.actions.send).length
    : 0;
  const attention: PayDashboard['attention'] = [];
  if (view && view.totals.blocked > 0) attention.push({ kind: 'blocked_lines', count: view.totals.blocked, href: PAY_HREF.run(view.id, 'blocked') });
  if (view?.stale) attention.push({ kind: 'stale', href: PAY_HREF.run(view.id) });
  if (awaitingRuns.length) attention.push({ kind: 'awaiting_run', count: awaitingRuns.length, href: PAY_HREF.finalisation(awaitingRuns[0]!.id) });
  if (awaitingIns.length) attention.push({ kind: 'awaiting_instruction', count: awaitingIns.length, href: PAY_HREF.disbursement(awaitingIns[0]!.runId) });
  const heldBank = view ? view.lines.filter((l) => l.state === 'included' && l.warnings.includes('bank_unverified')).length : 0;
  if (view && heldBank) attention.push({ kind: 'held_bank', count: heldBank, href: PAY_HREF.run(view.id, 'warnings') });
  if (view) attention.push({ kind: 'statutory', href: `${PAY_HREF.run(view.id)}#policies` });
  const limited = periods.some((x) => !entityWhole(p, x.legalEntityId));
  return {
    today: p.today,
    legalEntityName: current ? entityName(p, current.legalEntityId) : (p.scope.sites[0]?.legalEntityName ?? ''),
    scopeLimited: limited,
    ...(current ? { period: { id: current.id, ref: current.ref, month: current.month, state: current.state, payDate: current.payDate } } : {}),
    ...(next ? { nextPeriod: { id: next.id, ref: next.ref, month: next.month, state: next.state } } : {}),
    ...(view ? { run: { id: view.id, ref: view.ref, state: view.state, version: view.version, net: view.totals.net, included: view.totals.included, stale: view.stale, blocked: view.totals.blocked, ...(view.submittedByName ? { submittedByName: view.submittedByName } : {}) } } : {}),
    kpis: {
      staffInRun: view?.totals.included ?? 0,
      blockedLines: view?.totals.blocked ?? 0,
      approvedObligation: acc.obligation.approved,
      instructed: acc.obligation.instructed,
      settledVerified: null,
      awaitingMe: awaitingRuns.length + awaitingIns.length + preparerWork,
    },
    attention,
    canPrepare: holds(p, 'payroll.prepare'),
    canApprove: holds(p, 'payroll.approve'),
  };
}

export const ZERO: Money = { amount: '0.00', currency: 'PKR' };

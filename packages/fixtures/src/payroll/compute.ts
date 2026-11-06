import { daysBetween } from '../hr/rules';
import { pkt, type HrState, type StoredEmployee } from '../hr/state';
import { money, paisa } from '../society/finance/model';
import { computeLine, fingerprint, totalsOf, type LineFacts, type LineResult, type Period } from './rules';
import { ev, nextPay, periodIds, runRef, SABA, seedTerms, type LineSnapshot, type PayrollState, type StoredLine, type StoredPeriod, type StoredRun, type StoredTerms, type StoredVersion } from './state';

/**
 * Gate S.2b: from the HR records to pay lines. A run's lines are the employees of its legal entity
 * whose employment overlaps the period; each is calculated from the HR facts (employment dates and
 * status, unpaid leave, recorded attendance, approved advances), the fictional pay terms and the
 * preparer's inputs. Every calculation is a new version of the run, and stores what it calculated:
 * an approved run is never recalculated, so later HR changes cannot alter an approved obligation.
 */

/** The pay terms in force during the period (the latest that started). */
export function termsFor(pay: PayrollState, employeeId: string, period: Pick<Period, 'from' | 'to'>): StoredTerms | undefined {
  return pay.terms.filter((t) => t.employeeId === employeeId && t.from <= period.to && (!t.to || t.to >= period.from)).sort((a, b) => b.from.localeCompare(a.from))[0];
}

/** Employees of the legal entity whose employment overlaps the period (in code order). */
export function periodEmployees(hr: HrState, legalEntityId: string, period: Pick<Period, 'from' | 'to'>): StoredEmployee[] {
  return hr.employees.filter((e) => e.legalEntityId === legalEntityId && e.startDate <= period.to && (!e.endDate || e.endDate >= period.from)).sort((a, b) => a.code.localeCompare(b.code));
}

const overlap = (from: string, to: string, p: Pick<Period, 'from' | 'to'>) => daysBetween(from > p.from ? from : p.from, to < p.to ? to : p.to);

/** The first day HR attendance was recorded at all (the roster started then). */
export function attendanceFrom(hr: HrState): string | undefined {
  const dates = hr.attendance.map((r) => hr.assignments.find((a) => a.id === r.assignmentId)?.date).filter((d): d is string => !!d);
  return dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : undefined;
}

export interface Facts extends LineFacts {
  recordedDays: number;
  recordedFrom?: string;
  account?: { last4: string; verified: boolean };
}

/** What the HR records say about one employee in the period. */
export function factsOf(hr: HrState, pay: PayrollState, e: StoredEmployee, period: Period, loans: boolean): Facts {
  const t = termsFor(pay, e.id, period);
  const leaveDays = (state: 'approved' | 'pending') => hr.leave.filter((l) => l.employeeId === e.id && l.type === 'unpaid' && l.state === state).reduce((n, l) => n + overlap(l.from, l.to, period), 0);
  const duties = new Map(hr.assignments.map((a) => [a.id, a]));
  const mine = hr.attendance
    .filter((r) => r.employeeId === e.id)
    .map((r) => ({ r, a: duties.get(r.assignmentId) }))
    .filter((x) => x.a && x.a.state === 'planned' && x.a.date >= period.from && x.a.date <= period.to);
  const recordedFrom = attendanceFrom(hr);
  return {
    terms: t
      ? { basis: t.basis, rate: paisa(t.rate), allowances: t.allowances.map((a) => ({ key: a.key, paisa: paisa(a.amount) })), method: t.method, accountVerified: !!t.account?.verified }
      : null,
    status: e.status,
    startDate: e.startDate,
    ...(e.endDate ? { endDate: e.endDate } : {}),
    unpaidLeaveDays: leaveDays('approved'),
    pendingUnpaidDays: leaveDays('pending'),
    absences: mine.filter((x) => x.r.state === 'absent').length,
    advances: loans
      ? hr.advances.filter((a) => a.employeeId === e.id && a.state === 'approved').map((a) => ({ id: a.id, ref: a.ref, kind: a.kind, paisa: paisa(a.amount), instalments: a.instalments, firstMonth: a.firstMonth }))
      : [],
    recordedDays: new Set(mine.filter((x) => x.r.state !== 'absent').map((x) => x.a!.date)).size,
    ...(recordedFrom ? { recordedFrom } : {}),
    ...(t?.account ? { account: { last4: t.account.last4, verified: t.account.verified } } : {}),
  };
}

/** The fingerprint of everything HR says about the period's people (a run is stale when it changes). */
export function hrFingerprint(hr: HrState, pay: PayrollState, legalEntityId: string, period: Period, loans: boolean): string {
  return fingerprint(periodEmployees(hr, legalEntityId, period).map((e) => [e.id, e.name, e.role, e.employmentType, factsOf(hr, pay, e, period, loans)]));
}

export function snapshotOf(e: StoredEmployee, f: Facts, r: LineResult): LineSnapshot {
  return {
    name: e.name,
    code: e.code,
    role: e.role,
    department: e.department,
    employmentType: e.employmentType,
    startDate: e.startDate,
    ...(e.endDate ? { endDate: e.endDate } : {}),
    basis: f.terms?.basis ?? null,
    method: f.terms?.method ?? null,
    ...(f.account ? { account: f.account.last4, accountVerified: f.account.verified } : {}),
    employedDays: r.employedDays,
    periodDays: r.periodDays,
    earnings: r.earnings.map((x) => ({ kind: x.kind, ...(x.allowance ? { allowance: x.allowance } : {}), rate: money(x.rate), amount: money(x.paisa), ...(x.days ? { days: x.days } : {}) })),
    bonus: money(r.bonus),
    gross: money(r.gross),
    deductions: money(r.deductions),
    net: money(r.net),
    held: r.held.map((h) => ({ advanceId: h.advanceId, ref: h.ref, kind: h.kind, instalment: h.instalment, of: h.of, amount: money(h.paisa) })),
    blockers: r.blockers,
    warnings: r.warnings,
    unpaidLeaveDays: f.unpaidLeaveDays,
    absences: f.absences,
    recordedDays: f.recordedDays,
    ...(f.recordedFrom ? { recordedFrom: f.recordedFrom } : {}),
  };
}

export const periodOf = (p: StoredPeriod): Period => ({ month: p.month, from: p.from, to: p.to });

/**
 * Calculates every line of the run from the current HR facts, keeping the preparer's inputs for
 * people still in it. Someone no longer in the period (moved to another employer, start date moved
 * later) leaves the run, and the run's history says so.
 */
export function calculate(hr: HrState, pay: PayrollState, period: StoredPeriod, run: StoredRun, loans: boolean): { lines: StoredLine[]; removed: Array<{ id: string; name: string }>; fingerprint: string } {
  const p = periodOf(period);
  const people = periodEmployees(hr, run.legalEntityId, p);
  const lines = people.map((e): StoredLine => {
    const prev = run.lines.find((l) => l.employeeId === e.id);
    const facts = factsOf(hr, pay, e, p, loans);
    const result = computeLine(p, facts, { ...(prev?.daysConfirmed ? { daysConfirmed: prev.daysConfirmed.days } : {}), bonuses: (prev?.bonuses ?? []).map((b) => paisa(b.amount)) });
    return {
      employeeId: e.id,
      included: prev ? prev.included : true,
      ...(prev?.exclusion ? { exclusion: prev.exclusion } : {}),
      ...(prev?.daysConfirmed ? { daysConfirmed: prev.daysConfirmed } : {}),
      bonuses: prev?.bonuses ?? [],
      snapshot: snapshotOf(e, facts, result),
      history: prev?.history ?? [],
    };
  });
  const removed = run.lines.filter((l) => !people.some((e) => e.id === l.employeeId)).map((l) => ({ id: l.employeeId, name: l.snapshot.name }));
  return { lines, removed, fingerprint: hrFingerprint(hr, pay, run.legalEntityId, p, loans) };
}

/** Totals of a set of lines (the included ones). */
export const runTotals = (lines: readonly StoredLine[]) =>
  totalsOf(lines.map((l) => ({ included: l.included, result: { gross: paisa(l.snapshot.gross), deductions: paisa(l.snapshot.deductions), net: paisa(l.snapshot.net), blockers: l.snapshot.blockers } })));

/** Recalculates the run as a new version, by `who`, for a reason (`payroll:version.*`). */
export function newVersion(hr: HrState, pay: PayrollState, period: StoredPeriod, run: StoredRun, who: { by: string; byName: string }, at: string, reason: string, loans: boolean, about?: { id: string; name: string }): void {
  const { lines, removed, fingerprint: fp } = calculate(hr, pay, period, run, loans);
  run.lines = lines;
  run.fingerprint = fp;
  run.version += 1;
  const t = runTotals(lines);
  const v: StoredVersion = { n: run.version, at, byName: who.byName, reason, ...(about ? { about: about.name, aboutId: about.id } : {}), net: money(t.net), included: t.included };
  run.versions.push(v);
  if (!run.makers.includes(who.by)) {
    run.makers.push(who.by);
    run.makerNames.push(who.byName);
  }
  for (const r of removed) run.history.push(ev(who, at, 'line_removed', { employeeId: r.id, values: { name: r.name } }));
}

/**
 * Al-Noor's payroll when it started: pay terms from 15 October, October's period opened that day,
 * its run prepared on 24 October and recalculated on 25 October (the two daily-wage lines still
 * need their days confirmed), and November's period created as a draft.
 */
export function seedPayroll(state: PayrollState, hr: HrState): void {
  seedTerms(state, hr);
  const site = hr.sites[0]!;
  const code = site.code;
  const oct = periodIds(code, '2026-10');
  const october: StoredPeriod = {
    id: oct.id,
    ref: oct.ref,
    legalEntityId: site.legalEntityId,
    month: '2026-10',
    from: '2026-10-01',
    to: '2026-10-31',
    payDate: '2026-10-31',
    state: 'open',
    createdBy: SABA.by,
    createdByName: SABA.byName,
    createdAt: pkt('2026-10-15', '10:00'),
    openedByName: SABA.byName,
    openedAt: pkt('2026-10-15', '10:05'),
    history: [ev(SABA, pkt('2026-10-15', '10:00'), 'period_created'), ev(SABA, pkt('2026-10-15', '10:05'), 'period_opened')],
  };
  state.periods.push(october);
  const { id } = nextPay(state, code, 'run');
  const prepared = pkt('2026-10-24', '11:00');
  const run: StoredRun = {
    id,
    ref: runRef(code, october.month, 1),
    periodId: october.id,
    legalEntityId: site.legalEntityId,
    state: 'draft',
    version: 0,
    fingerprint: '',
    lines: [],
    versions: [],
    preparedBy: SABA.by,
    preparedByName: SABA.byName,
    preparedAt: prepared,
    makers: [],
    makerNames: [],
    history: [ev(SABA, prepared, 'run_prepared')],
  };
  state.runs.push(run);
  newVersion(hr, state, october, run, SABA, prepared, 'prepared', true);
  const again = pkt('2026-10-25', '16:00');
  newVersion(hr, state, october, run, SABA, again, 'recalculated', true);
  run.history.push(ev(SABA, again, 'run_recalculated', { values: { version: '2' } }));
  const nov = periodIds(code, '2026-11');
  state.periods.push({
    id: nov.id,
    ref: nov.ref,
    legalEntityId: site.legalEntityId,
    month: '2026-11',
    from: '2026-11-01',
    to: '2026-11-30',
    payDate: '2026-11-30',
    state: 'draft',
    createdBy: SABA.by,
    createdByName: SABA.byName,
    createdAt: pkt('2026-10-25', '17:00'),
    history: [ev(SABA, pkt('2026-10-25', '17:00'), 'period_created')],
  });
}

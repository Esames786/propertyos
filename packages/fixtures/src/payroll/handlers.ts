import type { PayAccounting, PayBonusInput, PayBreakdown, PayDashboard, PayDaysInput, PayDisbursements, PayExport, PayInstructionView, PayPeriodInput, PayPeriodsList, PayPeriodView, PayRunsList, PayRunView, Permission } from '@repo/contracts';
import { notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { addDays, DATE } from '../hr/rules';
import { employeeOf } from '../hr/views';
import { invalid } from '../operations/common';
import { problem } from '../society/handlers';
import { AMOUNT, money, paisa } from '../society/finance/model';
import { newVersion, runTotals } from './compute';
import { firstDay, lastDay, MONTH, monthOf, splitForInstruction } from './rules';
import { ev, nextPay, periodIds, runRef, type StoredInstruction, type StoredPeriod, type StoredRun } from './state';
import {
  accounting,
  breakdown,
  dashboard,
  entityCode,
  entityName,
  entityVisible,
  entityWhole,
  hasOwnLine,
  holds,
  instructionView,
  isOwnLine,
  isStale,
  liveInstruction,
  liveRun,
  madeRun,
  ownInInstruction,
  payOf,
  periodById,
  periodOfRun,
  periodView,
  runBlockers,
  runView,
  visibleLines,
  visibleRuns,
  type P,
} from './views';

/**
 * Gate S.2b payroll endpoints (PAY-001…007). The transport checks the `payroll` add-on and the
 * permission; `payOf` checks the office app, a society, `hr` and the person's scope. Then each
 * handler checks, in this order and before reading any id from the request body:
 * 1. **Authority over the legal entity** (`whole`: every one of its sites) for any change.
 * 2. **The record's state** (a frozen run, a closed period, an instruction already sent).
 * 3. **The ids** in the path or body, in scope (anything else: "not found" or a field problem,
 *    identical for an id never issued).
 * 4. **Maker ≠ checker** by principal, and nobody changes or approves their own pay line.
 * 5. **Validation** of every field, before anything is stored.
 * A refused request changes nothing. Payroll cannot be practised in training mode: practice records
 * are kept apart from the demo's official records, and payroll has no practice store.
 *
 * There is no settlement, payment, posting or evidence route: nothing here can make pay "paid",
 * move cash or reduce what is owed (see `contracts/payroll.ts`).
 */

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<Record<keyof T, unknown>>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const q = (ctx: HandlerContext, key: string) => String(ctx.req.query?.[key] ?? '').trim();
const save = (p: P) => p.ctx.demo.save();
const who = (p: P) => ({ by: p.me.principalId, byName: p.me.name });
const stamp = (p: P, action: string, extra: { note?: string; values?: Record<string, string> } = {}) => ev(who(p), p.now, action, extra);

function refuse(ctx: HandlerContext, status: number, code: string, key: string, values?: Record<string, string>): never {
  if (values) problem(ctx, status, code, `payroll:problems.${key}`, { _: [{ code: `payroll:problems.${key}Detail`, params: values }] });
  problem(ctx, status, code, `payroll:problems.${key}`);
}

function text(ctx: HandlerContext, field: string, raw: unknown, min: number, max: number): string {
  const v = str(raw);
  if (v.length < min) invalid(ctx, field, min <= 1 ? 'forms:errors.required' : 'payroll:errors.minLength', { min: String(min) });
  if (v.length > max) invalid(ctx, field, 'payroll:errors.maxLength', { max: String(max) });
  return v;
}

/** Changes are refused in training mode: payroll has no practice records. */
function official(p: P): P {
  if (p.ctx.req.training) refuse(p.ctx, 403, 'training_not_supported', 'trainingNotSupported');
  return p;
}

/** Authority over everything of the legal entity (every one of its sites). Never names another site. */
function whole(p: P, legalEntityId: string): void {
  if (!entityWhole(p, legalEntityId)) refuse(p.ctx, 403, 'other_sites', 'otherSites');
}

/** A repeated create with the same idempotency key returns what the first one created. */
const replayed = (p: P) => (p.ctx.req.idempotencyKey ? p.pay.idempotency[p.ctx.req.idempotencyKey] : undefined);
const remember = (p: P, id: string) => {
  if (p.ctx.req.idempotencyKey) p.pay.idempotency[p.ctx.req.idempotencyKey] = id;
};

function findPeriod(p: P): StoredPeriod {
  const period = periodById(p, p.ctx.params.id ?? '');
  if (!period || !entityVisible(p, period.legalEntityId)) notFound(p.ctx);
  return period;
}

function findRun(p: P, id = p.ctx.params.id): StoredRun {
  const run = p.pay.runs.find((r) => r.id === id);
  if (!run || !entityVisible(p, run.legalEntityId)) notFound(p.ctx);
  return run;
}

function findInstruction(p: P): StoredInstruction {
  const ins = p.pay.instructions.find((i) => i.id === p.ctx.params.id);
  if (!ins || !entityVisible(p, ins.legalEntityId)) notFound(p.ctx);
  return ins;
}

/** A line of the run the person may see; any other employee id is "not found". */
function findLine(p: P, run: StoredRun) {
  const line = visibleLines(p, run).find((l) => l.employeeId === p.ctx.params.employeeId);
  if (!line) notFound(p.ctx);
  return line;
}

/** The licence month: no payroll period starts before payroll was licensed. */
function licenceMonth(p: P): string {
  const froms = (p.ctx.access?.grants ?? []).filter((g) => g.module === 'payroll').map((g) => g.from.slice(0, 10));
  return monthOf(froms.sort()[0] ?? p.today);
}

const nextMonthOf = (month: string) => monthOf(addDays(lastDay(month), 1));

// ---------------------------------------------------------------------------------------------
// Periods (PAY-002)
// ---------------------------------------------------------------------------------------------

function periodsList(p: P): PayPeriodsList {
  const items = p.pay.periods.filter((x) => entityVisible(p, x.legalEntityId)).sort((a, b) => b.month.localeCompare(a.month) || a.legalEntityId.localeCompare(b.legalEntityId)).map((x) => periodView(p, x));
  const counts = { draft: 0, open: 0, closed: 0 };
  for (const i of items) counts[i.state] += 1;
  const canCreate = holds(p, 'payroll.prepare');
  const entity = canCreate ? p.hr.sites.map((s) => s.legalEntityId).find((le) => entityWhole(p, le)) : undefined;
  let next: PayPeriodsList['next'];
  if (entity) {
    const month = expectedMonth(p, entity);
    next = { legalEntityId: entity, legalEntityName: entityName(p, entity), month, from: firstDay(month), to: lastDay(month), payDate: lastDay(month) };
  }
  return { items, counts, canCreate: !!next, ...(next ? { next } : {}), today: p.today };
}

/** The month the legal entity's next period must be: the one after its latest, or the licence month. */
function expectedMonth(p: P, legalEntityId: string): string {
  const latest = p.pay.periods.filter((x) => x.legalEntityId === legalEntityId).map((x) => x.month).sort().at(-1);
  return latest ? nextMonthOf(latest) : licenceMonth(p);
}

function createPeriod(p: P): PayPeriodView {
  const { ctx } = official(p);
  const b = body<PayPeriodInput>(ctx);
  // The legal entity first: one the person cannot see is the same field problem as one never issued.
  const le = str(b.legalEntityId);
  if (!le || !entityVisible(p, le)) invalid(ctx, 'legalEntityId', 'forms:errors.required');
  whole(p, le);
  const again = replayed(p);
  if (again) return periodView(p, periodById(p, again)!);
  const month = str(b.month);
  if (!MONTH.test(month)) invalid(ctx, 'month', 'payroll:errors.month');
  const existing = p.pay.periods.find((x) => x.legalEntityId === le && x.month === month);
  if (existing) refuse(ctx, 409, 'period_exists', 'periodExists', { ref: existing.ref });
  const expected = expectedMonth(p, le);
  if (month !== expected) invalid(ctx, 'month', 'payroll:errors.periodOrder', { month: expected });
  if (month > nextMonthOf(nextMonthOf(monthOf(p.today)))) invalid(ctx, 'month', 'payroll:errors.periodTooFar');
  const payDate = str(b.payDate);
  const to = lastDay(month);
  if (!DATE.test(payDate) || Number.isNaN(Date.parse(`${payDate}T00:00:00Z`))) invalid(ctx, 'payDate', 'payroll:errors.date');
  if (payDate < addDays(to, -5) || payDate > addDays(to, 10)) invalid(ctx, 'payDate', 'payroll:errors.payDate');
  const { id, ref } = periodIds(entityCode(p, le), month);
  const period: StoredPeriod = { id, ref, legalEntityId: le, month, from: firstDay(month), to, payDate, state: 'draft', createdBy: p.me.principalId, createdByName: p.me.name, createdAt: p.now, history: [stamp(p, 'period_created')] };
  p.pay.periods.push(period);
  remember(p, id);
  save(p);
  return periodView(p, period);
}

function openPeriod(p: P): PayPeriodView {
  const { ctx } = official(p);
  const period = findPeriod(p);
  whole(p, period.legalEntityId);
  if (period.state !== 'draft') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const other = p.pay.periods.find((x) => x.id !== period.id && x.legalEntityId === period.legalEntityId && x.state === 'open');
  if (other) refuse(ctx, 409, 'another_open', 'anotherOpen', { ref: other.ref });
  Object.assign(period, { state: 'open', openedByName: p.me.name, openedAt: p.now });
  period.history.push(stamp(p, 'period_opened'));
  save(p);
  return periodView(p, period);
}

function closePeriod(p: P): PayPeriodView {
  const { ctx } = official(p);
  const period = findPeriod(p);
  whole(p, period.legalEntityId);
  if (period.state !== 'open') refuse(ctx, 409, 'state_changed', 'stateChanged');
  // Closing needs the period's approved run: an open draft or a submitted run cannot be left behind.
  if (liveRun(p, period)?.state !== 'approved') refuse(ctx, 409, 'run_not_approved', 'runNotApproved');
  Object.assign(period, { state: 'closed', closedByName: p.me.name, closedAt: p.now });
  period.history.push(stamp(p, 'period_closed'));
  save(p);
  return periodView(p, period);
}

// ---------------------------------------------------------------------------------------------
// Runs (PAY-003, PAY-005)
// ---------------------------------------------------------------------------------------------

function prepareRun(p: P): PayRunView {
  const { ctx } = official(p);
  const period = findPeriod(p);
  whole(p, period.legalEntityId);
  const again = replayed(p);
  if (again) return runView(p, findRun(p, again));
  if (period.state !== 'open') refuse(ctx, 409, 'period_not_open', 'periodNotOpen');
  const live = liveRun(p, period);
  if (live) refuse(ctx, 409, 'run_exists', 'runExists', { ref: live.ref });
  const nth = p.pay.runs.filter((r) => r.periodId === period.id).length + 1;
  const { id } = nextPay(p.pay, entityCode(p, period.legalEntityId), 'run');
  const run: StoredRun = { id, ref: runRef(entityCode(p, period.legalEntityId), period.month, nth), periodId: period.id, legalEntityId: period.legalEntityId, state: 'draft', version: 0, fingerprint: '', lines: [], versions: [], preparedBy: p.me.principalId, preparedByName: p.me.name, preparedAt: p.now, makers: [], makerNames: [], history: [stamp(p, 'run_prepared')] };
  p.pay.runs.push(run);
  newVersion(p.hr, p.pay, period, run, who(p), p.now, 'prepared', p.loans);
  remember(p, id);
  save(p);
  return runView(p, run);
}

/** A draft run the person may change: the whole legal entity, a draft, and an open period. */
function editable(p: P, run: StoredRun): void {
  whole(p, run.legalEntityId);
  if (run.state === 'approved' || run.state === 'reversed') refuse(p.ctx, 409, 'run_frozen', 'runFrozen');
  if (run.state === 'submitted') refuse(p.ctx, 409, 'run_submitted', 'runSubmitted');
  if (periodOfRun(p, run).state !== 'open') refuse(p.ctx, 409, 'period_not_open', 'periodNotOpen');
}

function recompute(p: P): PayRunView {
  official(p);
  const run = findRun(p);
  editable(p, run);
  newVersion(p.hr, p.pay, periodOfRun(p, run), run, who(p), p.now, 'recalculated', p.loans);
  run.history.push(stamp(p, 'run_recalculated', { values: { version: String(run.version) } }));
  save(p);
  return runView(p, run);
}

/** A line the preparer may change: not their own pay (nobody sets their own pay). */
function lineToChange(p: P, run: StoredRun) {
  editable(p, run);
  const line = findLine(p, run);
  if (isOwnLine(p, line)) refuse(p.ctx, 403, 'own_record', 'ownRecord');
  return line;
}

function confirmDays(p: P): PayBreakdown {
  const { ctx } = official(p);
  const run = findRun(p);
  const line = lineToChange(p, run);
  const b = body<PayDaysInput>(ctx);
  if (line.snapshot.basis !== 'daily') invalid(ctx, 'days', 'payroll:errors.notDaily');
  if (!line.included) refuse(ctx, 409, 'line_excluded', 'lineExcluded');
  // An empty field is not zero days: it is a missing answer.
  const days = typeof b.days === 'number' ? b.days : str(b.days) === '' ? Number.NaN : Number(str(b.days));
  if (!Number.isInteger(days) || days < 0 || days > line.snapshot.employedDays) invalid(ctx, 'days', 'payroll:errors.days', { max: String(line.snapshot.employedDays) });
  const reason = text(ctx, 'reason', b.reason, 10, 300);
  line.daysConfirmed = { days, reason, by: p.me.principalId, byName: p.me.name, at: p.now };
  line.history.push(stamp(p, 'days_confirmed', { note: reason, values: { days: String(days) } }));
  newVersion(p.hr, p.pay, periodOfRun(p, run), run, who(p), p.now, 'days_confirmed', p.loans, line.snapshot.name);
  save(p);
  return breakdown(p, run, run.lines.find((l) => l.employeeId === line.employeeId)!);
}

const BONUS_MAX = 50_000_000n; // PKR 500,000.00 per bonus

function addBonus(p: P): PayBreakdown {
  const { ctx } = official(p);
  const run = findRun(p);
  const line = lineToChange(p, run);
  const again = replayed(p);
  if (again) return breakdown(p, run, line);
  if (!line.included) refuse(ctx, 409, 'line_excluded', 'lineExcluded');
  const b = body<PayBonusInput>(ctx);
  const label = text(ctx, 'label', b.label, 3, 60);
  const raw = str(b.amount).replace(/,/g, '');
  // Only a positive amount: a "negative bonus" is a deduction, and no deduction policy exists.
  if (!AMOUNT.test(raw) || paisa({ amount: raw, currency: 'PKR' }) <= 0n) invalid(ctx, 'amount', 'payroll:errors.amount');
  const amount = paisa({ amount: raw, currency: 'PKR' });
  if (amount > BONUS_MAX) invalid(ctx, 'amount', 'payroll:errors.bonusTooLarge');
  const reason = text(ctx, 'reason', b.reason, 10, 300);
  const { id } = nextPay(p.pay, entityCode(p, run.legalEntityId), 'bonus');
  line.bonuses.push({ id, label, amount: money(amount), reason, addedBy: p.me.principalId, addedByName: p.me.name, addedAt: p.now });
  line.history.push(stamp(p, 'bonus_added', { note: reason, values: { label, amount: money(amount).amount } }));
  newVersion(p.hr, p.pay, periodOfRun(p, run), run, who(p), p.now, 'bonus_added', p.loans, line.snapshot.name);
  remember(p, id);
  save(p);
  return breakdown(p, run, run.lines.find((l) => l.employeeId === line.employeeId)!);
}

function removeBonus(p: P): PayBreakdown {
  const { ctx } = official(p);
  const run = findRun(p);
  const line = lineToChange(p, run);
  const bonus = line.bonuses.find((x) => x.id === ctx.params.bonusId);
  if (!bonus) notFound(ctx);
  line.bonuses = line.bonuses.filter((x) => x.id !== bonus.id);
  line.history.push(stamp(p, 'bonus_removed', { values: { label: bonus.label, amount: bonus.amount.amount } }));
  newVersion(p.hr, p.pay, periodOfRun(p, run), run, who(p), p.now, 'bonus_removed', p.loans, line.snapshot.name);
  save(p);
  return breakdown(p, run, run.lines.find((l) => l.employeeId === line.employeeId)!);
}

function exclude(p: P, out: boolean): PayBreakdown {
  const { ctx } = official(p);
  const run = findRun(p);
  const line = lineToChange(p, run);
  if (line.included !== out) refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (out) {
    const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 10, 300);
    line.included = false;
    line.exclusion = { reason, by: p.me.principalId, byName: p.me.name, at: p.now };
    line.history.push(stamp(p, 'line_excluded', { note: reason }));
  } else {
    line.included = true;
    delete line.exclusion;
    line.history.push(stamp(p, 'line_included'));
  }
  newVersion(p.hr, p.pay, periodOfRun(p, run), run, who(p), p.now, out ? 'line_excluded' : 'line_included', p.loans, line.snapshot.name);
  save(p);
  return breakdown(p, run, run.lines.find((l) => l.employeeId === line.employeeId)!);
}

const BLOCKER_REFUSAL = { period_not_open: ['period_not_open', 'periodNotOpen'], stale: ['run_stale', 'runStale'], no_lines: ['no_lines', 'noLines'], line_blockers: ['line_blockers', 'lineBlockers'] } as const;

function submit(p: P): PayRunView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  if (run.state !== 'draft') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const blockers = runBlockers(p, run, run.lines, isStale(p, run));
  if (blockers.length) {
    const [code, key] = BLOCKER_REFUSAL[blockers[0]!];
    refuse(ctx, 409, code, key);
  }
  Object.assign(run, { state: 'submitted', submittedBy: p.me.principalId, submittedByName: p.me.name, submittedAt: p.now });
  if (!run.makers.includes(p.me.principalId)) {
    run.makers.push(p.me.principalId);
    run.makerNames.push(p.me.name);
  }
  run.history.push(stamp(p, 'run_submitted', { values: { version: String(run.version), net: money(runTotals(run.lines).net).amount } }));
  save(p);
  return runView(p, run);
}

function withdraw(p: P): PayRunView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  if (run.state !== 'submitted') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  Object.assign(run, { state: 'draft' });
  run.history.push(stamp(p, 'run_withdrawn', { note: reason }));
  save(p);
  return runView(p, run);
}

/**
 * PAY-005: approving freezes the run as an approved obligation. The approver made no part of it,
 * has no pay line in it, works from an up-to-date version and says explicitly that this approves
 * what is owed, not a payment. Nothing is paid, posted or deducted.
 */
function approve(p: P): PayRunView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  if (run.state !== 'submitted') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (madeRun(p, run)) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  if (hasOwnLine(p, run)) refuse(ctx, 403, 'own_record', 'ownRecord');
  if (isStale(p, run)) refuse(ctx, 409, 'run_stale', 'runStale');
  const b = body<{ acknowledge: boolean; note: string }>(ctx);
  if (b.acknowledge !== true) invalid(ctx, 'acknowledge', 'payroll:errors.acknowledge');
  const note = text(ctx, 'note', b.note, 0, 300);
  Object.assign(run, { state: 'approved', approvedBy: p.me.principalId, approvedByName: p.me.name, approvedAt: p.now, ...(note ? { approvalNote: note } : {}) });
  run.history.push(stamp(p, 'run_approved', { ...(note ? { note } : {}), values: { version: String(run.version), net: money(runTotals(run.lines).net).amount } }));
  save(p);
  return runView(p, run);
}

function returnRun(p: P): PayRunView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  if (run.state !== 'submitted') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (run.submittedBy === p.me.principalId) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  const note = text(ctx, 'note', body<{ note: string }>(ctx).note, 5, 300);
  Object.assign(run, { state: 'draft' });
  run.history.push(stamp(p, 'run_returned', { note }));
  save(p);
  return runView(p, run);
}

/**
 * Reversing withdraws an approved obligation (never a payment: none exists). Only before the
 * period closes, with no live disbursement instruction, and by someone who made no part of the run.
 * The period may then have a new run.
 */
function reverse(p: P): PayRunView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  if (run.state !== 'approved') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (madeRun(p, run)) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  if (periodOfRun(p, run).state === 'closed') refuse(ctx, 409, 'period_closed', 'periodClosed');
  const ins = liveInstruction(p, run);
  if (ins) refuse(ctx, 409, 'instruction_live', 'instructionLive', { ref: ins.ref });
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 10, 300);
  Object.assign(run, { state: 'reversed', reversedBy: p.me.principalId, reversedByName: p.me.name, reversedAt: p.now, reversalReason: reason });
  run.history.push(stamp(p, 'run_reversed', { note: reason }));
  save(p);
  return runView(p, run);
}

function runsList(p: P): PayRunsList {
  return {
    items: visibleRuns(p).map((r) => {
      const v = runView(p, r);
      return {
        id: v.id,
        ref: v.ref,
        state: v.state,
        version: v.version,
        net: v.totals.net,
        included: v.totals.included,
        periodRef: v.periodRef,
        month: v.month,
        legalEntityName: v.legalEntityName,
        ...(v.submittedByName ? { submittedByName: v.submittedByName, submittedAt: v.submittedAt! } : {}),
        ...(v.approvedByName ? { approvedByName: v.approvedByName, approvedAt: v.approvedAt! } : {}),
        ...(v.reversedAt ? { reversedAt: v.reversedAt } : {}),
        stale: v.stale,
        canApprove: v.actions.approve,
        ...(v.blocked ? { blocked: v.blocked } : {}),
      };
    }),
  };
}

function exportRun(p: P): PayExport {
  const run = findRun(p);
  const period = periodOfRun(p, run);
  return {
    runRef: run.ref,
    month: period.month,
    version: run.version,
    state: run.state,
    scopeLimited: !entityWhole(p, run.legalEntityId),
    rows: visibleLines(p, run).map((l) => ({ code: l.snapshot.code, name: l.snapshot.name, role: l.snapshot.role, state: l.included ? 'included' : 'excluded', gross: l.snapshot.gross.amount, deductions: l.snapshot.deductions.amount, net: l.snapshot.net.amount })),
  };
}

/** PAY-004 from Employee 360: the person's line in the latest run the reader may see. */
function latestLine(p: P): PayBreakdown {
  const e = employeeOf(p.hr, p.ctx.params.employeeId ?? '');
  for (const run of visibleRuns(p)) {
    const line = visibleLines(p, run).find((l) => l.employeeId === e?.id);
    if (line) return breakdown(p, run, line);
  }
  notFound(p.ctx);
}

// ---------------------------------------------------------------------------------------------
// Disbursement instructions (PAY-006): instructions only, never a payment
// ---------------------------------------------------------------------------------------------

function prepareInstruction(p: P): PayInstructionView {
  const { ctx } = official(p);
  const run = findRun(p);
  whole(p, run.legalEntityId);
  const again = replayed(p);
  if (again) return instructionView(p, p.pay.instructions.find((i) => i.id === again)!);
  if (run.state !== 'approved') refuse(ctx, 409, 'run_not_approved', 'runNotApproved');
  const live = liveInstruction(p, run);
  if (live) refuse(ctx, 409, 'instruction_exists', 'instructionExists', { ref: live.ref });
  const split = splitForInstruction(
    run.lines.filter((l) => l.included).map((l) => ({ employeeId: l.employeeId, employeeName: l.snapshot.name, method: l.snapshot.method ?? ('cash' as const), account: l.snapshot.account, accountVerified: !!l.snapshot.accountVerified, net: paisa(l.snapshot.net) })),
  );
  const { id, ref } = nextPay(p.pay, entityCode(p, run.legalEntityId), 'instruction');
  const ins: StoredInstruction = {
    id,
    ref,
    runId: run.id,
    legalEntityId: run.legalEntityId,
    state: 'prepared',
    lines: split.pay.map((l) => ({ employeeId: l.employeeId, employeeName: l.employeeName, method: l.method, ...(l.method === 'bank' && l.account ? { account: l.account } : {}), amount: money(l.net) })),
    held: split.held.map((l) => ({ employeeId: l.employeeId, employeeName: l.employeeName, amount: money(l.net), reason: l.reason })),
    total: money(split.total),
    preparedBy: p.me.principalId,
    preparedByName: p.me.name,
    preparedAt: p.now,
    history: [stamp(p, 'instruction_prepared', { values: { total: money(split.total).amount } })],
  };
  p.pay.instructions.push(ins);
  run.history.push(stamp(p, 'instruction_prepared', { values: { ref } }));
  remember(p, id);
  save(p);
  return instructionView(p, ins);
}

function approveInstruction(p: P): PayInstructionView {
  const { ctx } = official(p);
  const ins = findInstruction(p);
  whole(p, ins.legalEntityId);
  if (ins.state !== 'prepared') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (ins.preparedBy === p.me.principalId) refuse(ctx, 403, 'maker_checker_required', 'makerChecker');
  if (ownInInstruction(p, ins)) refuse(ctx, 403, 'own_record', 'ownRecord');
  Object.assign(ins, { state: 'approved', approvedBy: p.me.principalId, approvedByName: p.me.name, approvedAt: p.now });
  ins.history.push(stamp(p, 'instruction_approved'));
  save(p);
  return instructionView(p, ins);
}

/** "Sent (simulated)": the instruction is marked as handed over. Nothing is sent, paid or settled. */
function markSent(p: P): PayInstructionView {
  const { ctx } = official(p);
  const ins = findInstruction(p);
  whole(p, ins.legalEntityId);
  if (ins.state !== 'approved') refuse(ctx, 409, 'state_changed', 'stateChanged');
  Object.assign(ins, { state: 'sent_simulated', sentByName: p.me.name, sentAt: p.now });
  ins.history.push(stamp(p, 'instruction_sent'));
  save(p);
  return instructionView(p, ins);
}

function cancelInstruction(p: P): PayInstructionView {
  const { ctx } = official(p);
  const ins = findInstruction(p);
  whole(p, ins.legalEntityId);
  if (ins.state === 'sent_simulated') refuse(ctx, 409, 'instruction_sent', 'instructionSent');
  if (ins.state !== 'prepared' && ins.state !== 'approved') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  Object.assign(ins, { state: 'cancelled', cancelledByName: p.me.name, cancelledAt: p.now, cancelReason: reason });
  ins.history.push(stamp(p, 'instruction_cancelled', { note: reason }));
  save(p);
  return instructionView(p, ins);
}

function disbursements(p: P): PayDisbursements {
  const only = q(p.ctx, 'run');
  const runs = visibleRuns(p).filter((r) => (r.state === 'approved' || r.state === 'reversed') && (!only || r.id === only));
  return {
    runs: runs.map((r) => {
      const v = runView(p, r);
      const ins = liveInstruction(p, r);
      return {
        runId: r.id,
        runRef: r.ref,
        month: v.month,
        payDate: v.payDate,
        state: r.state,
        net: v.totals.net,
        ...(ins ? { instruction: instructionView(p, ins) } : {}),
        canInstruct: v.actions.instruct,
        ...(v.blocked === 'other_sites' ? { blocked: 'other_sites' as const } : ins && r.state === 'approved' ? { blocked: 'instruction_live' as const } : {}),
      };
    }),
    cancelled: p.pay.instructions.filter((i) => i.state === 'cancelled' && runs.some((r) => r.id === i.runId)).map((i) => instructionView(p, i)),
    settlementAvailable: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

const PAYROLL = 'payroll' as const;
const read = () => requires(PAYROLL, 'payroll.view', 'history_read');
const change = (permission: Permission | readonly Permission[], feature?: 'payroll.bonuses') => requires(PAYROLL, permission, 'operational', feature);
const ID = '(?<id>[\\w-]+)';
const route = (path: string) => new RegExp(`^${path.replace(':id', ID).replace(':employeeId', '(?<employeeId>[\\w-]+)').replace(':bonusId', '(?<bonusId>[\\w-]+)')}$`);

export const PAYROLL_HANDLERS: Handler[] = [
  { method: 'GET', pattern: route('/payroll/dashboard'), access: read(), handle: (ctx): PayDashboard => dashboard(payOf(ctx)) },
  { method: 'GET', pattern: route('/payroll/periods'), access: read(), handle: (ctx): PayPeriodsList => periodsList(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/periods'), access: change('payroll.prepare'), handle: (ctx) => createPeriod(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/periods/:id/open'), access: change('payroll.prepare'), handle: (ctx) => openPeriod(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/periods/:id/close'), access: change('payroll.approve'), handle: (ctx) => closePeriod(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/periods/:id/runs'), access: change('payroll.prepare'), handle: (ctx) => prepareRun(payOf(ctx)) },

  { method: 'GET', pattern: route('/payroll/runs'), access: read(), handle: (ctx): PayRunsList => runsList(payOf(ctx)) },
  {
    method: 'GET',
    pattern: route('/payroll/runs/:id'),
    access: read(),
    handle: (ctx): PayRunView => {
      const p = payOf(ctx);
      return runView(p, findRun(p));
    },
  },
  { method: 'GET', pattern: route('/payroll/runs/:id/export'), access: read(), handle: (ctx): PayExport => exportRun(payOf(ctx)) },
  {
    method: 'GET',
    pattern: route('/payroll/runs/:id/lines/:employeeId'),
    access: read(),
    handle: (ctx): PayBreakdown => {
      const p = payOf(ctx);
      const run = findRun(p);
      return breakdown(p, run, findLine(p, run));
    },
  },
  { method: 'GET', pattern: route('/payroll/employees/:employeeId/latest'), access: read(), handle: (ctx): PayBreakdown => latestLine(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/recompute'), access: change('payroll.prepare'), handle: (ctx) => recompute(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/lines/:employeeId/days'), access: change('payroll.prepare'), handle: (ctx) => confirmDays(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/lines/:employeeId/bonuses'), access: change('payroll.prepare', 'payroll.bonuses'), handle: (ctx) => addBonus(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/lines/:employeeId/bonuses/:bonusId/remove'), access: change('payroll.prepare'), handle: (ctx) => removeBonus(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/lines/:employeeId/exclude'), access: change('payroll.prepare'), handle: (ctx) => exclude(payOf(ctx), true) },
  { method: 'POST', pattern: route('/payroll/runs/:id/lines/:employeeId/include'), access: change('payroll.prepare'), handle: (ctx) => exclude(payOf(ctx), false) },
  { method: 'POST', pattern: route('/payroll/runs/:id/submit'), access: change('payroll.prepare'), handle: (ctx) => submit(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/withdraw'), access: change('payroll.prepare'), handle: (ctx) => withdraw(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/approve'), access: change('payroll.approve'), handle: (ctx) => approve(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/return'), access: change('payroll.approve'), handle: (ctx) => returnRun(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/reverse'), access: change('payroll.approve'), handle: (ctx) => reverse(payOf(ctx)) },

  { method: 'GET', pattern: route('/payroll/disbursements'), access: read(), handle: (ctx): PayDisbursements => disbursements(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/runs/:id/instructions'), access: change('payroll.prepare'), handle: (ctx) => prepareInstruction(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/instructions/:id/approve'), access: change('payroll.approve'), handle: (ctx) => approveInstruction(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/instructions/:id/sent'), access: change('payroll.prepare'), handle: (ctx) => markSent(payOf(ctx)) },
  { method: 'POST', pattern: route('/payroll/instructions/:id/cancel'), access: change(['payroll.prepare', 'payroll.approve']), handle: (ctx) => cancelInstruction(payOf(ctx)) },

  { method: 'GET', pattern: route('/payroll/accounting'), access: read(), handle: (ctx): PayAccounting => accounting(payOf(ctx), q(ctx, 'run') || undefined) },
];


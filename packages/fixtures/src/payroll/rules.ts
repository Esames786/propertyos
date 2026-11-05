import type { AdvanceKind, EmploymentStatus, PayAllowance, PayBasis, PayLineBlocker, PayLineWarning, PayMethod } from '@repo/contracts';
import { daysBetween, instalmentPlan } from '../hr/rules';

/**
 * Gate S.2b payroll rules: pure, deterministic and table-tested (`payroll.vectors.json`). Amounts are
 * whole paisa (bigint); a decimal-string `Money` is made only at the edge. Nothing here pays,
 * settles or deducts anything that no policy allows:
 * - **Monthly pay** is the monthly amount for the days employed in the period: calendar days, rounded
 *   half up to the paisa. Proration is a fictional demo rule (`proration: demo_rule`), labelled as one.
 * - **Daily wage** is the daily rate times the days worked that the preparer confirmed (HR attendance
 *   is shown as a guide; it does not cover the whole period).
 * - **Bonuses** are positive one-off amounts added by the preparer, each with a reason.
 * - **No deduction is applied.** Statutory deductions are placeholders, never calculated. Overtime,
 *   absences and unpaid leave need policies nobody has adopted: absences are reported, approved
 *   unpaid leave holds the line. Advance and loan instalments are listed but held: the advance's
 *   payment to the employee is not verified (HR-008), so recovering it could take money never paid.
 */

export interface PayTermsFacts {
  basis: PayBasis;
  /** Monthly amount, or the daily rate (paisa). */
  rate: bigint;
  allowances: Array<{ key: PayAllowance; paisa: bigint }>;
  method: PayMethod;
  accountVerified: boolean;
}

export interface LineFacts {
  /** The pay terms in force for the period, or null when none were agreed. */
  terms: PayTermsFacts | null;
  status: EmploymentStatus;
  startDate: string;
  endDate?: string;
  /** Days of approved unpaid leave, and of pending unpaid leave, inside the period. */
  unpaidLeaveDays: number;
  pendingUnpaidDays: number;
  /** Duties recorded absent inside the period. */
  absences: number;
  /** Approved advances and loans of the employee (their plan says which month each instalment falls in). */
  advances: Array<{ id: string; ref: string; kind: AdvanceKind; paisa: bigint; instalments: number; firstMonth: string }>;
}

export interface LineInputs {
  /** Daily wage: the days worked the preparer confirmed. */
  daysConfirmed?: number;
  bonuses: bigint[];
}

export interface Period {
  month: string;
  from: string;
  to: string;
}

export interface LineEarning {
  kind: 'base' | 'allowance';
  allowance?: PayAllowance;
  rate: bigint;
  paisa: bigint;
  days?: { counted: number; of: number };
}

export interface LineResult {
  employedDays: number;
  periodDays: number;
  earnings: LineEarning[];
  bonus: bigint;
  gross: bigint;
  /** Applied deductions: always 0 in this gate (see above). */
  deductions: bigint;
  net: bigint;
  held: Array<{ advanceId: string; ref: string; kind: AdvanceKind; instalment: number; of: number; paisa: bigint }>;
  blockers: PayLineBlocker[];
  warnings: PayLineWarning[];
}

/** Calendar days of a period. */
export const periodDays = (p: Pick<Period, 'from' | 'to'>) => daysBetween(p.from, p.to);

/** Days of the period the person was employed (start and end inclusive). */
export function employedDays(p: Pick<Period, 'from' | 'to'>, startDate: string, endDate?: string): number {
  const from = startDate > p.from ? startDate : p.from;
  const to = endDate && endDate < p.to ? endDate : p.to;
  return daysBetween(from, to);
}

/**
 * `amount × counted / of`, rounded half up to the paisa (amounts are never negative). A full period
 * gives the amount exactly.
 */
export function prorate(amount: bigint, counted: number, of: number): bigint {
  if (of <= 0 || counted <= 0) return 0n;
  if (counted >= of) return amount;
  const n = BigInt(counted);
  const d = BigInt(of);
  return (amount * n * 2n + d) / (2n * d);
}

/** One pay line, from the HR facts and the preparer's inputs. */
export function computeLine(period: Period, facts: LineFacts, inputs: LineInputs): LineResult {
  const days = periodDays(period);
  const employed = employedDays(period, facts.startDate, facts.endDate);
  const blockers: PayLineBlocker[] = [];
  const warnings: PayLineWarning[] = [];
  const t = facts.terms;
  if (!t) blockers.push('missing_pay');
  if (facts.status === 'suspended') blockers.push('suspended_policy');
  if (facts.unpaidLeaveDays > 0) blockers.push('unpaid_leave_policy');
  if (t?.basis === 'daily' && inputs.daysConfirmed === undefined) blockers.push('days_unconfirmed');

  const earnings: LineEarning[] = [];
  if (t?.basis === 'monthly') {
    earnings.push({ kind: 'base', rate: t.rate, paisa: prorate(t.rate, employed, days), days: { counted: employed, of: days } });
    for (const a of t.allowances) earnings.push({ kind: 'allowance', allowance: a.key, rate: a.paisa, paisa: prorate(a.paisa, employed, days), days: { counted: employed, of: days } });
    if (employed < days) warnings.push('partial_month');
  } else if (t?.basis === 'daily') {
    const worked = Math.min(inputs.daysConfirmed ?? 0, employed);
    earnings.push({ kind: 'base', rate: t.rate, paisa: t.rate * BigInt(worked), days: { counted: worked, of: employed } });
  }

  const held = facts.advances.flatMap((a) => {
    const due = instalmentPlan(a.paisa, a.instalments, a.firstMonth).find((i) => i.month === period.month);
    return due ? [{ advanceId: a.id, ref: a.ref, kind: a.kind, instalment: due.n, of: a.instalments, paisa: due.paisa }] : [];
  });
  if (held.length) warnings.push('advance_held');
  if (facts.absences > 0) warnings.push('absences');
  if (facts.pendingUnpaidDays > 0) warnings.push('leave_pending');
  if (t?.method === 'bank' && !t.accountVerified) warnings.push('bank_unverified');

  const bonus = inputs.bonuses.reduce((s, b) => s + b, 0n);
  const gross = earnings.reduce((s, e) => s + e.paisa, 0n) + bonus;
  const deductions = 0n;
  return { employedDays: employed, periodDays: days, earnings, bonus, gross, deductions, net: gross - deductions, held, blockers, warnings };
}

/** Totals of the included lines. */
export function totalsOf(lines: ReadonlyArray<{ included: boolean; result: Pick<LineResult, 'gross' | 'deductions' | 'net' | 'blockers'> }>) {
  const inc = lines.filter((l) => l.included);
  return {
    gross: inc.reduce((s, l) => s + l.result.gross, 0n),
    deductions: inc.reduce((s, l) => s + l.result.deductions, 0n),
    net: inc.reduce((s, l) => s + l.result.net, 0n),
    included: inc.length,
    excluded: lines.length - inc.length,
    blocked: inc.filter((l) => l.result.blockers.length > 0).length,
  };
}

/**
 * The disbursement split of an approved run's lines: cash, or a bank transfer to a verified account;
 * an unverified account (or nothing to pay) is held, never dropped silently.
 */
export function splitForInstruction<T extends { method: PayMethod; accountVerified: boolean; net: bigint }>(lines: readonly T[]) {
  const pay: T[] = [];
  const held: Array<T & { reason: 'bank_unverified' | 'zero_net' }> = [];
  for (const l of lines) {
    if (l.net <= 0n) held.push({ ...l, reason: 'zero_net' });
    else if (l.method === 'bank' && !l.accountVerified) held.push({ ...l, reason: 'bank_unverified' });
    else pay.push(l);
  }
  return { pay, held, total: pay.reduce((s, l) => s + l.net, 0n) };
}

/**
 * The proposed journal of an approved run (never posted): the expense of gross pay, and the payable
 * to staff of net pay. With no deduction applied the two are equal, so the entry balances.
 */
export function proposedJournal(gross: bigint, net: bigint, deductions: bigint) {
  return {
    lines: [
      { account: 'salaries_expense' as const, side: 'debit' as const, paisa: gross },
      { account: 'salaries_payable' as const, side: 'credit' as const, paisa: net },
    ],
    balanced: gross === net + deductions,
  };
}

/** A stable fingerprint of facts (FNV-1a, 32 bits): a run is stale when its HR facts change. */
export function fingerprint(value: unknown): string {
  const s = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The calendar month of a date ("2026-10"), its first and last day. */
export const monthOf = (date: string) => date.slice(0, 7);
export const firstDay = (month: string) => `${month}-01`;
export const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

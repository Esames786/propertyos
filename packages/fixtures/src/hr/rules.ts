import type { AttendanceState, DocumentStatus, HrDepartment, HrDocumentKind, ShiftTemplate } from '@repo/contracts';

/**
 * Gate S.2a pure rules (vector-tested in `hr-roster.vectors.json`): shift windows that cross midnight,
 * double-booking across sites, lateness, coverage against the minimum, leave dates, document expiry,
 * identity numbers and a loan's planned instalments. No clock is read here: callers pass instants.
 */

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The Monday of a date's week (weeks run Monday to Sunday). */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** Inclusive calendar days from `from` to `to` (0 when reversed). */
export const daysBetween = (from: string, to: string) => (to < from ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);

export const ms = (instant: string) => Date.parse(instant);

export interface Window {
  start: string;
  end: string;
}

/** The instants a shift on a date covers, [start, end), with the site's offset; a night shift ends the next day. */
export function shiftWindow(t: Pick<ShiftTemplate, 'start' | 'end' | 'crossesMidnight'>, date: string, offset = '+05:00'): Window {
  return { start: `${date}T${t.start}:00${offset}`, end: `${t.crossesMidnight ? addDays(date, 1) : date}T${t.end}:00${offset}` };
}

/** Two windows share at least a minute; back-to-back shifts (one ends as the next starts) do not. */
export const overlaps = (a: Window, b: Window) => ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);

/** Whole minutes after a shift's start (negative = early). */
export const minutesAfter = (start: string, at: string) => Math.floor((ms(at) - ms(start)) / 60_000);

/** Minutes late, or 0 when within the grace period (the society's setting, never a law). */
export function lateBy(start: string, checkIn: string, graceMinutes: number): number {
  const m = minutesAfter(start, checkIn);
  return m > graceMinutes ? m : 0;
}

/** Hours between the end of one duty and the start of the next (rest; shown, not enforced). */
export const restHours = (previousEnd: string, nextStart: string) => Math.round(((ms(nextStart) - ms(previousEnd)) / 3_600_000) * 10) / 10;

export interface DutyFacts {
  /** The employee's other duties (any site), not cancelled. */
  duties: Array<{ id: string } & Window>;
  /** Leave dates (inclusive) with their state. */
  leave: Array<{ from: string; to: string; state: 'pending' | 'approved' }>;
  employment: { status: 'active' | 'suspended' | 'ended'; startDate: string; endDate?: string };
  department: HrDepartment;
  /** Sites the employee is allocated to on dates. */
  sites: Array<{ siteId: string; from: string; to?: string }>;
}

export type AssignBlock = 'overlap' | 'on_leave' | 'not_at_site' | 'not_employed' | 'other_department';

/**
 * Whether an employee may take a duty: employed and active on the date, allocated to the site, of the
 * shift's department, not on approved leave, and not double-booked anywhere (another site included).
 * A pending leave request is not a refusal: the caller warns and asks first.
 */
export function assignBlock(facts: DutyFacts, duty: { siteId: string; date: string; department: HrDepartment; ignore?: readonly string[] } & Window): AssignBlock | null {
  const e = facts.employment;
  if (e.status !== 'active' || duty.date < e.startDate || (e.endDate !== undefined && duty.date > e.endDate)) return 'not_employed';
  if (!facts.sites.some((s) => s.siteId === duty.siteId && s.from <= duty.date && (s.to === undefined || duty.date <= s.to))) return 'not_at_site';
  if (facts.department !== duty.department) return 'other_department';
  if (facts.leave.some((l) => l.state === 'approved' && l.from <= duty.date && duty.date <= l.to)) return 'on_leave';
  if (facts.duties.some((d) => !duty.ignore?.includes(d.id) && overlaps(d, duty))) return 'overlap';
  return null;
}

export const pendingLeaveOn = (facts: Pick<DutyFacts, 'leave'>, date: string) => facts.leave.some((l) => l.state === 'pending' && l.from <= date && date <= l.to);

/** Who counts towards the minimum: everyone assigned except those absent or on leave. */
export function coverage(minStaff: number, states: readonly AttendanceState[]) {
  const available = states.filter((s) => s !== 'absent' && s !== 'on_leave').length;
  return { required: minStaff, available, short: available < minStaff };
}

/** Documents each department must hold (fictional society rule, shown as such). */
export const REQUIRED_DOCUMENTS: Record<HrDepartment, readonly HrDocumentKind[]> = {
  security: ['cnic', 'police_verification', 'appointment_letter', 'security_training'],
  maintenance: ['cnic', 'appointment_letter'],
  housekeeping: ['cnic', 'appointment_letter'],
  office: ['cnic', 'appointment_letter'],
};

/** A document's status on a date: expired, expiring within `warnDays`, or valid. */
export function documentStatus(expiresOn: string | undefined, today: string, warnDays = 30): Exclude<DocumentStatus, 'missing'> {
  if (!expiresOn) return 'valid';
  if (expiresOn < today) return 'expired';
  return expiresOn <= addDays(today, warnDays) ? 'expiring' : 'valid';
}

/** "35202-1234567-1" from any typing of the 13 digits; null when it is not 13 digits. */
export function normaliseCnic(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : null;
}

export const maskCnic = (cnic: string) => `${cnic.slice(0, 5)}-•••••••-${cnic.slice(-1)}`;

/** A Pakistani mobile number as "+92 3xx xxxxxxx"; null otherwise. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^0092/, '92').replace(/^0/, '92');
  return /^923\d{9}$/.test(digits) ? `+92 ${digits.slice(2, 5)} ${digits.slice(5)}` : null;
}

export const nextMonth = (month: string, n = 1) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * A planned repayment schedule in paisa: equal monthly instalments, the last one taking what the
 * division leaves, so the plan always adds up to the amount exactly.
 */
export function instalmentPlan(amountPaisa: bigint, count: number, firstMonth: string): Array<{ n: number; month: string; paisa: bigint }> {
  const each = amountPaisa / BigInt(count);
  return Array.from({ length: count }, (_, i) => ({ n: i + 1, month: nextMonth(firstMonth, i), paisa: i === count - 1 ? amountPaisa - each * BigInt(count - 1) : each }));
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

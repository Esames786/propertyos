import type { HrRole, HrDepartment, EmploymentType, Money, PayAllowance, PayBasis, PayEvent, PayInstructionState, PayLineBlocker, PayLineWarning, PayMethod, PayPeriodState, PayRunState, PayVersion, AdvanceKind } from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import { pkt, type HrState } from '../hr/state';
import type { OpsSite } from '../operations/site';
import { pad } from '../seed';

/**
 * Gate S.2b payroll records of the organisation (one state, beside its HR state). Seeds are
 * deterministic and fictional, for Al-Noor Residency (Demo) only: pay terms agreed when payroll
 * started (15 October 2026), October's period open with a draft run that still has two daily-wage
 * lines to confirm, and November's period as a draft. Another organisation starts with no payroll
 * records. Nothing here is a real salary, account or person.
 */
// 1: Gate S.2b. 2: Gate S.2b closure (Issue #16): events and versions name the person they are about;
// idempotency entries are bound to the request.
export const PAY_STATE_VERSION = 2;
export const PAY_SECTION = 'payroll';

export interface StoredTerms {
  employeeId: string;
  from: string;
  to?: string;
  basis: PayBasis;
  rate: Money;
  allowances: Array<{ key: PayAllowance; amount: Money }>;
  method: PayMethod;
  /** A fictional account: only its bank and last four characters are kept. */
  account?: { bankName: string; last4: string; verified: boolean };
  recordedByName: string;
  recordedAt: string;
}

export interface StoredPeriod {
  id: string;
  ref: string;
  legalEntityId: string;
  month: string;
  from: string;
  to: string;
  payDate: string;
  state: PayPeriodState;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  openedByName?: string;
  openedAt?: string;
  closedByName?: string;
  closedAt?: string;
  history: StoredEvent[];
}

export interface StoredBonus {
  id: string;
  label: string;
  amount: Money;
  reason: string;
  addedBy: string;
  addedByName: string;
  addedAt: string;
}

/** A line as calculated in the run's current version (kept, so an approved run never changes). */
export interface LineSnapshot {
  name: string;
  code: string;
  role: HrRole;
  department: HrDepartment;
  employmentType: EmploymentType;
  startDate: string;
  endDate?: string;
  basis: PayBasis | null;
  method: PayMethod | null;
  account?: string;
  accountVerified?: boolean;
  employedDays: number;
  periodDays: number;
  earnings: Array<{ kind: 'base' | 'allowance'; allowance?: PayAllowance; rate: Money; amount: Money; days?: { counted: number; of: number } }>;
  bonus: Money;
  gross: Money;
  deductions: Money;
  net: Money;
  held: Array<{ advanceId: string; ref: string; kind: AdvanceKind; instalment: number; of: number; amount: Money }>;
  blockers: PayLineBlocker[];
  warnings: PayLineWarning[];
  unpaidLeaveDays: number;
  absences: number;
  recordedDays: number;
  recordedFrom?: string;
}

export interface StoredLine {
  employeeId: string;
  included: boolean;
  exclusion?: { reason: string; by: string; byName: string; at: string };
  daysConfirmed?: { days: number; reason: string; by: string; byName: string; at: string };
  bonuses: StoredBonus[];
  snapshot: LineSnapshot;
  history: StoredEvent[];
}

export interface StoredRun {
  id: string;
  ref: string;
  periodId: string;
  legalEntityId: string;
  state: PayRunState;
  version: number;
  /** The HR facts the current version was calculated from (stale when they change). */
  fingerprint: string;
  lines: StoredLine[];
  versions: StoredVersion[];
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  /** Principals who prepared, recalculated, changed or submitted the run: none of them may approve it. */
  makers: string[];
  makerNames: string[];
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNote?: string;
  reversedBy?: string;
  reversedByName?: string;
  reversedAt?: string;
  reversalReason?: string;
  history: StoredEvent[];
}

export interface StoredInstruction {
  id: string;
  ref: string;
  runId: string;
  legalEntityId: string;
  state: PayInstructionState;
  lines: Array<{ employeeId: string; employeeName: string; method: PayMethod; account?: string; amount: Money }>;
  held: Array<{ employeeId: string; employeeName: string; amount: Money; reason: 'bank_unverified' | 'zero_net' }>;
  total: Money;
  preparedBy: string;
  preparedByName: string;
  preparedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  sentByName?: string;
  sentAt?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: StoredEvent[];
}

export interface PayrollState {
  version: typeof PAY_STATE_VERSION;
  counters: Record<string, number>;
  terms: StoredTerms[];
  periods: StoredPeriod[];
  runs: StoredRun[];
  instructions: StoredInstruction[];
  /**
   * Gate S.2b closure (Issue #16, P0-2): a repeated create with the same idempotency key returns what
   * the first one created, only for the exact same request (see `StoredIdempotency`).
   */
  idempotency: Record<string, StoredIdempotency>;
}

/**
 * Gate S.2b closure (Issue #16, P0-1): an event as stored. A person-specific event names the employee
 * it is about, so a reader who cannot see that person never receives it. Read models project events
 * (`views.ts` `projectEvents`); the employee id itself is never returned.
 */
export type StoredEvent = PayEvent & { employeeId?: string };

/** A version as stored, with the employee a person-specific change was about (never returned). */
export type StoredVersion = PayVersion & { aboutId?: string };

/**
 * Gate S.2b closure (Issue #16, P0-2): what an idempotency key was used for. A replay is the same
 * operation, by the same principal, on the same target, with the same normalised input; anything
 * else is refused without saying what the key was used for.
 */
export interface StoredIdempotency {
  op: string;
  principal: string;
  target: string;
  fingerprint: string;
  recordId: string;
}

const PREFIX = { run: ['prn', 'PR'], instruction: ['pdi', 'PD'], bonus: ['pbn', ''] } as const;

/** Next id of a kind ("prn_anr_0001"); an instruction also gets a reference ("ANR-PD-0001"). */
export function nextPay(state: PayrollState, code: string, kind: keyof typeof PREFIX): { id: string; ref: string } {
  const seq = (state.counters[kind] ?? 0) + 1;
  state.counters[kind] = seq;
  const [prefix, ref] = PREFIX[kind];
  return { id: `${prefix}_${code.toLowerCase()}_${pad(seq, 4)}`, ref: ref ? `${code}-${ref}-${pad(seq, 4)}` : '' };
}

/** A period's id and reference come from its month ("ppd_anr_2026_10", "ANR-PP-2026-10"). */
export const periodIds = (code: string, month: string) => ({ id: `ppd_${code.toLowerCase()}_${month.replace('-', '_')}`, ref: `${code}-PP-${month}` });

/** A run's reference: the period's month, and a number when the period has had runs before. */
export const runRef = (code: string, month: string, nth: number) => `${code}-PR-${month}${nth > 1 ? `-${nth}` : ''}`;

export const SABA = { by: 'usr_anr_0004', byName: 'Saba Javed' };

export const ev = (who: { by: string; byName: string }, at: string, action: string, extra: Partial<StoredEvent> = {}): StoredEvent => ({ at, by: who.by, byName: who.byName, action, ...extra });

/** Created on first use, after the HR state it builds on (`seed` calculates the seeded run). */
export function payrollState(ctx: HandlerContext, site: OpsSite, hr: HrState, seed: (state: PayrollState, hr: HrState) => void): PayrollState {
  const make = () => {
    const s = emptyPayroll();
    if (site.code === 'ANR') seed(s, hr);
    return s;
  };
  const state = ctx.demo.section<PayrollState>(PAY_SECTION, make);
  if (state.version !== PAY_STATE_VERSION) Object.assign(state, make());
  return state;
}

export const emptyPayroll = (): PayrollState => ({ version: PAY_STATE_VERSION, counters: {}, terms: [], periods: [], runs: [], instructions: [], idempotency: {} });

const PKR = (amount: string): Money => ({ amount, currency: 'PKR' });

interface Terms {
  basis: PayBasis;
  rate: string;
  allowances?: Partial<Record<PayAllowance, string>>;
  method: PayMethod;
  account?: { last4: string; verified: boolean };
}

/**
 * Fictional pay terms, agreed when payroll started. Newly designed for the demo: they are not
 * inferred from any person, timecard or real wage, and say nothing about legal minimums.
 */
const TERMS: Record<string, Terms> = {
  'Shahid Hussain': { basis: 'monthly', rate: '55000.00', allowances: { conveyance: '3000.00' }, method: 'bank', account: { last4: '0201', verified: true } },
  'Asif Mehmood': { basis: 'monthly', rate: '42000.00', allowances: { conveyance: '2000.00' }, method: 'bank', account: { last4: '0202', verified: true } },
  'Zubair Ahmed': { basis: 'monthly', rate: '40000.00', allowances: { conveyance: '2000.00' }, method: 'cash' },
  'Karim Bakhsh': { basis: 'monthly', rate: '40000.00', allowances: { conveyance: '2000.00' }, method: 'bank', account: { last4: '0204', verified: false } },
  'Nadeem Abbas': { basis: 'monthly', rate: '42000.00', allowances: { conveyance: '2000.00' }, method: 'bank', account: { last4: '0205', verified: true } },
  'Faisal Iqbal': { basis: 'monthly', rate: '40000.00', allowances: { conveyance: '2000.00' }, method: 'cash' },
  'Tariq Javed': { basis: 'daily', rate: '1650.00', method: 'cash' },
  'Naveed Anjum': { basis: 'monthly', rate: '58000.00', allowances: { conveyance: '3000.00' }, method: 'bank', account: { last4: '0208', verified: true } },
  'Waqas Ali': { basis: 'monthly', rate: '48000.00', allowances: { conveyance: '2500.00' }, method: 'bank', account: { last4: '0209', verified: true } },
  'Bilal Khan': { basis: 'monthly', rate: '44000.00', allowances: { conveyance: '2500.00' }, method: 'cash' },
  'Rukhsana Bibi': { basis: 'daily', rate: '1600.00', method: 'cash' },
  'Ghulam Rasool': { basis: 'monthly', rate: '41000.00', method: 'cash' },
  'Imran Qureshi': { basis: 'monthly', rate: '95000.00', allowances: { conveyance: '5000.00', mobile: '2000.00' }, method: 'bank', account: { last4: '0213', verified: true } },
  'Saba Javed': { basis: 'monthly', rate: '72000.00', allowances: { conveyance: '4000.00', mobile: '1500.00' }, method: 'bank', account: { last4: '0214', verified: true } },
  'Javed Akhtar': { basis: 'monthly', rate: '40000.00', allowances: { conveyance: '2000.00' }, method: 'cash' },
};

export const DEMO_BANK = 'Demo Bank (fictional)';
export const PAYROLL_START = '2026-10-15';

/** The fictional pay terms of the HR state's employees (by name; anyone unknown has none). */
export function seedTerms(state: PayrollState, hr: HrState): void {
  const at = pkt(PAYROLL_START, '09:30');
  for (const e of hr.employees) {
    const t = TERMS[e.name];
    if (!t) continue;
    state.terms.push({
      employeeId: e.id,
      from: e.startDate,
      ...(e.endDate ? { to: e.endDate } : {}),
      basis: t.basis,
      rate: PKR(t.rate),
      allowances: Object.entries(t.allowances ?? {}).map(([key, amount]) => ({ key: key as PayAllowance, amount: PKR(amount) })),
      method: t.method,
      ...(t.account ? { account: { bankName: DEMO_BANK, ...t.account } } : {}),
      recordedByName: SABA.byName,
      recordedAt: at,
    });
  }
}

import type { IssuingModel, Money } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';

/**
 * Gate S.3 rentals: the pure rules, table-tested by `rentals.vectors.json` (no state, no clock, no
 * access). Money is held in paisa (bigint) and returned as decimal strings; a percentage is held in
 * basis points (hundredths of a percent), so 50.00 % is 5000 and the shares of a lease add up to
 * exactly 10000.
 */

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
export const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const money = (p: bigint): Money => ({ amount: fromPaisa(p), currency: 'PKR' });
export const paisa = (m: Money | string | undefined): bigint => (m === undefined ? 0n : toPaisa(typeof m === 'string' ? m : m.amount));
export const sum = (values: readonly bigint[]) => values.reduce((s, v) => s + v, 0n);
export const ZERO: Money = { amount: '0.00', currency: 'PKR' };

/** A real calendar day in ISO form ("2026-02-30" is not one). */
export const isDate = (d: unknown): d is string => typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const monthOf = (date: string) => date.slice(0, 7);
export const nextMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 7);
export const firstDay = (month: string) => `${month}-01`;
export const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
/** Whole months from one date to another (1 March → 28 February next year is 12). */
export function termMonths(from: string, to: string): number {
  const end = addDays(to, 1);
  return (Number(end.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(end.slice(5, 7)) - Number(from.slice(5, 7))) + (end.slice(8) >= from.slice(8) ? 0 : -1);
}

/** A share or fee percentage in basis points, or null when it is not a valid percentage. */
export function basisPoints(raw: string): bigint | null {
  const v = raw.trim();
  if (!PERCENT.test(v)) return null;
  const [whole = '0', frac = ''] = v.split('.');
  const bp = BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
  return bp <= 10000n ? bp : null;
}
export const percentText = (bp: bigint) => `${bp / 100n}.${String(bp % 100n).padStart(2, '0')}`;

/** Landlord shares: each above zero, and together exactly 100 %. */
export function sharesValid(shares: readonly string[]): boolean {
  if (shares.length === 0) return false;
  const bps = shares.map(basisPoints);
  if (bps.some((b) => b === null || b <= 0n)) return false;
  return sum(bps as bigint[]) === 10000n;
}

/** An amount's part for a share (rounded half up to the paisa). */
export const shareOf = (amount: bigint, shareBp: bigint) => (amount * shareBp + 5000n) / 10000n;

/** Two inclusive date ranges overlap. */
export const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to;

export interface VersionTerms {
  n: number;
  from: string;
  to: string;
  rent: bigint;
  dueDay: number;
}

export interface ScheduleItem {
  period: string;
  dueDate: string;
  amount: bigint;
  version: number;
}

/**
 * The rent schedule: one line a month, due on the due day, while that day falls inside a version's
 * term and on or before the lease's end (an early termination stops it). No pro-rating: a month whose
 * due day falls outside the term has no line (a fictional demo rule, stated on the screen).
 */
export function schedule(versions: readonly VersionTerms[], end: string): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const v of versions) {
    const stop = v.to < end ? v.to : end;
    for (let m = monthOf(v.from); m <= monthOf(stop); m = nextMonth(m)) {
      const due = `${m}-${String(Math.min(v.dueDay, 28)).padStart(2, '0')}`;
      if (due >= v.from && due <= stop && !out.some((x) => x.period === m)) out.push({ period: m, dueDate: due, amount: v.rent, version: v.n });
    }
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

/** The line of a rent roll for a lease, period and schedule version: its idempotency key. */
export const rentKey = (leaseId: string, period: string, version: number) => `${leaseId}:${period}:v${version}`;

/**
 * The management fee on one settled rent line (agent model only: it is taken from client money the
 * manager holds). Under the principal model the owner's own entity collects; the fee is billed to the
 * owner, never deducted here. Rounded half up to the paisa.
 */
export const feeOn = (settledRent: bigint, feeBp: bigint, model: IssuingModel) => (model === 'agent' && settledRent > 0n ? (settledRent * feeBp + 5000n) / 10000n : 0n);

export interface LedgerInput {
  model: IssuingModel;
  feeBp: bigint;
  opening: bigint;
  /** Only settled source money, bound to evidence: never invoices, approved demands or proofs. */
  settledRent: readonly bigint[];
  settledExpenses: readonly bigint[];
  settledPayouts: readonly bigint[];
}

/**
 * The owner's sub-ledger on a settled basis: closing = opening + settled rent − fee − settled
 * expenses − settled payouts. Approved demands, approved expenses not yet paid, deposits (a liability
 * for the tenant) and payout instructions never enter it. Under the principal model the manager holds
 * no client money for the owner, so nothing is payable by the manager.
 */
export function ledger(input: LedgerInput) {
  const rent = sum(input.settledRent);
  // The fee is worked out per settled rent line (each line keeps its own site and source).
  const fee = sum(input.settledRent.map((x) => feeOn(x, input.feeBp, input.model)));
  const expenses = sum(input.settledExpenses);
  const payouts = sum(input.settledPayouts);
  const closing = input.model === 'principal' ? 0n : input.opening + rent - fee - expenses - payouts;
  return { opening: input.model === 'principal' ? 0n : input.opening, settledRent: rent, fees: fee, settledExpenses: expenses, settledPayouts: payouts, closing };
}

/**
 * What can still be instructed for an owner: the settled closing payable less every instruction that
 * is awaiting approval or approved (an approved instruction reduces neither cash nor the payable, but
 * it must not be instructed twice). Never below zero.
 */
export function availableToInstruct(closing: bigint, pending: readonly bigint[]): bigint {
  const left = closing - sum(pending);
  return left > 0n ? left : 0n;
}

/** An instruction may be prepared for a positive amount no larger than what is available. */
export const instructionAllowed = (amount: bigint, available: bigint) => amount > 0n && amount <= available;

/** A deposit refund can only return deposit money that was evidenced as held, less agreed deductions. */
export function refundable(heldEvidenced: bigint, deductions: bigint): bigint {
  const left = heldEvidenced - deductions;
  return left > 0n ? left : 0n;
}

/** A deposit is capped by the agreement (a number of months of the rent). */
export const depositWithinCap = (deposit: bigint, rent: bigint, maxMonths: number) => deposit >= 0n && deposit <= rent * BigInt(maxMonths);

/**
 * The normalised fingerprint of a request body (Issue #16): keys sorted, strings trimmed, so an
 * idempotent replay matches only the exact same request. Arrays keep their order.
 */
export function fingerprint(input: unknown): string {
  const norm = (v: unknown): unknown => {
    if (typeof v === 'string') return v.trim();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    return v ?? null;
  };
  return JSON.stringify(norm(input ?? {}));
}

import { CASH_NOTES, type BudgetVersionState, type ExpenseState, type FiscalYear, type PaymentState, type SpendCategory } from '@repo/contracts';
import { money, paisa, sum } from '../../society/finance/model';

/**
 * Gate E.8: the pure rules of payables and expenses (plan §6 E.8 "Rules"), golden-tested by
 * `payables.vectors.json` and `budgets.vectors.json`. Money is integer paisa (bigint), never a float;
 * amounts reuse S.1's helpers (`society/finance/model.ts`).
 *
 * - An approved bill is an obligation; a payment instruction never reduces it.
 * - Supplier ledger = approved bills − credit notes − settled payments. In this wave nothing can be
 *   settled (E-18) and no credit note exists, so the API always passes empty lists; the arithmetic is
 *   still tested so the E-18 slice inherits a checked rule (a reversed settlement restores the liability).
 * - Budget vs actual: actual = posted only; approved-but-unposted obligations are a separate column.
 */

export { money, paisa, sum };

/** Accepted amount text: up to nine whole digits and two decimals (the S.1 and S.3 rule). */
export const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const lineTotal = (lines: ReadonlyArray<{ amount: string }>): bigint => sum(lines.map((l) => paisa({ amount: l.amount, currency: 'PKR' })));

/** Which states each action may start from (anything else is a 409 that changes nothing). */
export const BILL_FROM = { submit: ['draft'], approve: ['submitted'], reject: ['submitted'], cancel: ['draft', 'submitted', 'rejected'] } as const;
export const PAYMENT_FROM = { approve: ['prepared'], send: ['approved'], cancel: ['prepared', 'approved'] } as const;
export const EXPENSE_FROM = { submit: ['draft'], approve: ['submitted'], reject: ['submitted'], withdraw: ['draft', 'submitted'] } as const;
export const BUDGET_FROM = { submit: ['draft'], approve: ['submitted'], reject: ['submitted'], withdraw: ['draft', 'submitted'] } as const;

export const can = <A extends string>(table: Readonly<Record<A, readonly string[]>>, action: A, state: string) => table[action].includes(state);

/** Instructions that are still live (a cancelled one frees its amount again). */
export const LIVE_PAYMENTS: readonly PaymentState[] = ['prepared', 'approved', 'sent_simulated'];

export function instructedOn(payments: ReadonlyArray<{ billId: string; state: PaymentState; amount: string }>, billId: string): bigint {
  return sum(payments.filter((p) => p.billId === billId && LIVE_PAYMENTS.includes(p.state)).map((p) => paisa({ amount: p.amount, currency: 'PKR' })));
}

/** What may still be instructed on a bill: only an approved bill, its total less live instructions (never below zero). */
export function instructable(bill: { id: string; state: string; lines: ReadonlyArray<{ amount: string }> }, payments: ReadonlyArray<{ billId: string; state: PaymentState; amount: string }>): bigint {
  if (bill.state !== 'approved') return 0n;
  const left = lineTotal(bill.lines) - instructedOn(payments, bill.id);
  return left > 0n ? left : 0n;
}

export interface LedgerBill {
  id: string;
  ref: string;
  date: string;
  state: string;
  total: string;
}
export interface LedgerReduction {
  id: string;
  ref: string;
  date: string;
  amount: string;
  /** A settlement later reversed no longer reduces what is owed (the liability is restored). */
  reversed?: boolean;
}

export interface LedgerLine {
  date: string;
  kind: 'bill' | 'credit_note' | 'settled_payment';
  ref: string;
  id: string;
  obligation?: bigint;
  reduction?: bigint;
  balance: bigint;
}

/**
 * The derived supplier ledger: approved bills add, credit notes and settled payments reduce, in date order
 * (bills first on the same day). Drafts, submitted, rejected and cancelled bills are not obligations.
 */
export function supplierLedger(bills: readonly LedgerBill[], creditNotes: readonly LedgerReduction[] = [], settled: readonly LedgerReduction[] = []): { lines: LedgerLine[]; balance: bigint } {
  type Entry = { date: string; order: number; kind: LedgerLine['kind']; ref: string; id: string; obligation?: bigint; reduction?: bigint };
  const entries: Entry[] = [
    ...bills.filter((b) => b.state === 'approved').map((b): Entry => ({ date: b.date, order: 0, kind: 'bill', ref: b.ref, id: b.id, obligation: paisa({ amount: b.total, currency: 'PKR' }) })),
    ...creditNotes.filter((c) => !c.reversed).map((c): Entry => ({ date: c.date, order: 1, kind: 'credit_note', ref: c.ref, id: c.id, reduction: paisa({ amount: c.amount, currency: 'PKR' }) })),
    ...settled.filter((s) => !s.reversed).map((s): Entry => ({ date: s.date, order: 2, kind: 'settled_payment', ref: s.ref, id: s.id, reduction: paisa({ amount: s.amount, currency: 'PKR' }) })),
  ];
  entries.sort((a, b) => (a.date === b.date ? a.order - b.order || a.ref.localeCompare(b.ref) : a.date < b.date ? -1 : 1));
  let balance = 0n;
  const lines = entries.map((e): LedgerLine => {
    balance += (e.obligation ?? 0n) - (e.reduction ?? 0n);
    return { date: e.date, kind: e.kind, ref: e.ref, id: e.id, ...(e.obligation !== undefined ? { obligation: e.obligation } : {}), ...(e.reduction !== undefined ? { reduction: e.reduction } : {}), balance };
  });
  return { lines, balance };
}

/** A petty-cash count: the notes counted, each times its face value. Counts must be whole and not negative. */
export function countTotal(notes: Readonly<Record<string, number>>): bigint {
  return sum(CASH_NOTES.map((n) => BigInt(Math.trunc(notes[n] ?? 0)) * BigInt(n) * 100n));
}

export const validNotes = (notes: Readonly<Record<string, unknown>>) =>
  Object.keys(notes).every((k) => (CASH_NOTES as readonly string[]).includes(k)) && Object.values(notes).every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000);

/** The fiscal year of a date (July–June), e.g. 2026-10-26 → FY2026-27. */
export function fiscalYearOf(date: string): FiscalYear | undefined {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  const fy = `FY${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  return fy as FiscalYear;
}

export const fiscalYearBounds = (year: FiscalYear) => {
  const start = Number(year.slice(2, 6));
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
};

/** The one approved version of a budget (approving a new version supersedes the old one). */
export function approvedVersion<V extends { n: number; state: BudgetVersionState }>(versions: readonly V[]): V | undefined {
  return versions.filter((v) => v.state === 'approved').sort((a, b) => b.n - a.n)[0];
}

/** The open version (draft or submitted): at most one at a time. */
export const openVersion = <V extends { state: BudgetVersionState }>(versions: readonly V[]): V | undefined => versions.find((v) => v.state === 'draft' || v.state === 'submitted');

export interface BvaInput {
  /** The approved version's lines (drafts, submitted, rejected and superseded versions never count). */
  budget: ReadonlyArray<{ category: SpendCategory; amount: string }>;
  /** Posted actuals by category. Nothing is posted in this wave, so the API passes none. */
  posted: ReadonlyArray<{ category: SpendCategory; amount: string }>;
  /** Approved bills' lines and approved expenses not posted, by category: a separate column, never actual. */
  approvedNotPosted: ReadonlyArray<{ category: SpendCategory; amount: string }>;
}

export interface BvaLine {
  category: SpendCategory;
  budget: bigint;
  actualPosted: bigint;
  approvedNotPosted: bigint;
  remaining: bigint;
}

const byCategory = (rows: ReadonlyArray<{ category: SpendCategory; amount: string }>) => {
  const m = new Map<SpendCategory, bigint>();
  for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0n) + paisa({ amount: r.amount, currency: 'PKR' }));
  return m;
};

/**
 * Budget vs actual per category: every budgeted category, plus any category with posted or approved spend
 * that the budget does not name (budget 0). Remaining = budget − posted actual (approved-not-posted is
 * shown but does not reduce it: it is not an actual).
 */
export function budgetVsActual(input: BvaInput): { rows: BvaLine[]; totals: Omit<BvaLine, 'category'> } {
  const b = byCategory(input.budget);
  const p = byCategory(input.posted);
  const a = byCategory(input.approvedNotPosted);
  const cats = [...new Set([...b.keys(), ...p.keys(), ...a.keys()])];
  const rows = cats.map((category): BvaLine => {
    const budget = b.get(category) ?? 0n;
    const actualPosted = p.get(category) ?? 0n;
    return { category, budget, actualPosted, approvedNotPosted: a.get(category) ?? 0n, remaining: budget - actualPosted };
  });
  const totals = rows.reduce((t, r) => ({ budget: t.budget + r.budget, actualPosted: t.actualPosted + r.actualPosted, approvedNotPosted: t.approvedNotPosted + r.approvedNotPosted, remaining: t.remaining + r.remaining }), { budget: 0n, actualPosted: 0n, approvedNotPosted: 0n, remaining: 0n });
  return { rows, totals };
}

/** An expense counts towards spend only once approved (a draft, submission, rejection or withdrawal never does). */
export const isObligation = (state: ExpenseState | string) => state === 'approved';

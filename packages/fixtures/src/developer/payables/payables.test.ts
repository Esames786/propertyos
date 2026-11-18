import type { BudgetVersionState, FiscalYear, PaymentState, SpendCategory } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import budgets from './budgets.vectors.json';
import vectors from './payables.vectors.json';
import { approvedVersion, BILL_FROM, budgetVsActual, can, countTotal, EXPENSE_FROM, fiscalYearBounds, fiscalYearOf, instructable, money, openVersion, PAYMENT_FROM, supplierLedger, validNotes } from './rules';

/** Gate E.8 golden vectors: the pure rules behind payables and budgets (`rules.ts`). */
const amt = (p: bigint) => money(p).amount;

describe('payables.vectors.json', () => {
  it('state transitions: each action starts only from its states', () => {
    for (const v of vectors.transitions.bill) expect(can(BILL_FROM, v.action as keyof typeof BILL_FROM, v.from), `bill ${v.action} from ${v.from}`).toBe(v.allowed);
    for (const v of vectors.transitions.payment) expect(can(PAYMENT_FROM, v.action as keyof typeof PAYMENT_FROM, v.from), `payment ${v.action} from ${v.from}`).toBe(v.allowed);
    for (const v of vectors.transitions.expense) expect(can(EXPENSE_FROM, v.action as keyof typeof EXPENSE_FROM, v.from), `expense ${v.action} from ${v.from}`).toBe(v.allowed);
  });

  it('what may still be instructed on a bill', () => {
    for (const v of vectors.instructable) {
      const bill = { id: 'b', state: v.bill.state, lines: v.bill.lines.map((amount) => ({ amount })) };
      const payments = v.payments.map((p) => ({ billId: 'b', state: p.state as PaymentState, amount: p.amount }));
      expect(amt(instructable(bill, payments)), v.name).toBe(v.expected);
    }
  });

  it('the supplier ledger: approved bills − credit notes − settled payments, a reversal restores the liability', () => {
    for (const v of vectors.ledger) {
      const r = supplierLedger(v.bills, v.creditNotes, v.settled);
      expect(amt(r.balance), v.name).toBe(v.balance);
      expect(r.lines.map((l) => l.kind), v.name).toEqual(v.kinds);
      expect(r.lines.map((l) => amt(l.balance)), v.name).toEqual(v.running);
    }
  });

  it('petty-cash counts: notes × face value, whole non-negative counts of known notes only', () => {
    for (const v of vectors.counts) expect(amt(countTotal(v.notes as Record<string, number>)), v.name).toBe(v.total);
    for (const n of vectors.invalidNotes) expect(validNotes(n as Record<string, unknown>), JSON.stringify(n)).toBe(false);
    expect(validNotes({ '5000': 2, '10': 0 })).toBe(true);
  });

  it('settlement rules are deferred to E-18, with a reason each', () => {
    for (const d of vectors.deferred) expect(d.why).toMatch(/E-18/);
  });
});

describe('budgets.vectors.json', () => {
  it('only the approved version governs; one open version at most', () => {
    for (const v of budgets.versions) {
      const versions = v.versions.map((x) => ({ n: x.n, state: x.state as BudgetVersionState }));
      expect(approvedVersion(versions)?.n ?? null, v.name).toBe(v.approved);
      expect(openVersion(versions)?.n ?? null, v.name).toBe(v.open);
    }
  });

  it('budget vs actual: actual = posted only; approved-not-posted apart; remaining = budget − posted', () => {
    for (const v of budgets.bva) {
      const cast = (rows: Array<{ category: string; amount: string }>) => rows.map((r) => ({ category: r.category as SpendCategory, amount: r.amount }));
      const r = budgetVsActual({ budget: cast(v.budget), posted: cast(v.posted), approvedNotPosted: cast(v.approvedNotPosted) });
      expect(r.rows.map((x) => ({ category: x.category, budget: amt(x.budget), actualPosted: amt(x.actualPosted), approvedNotPosted: amt(x.approvedNotPosted), remaining: amt(x.remaining) })), v.name).toEqual(v.rows);
      expect({ budget: amt(r.totals.budget), actualPosted: amt(r.totals.actualPosted), approvedNotPosted: amt(r.totals.approvedNotPosted), remaining: amt(r.totals.remaining) }, v.name).toEqual(v.totals);
    }
  });

  it('fiscal years run July to June', () => {
    for (const v of budgets.fiscalYears) expect(fiscalYearOf(v.date), v.date).toBe(v.year);
    for (const v of budgets.bounds) expect(fiscalYearBounds(v.year as FiscalYear)).toEqual({ from: v.from, to: v.to });
  });
});
